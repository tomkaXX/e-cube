#!/usr/bin/env python3
"""
Calibrate the Swiss PFC 2035 model on historical data.

Two data paths:
  1. ENTSO-E Transparency Platform (needs a free API token):
        export ENTSOE_API_KEY=...
        python calibrate.py --start 2023-01-01 --end 2025-01-01 --fuel fuel_prices.csv
  2. A prepared hourly CSV (any source) with the columns listed in HOURLY_COLUMNS:
        python calibrate.py --from-csv my_hourly_data.csv --fuel fuel_prices.csv

What is fitted (written to ../src/model/calibration.json, read by the web app):
  * meritOrder.points      price multipliers of the regional merit-order curve
                           (piecewise-linear in the regional residual-load share x)
  * coupling.*             Swiss premium vs. region, import/export decoupling slopes
  * hydro.*Monthly         monthly release shapes of storage and run-of-river hydro
  * historicalImportance   gradient-boosting permutation importance of the drivers
                           of the Swiss day-ahead price (answers "what shapes the curve?")

fuel_prices.csv: columns date,gas_eur_mwh,co2_eur_t (daily or monthly rows; forward-filled).
Without it, constant gas/CO2 (--gas/--co2, default 2024 averages-ish 34 / 65) are used,
which is only reasonable for a single-year fit.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
CALIB_PATH = HERE.parent / "src" / "model" / "calibration.json"
CACHE_DIR = HERE / "data"

# Hourly table used for fitting (all power in MW, prices in EUR/MWh)
HOURLY_COLUMNS = {
    "price_ch": "Swiss day-ahead price",
    "price_de": "DE-LU day-ahead price",
    "price_fr": "FR day-ahead price",
    "price_it": "IT-North day-ahead price",
    "load_ch": "Swiss load",
    "solar_ch": "Swiss solar generation",
    "wind_ch": "Swiss wind generation",
    "nuclear_ch": "Swiss nuclear generation",
    "ror_ch": "Swiss run-of-river generation",
    "reservoir_ch": "Swiss reservoir + pumped-storage generation (optional)",
    "load_reg": "Load DE+FR+IT",
    "solar_reg": "Solar DE+FR+IT",
    "wind_reg": "Wind (on+offshore) DE+FR+IT",
    "nuclear_reg": "Nuclear DE+FR+IT",
    "hydro_reg": "Hydro DE+FR+IT",
    "flow_ch_it": "Physical flow CH->IT (optional, transit proxy)",
}

REGION = {"DE": "DE_LU", "FR": "FR", "IT": "IT_NORD"}


# --------------------------------------------------------------------------- data
def _gen_sum(df: pd.DataFrame, keywords: list[str]) -> pd.Series:
    """Sum generation columns whose name contains any keyword (entsoe-py MultiIndex aware)."""
    if isinstance(df.columns, pd.MultiIndex):
        # keep 'Actual Aggregated' only
        df = df.xs("Actual Aggregated", axis=1, level=1, drop_level=True) if "Actual Aggregated" in df.columns.get_level_values(1) else df.droplevel(1, axis=1)
    cols = [c for c in df.columns if any(k.lower() in str(c).lower() for k in keywords)]
    if not cols:
        return pd.Series(0.0, index=df.index)
    return df[cols].sum(axis=1, min_count=1).fillna(0.0)


def fetch_entsoe(start: str, end: str) -> pd.DataFrame:
    try:
        from entsoe import EntsoePandasClient
    except ImportError:
        sys.exit("pip install entsoe-py  (see requirements.txt)")
    key = os.environ.get("ENTSOE_API_KEY")
    if not key:
        sys.exit("Set ENTSOE_API_KEY (free token: transparency.entsoe.eu -> My account -> Web API security token)")
    client = EntsoePandasClient(api_key=key)
    tz = "Europe/Zurich"
    s, e = pd.Timestamp(start, tz=tz), pd.Timestamp(end, tz=tz)
    CACHE_DIR.mkdir(exist_ok=True)

    def cached(name, fn):
        f = CACHE_DIR / f"{name}_{start}_{end}.pkl"
        if f.exists():
            return pd.read_pickle(f)
        print(f"  fetching {name} ...", flush=True)
        obj = fn()
        pd.to_pickle(obj, f)
        return obj

    hourly = lambda x: x.tz_convert(tz).resample("1h").mean()  # noqa: E731 (15-min -> hourly)
    out = pd.DataFrame()
    out["price_ch"] = hourly(cached("price_CH", lambda: client.query_day_ahead_prices("CH", start=s, end=e)))
    for c, code in REGION.items():
        out[f"price_{c.lower()}"] = hourly(cached(f"price_{c}", lambda code=code: client.query_day_ahead_prices(code, start=s, end=e)))

    load_ch = cached("load_CH", lambda: client.query_load("CH", start=s, end=e))
    out["load_ch"] = hourly(load_ch.iloc[:, 0] if isinstance(load_ch, pd.DataFrame) else load_ch)
    gen_ch = hourly(cached("gen_CH", lambda: client.query_generation("CH", start=s, end=e)))
    out["solar_ch"] = _gen_sum(gen_ch, ["Solar"])
    out["wind_ch"] = _gen_sum(gen_ch, ["Wind"])
    out["nuclear_ch"] = _gen_sum(gen_ch, ["Nuclear"])
    out["ror_ch"] = _gen_sum(gen_ch, ["Run-of-river"])
    out["reservoir_ch"] = _gen_sum(gen_ch, ["Water Reservoir", "Pumped Storage"])

    loads, sol, win, nuc, hyd = [], [], [], [], []
    for c, code in REGION.items():
        area = "IT" if c == "IT" else code  # IT load/generation is published per country, not per bidding zone
        ld = cached(f"load_{c}", lambda area=area: client.query_load(area, start=s, end=e))
        loads.append(hourly(ld.iloc[:, 0] if isinstance(ld, pd.DataFrame) else ld))
        g = hourly(cached(f"gen_{c}", lambda area=area: client.query_generation(area, start=s, end=e)))
        sol.append(_gen_sum(g, ["Solar"]))
        win.append(_gen_sum(g, ["Wind"]))
        nuc.append(_gen_sum(g, ["Nuclear"]))
        hyd.append(_gen_sum(g, ["Hydro"]))
    out["load_reg"] = sum(loads)
    out["solar_reg"] = sum(sol)
    out["wind_reg"] = sum(win)
    out["nuclear_reg"] = sum(nuc)
    out["hydro_reg"] = sum(hyd)
    try:
        f = cached("flow_CH_IT", lambda: client.query_crossborder_flows("CH", "IT_NORD", start=s, end=e))
        out["flow_ch_it"] = hourly(f)
    except Exception as exc:  # optional
        print(f"  (no CH->IT flows: {exc})")
    return out


def load_fuel(path: str | None, index: pd.DatetimeIndex, gas: float, co2: float) -> pd.DataFrame:
    if not path:
        return pd.DataFrame({"gas": gas, "co2": co2}, index=index)
    f = pd.read_csv(path, parse_dates=["date"]).set_index("date").sort_index()
    f = f.rename(columns={"gas_eur_mwh": "gas", "co2_eur_t": "co2"})[["gas", "co2"]]
    f.index = f.index.tz_localize(index.tz) if f.index.tz is None else f.index.tz_convert(index.tz)
    return f.reindex(f.index.union(index)).ffill().bfill().reindex(index)


# --------------------------------------------------------------------------- fitting
def srmc(gas, co2, mo):
    ccgt = (gas + co2 * mo["emissionFactor"]) / mo["ccgtEfficiency"] + mo["ccgtVom"]
    ocgt = (gas + co2 * mo["emissionFactor"]) / mo["ocgtEfficiency"] + mo["ocgtVom"]
    return ccgt, ocgt


def hat_basis(x: np.ndarray, knots: list[float]) -> np.ndarray:
    """Piecewise-linear interpolation basis (one 'hat' per knot, flat beyond the ends)."""
    x = np.clip(x, knots[0], knots[-1])
    B = np.zeros((len(x), len(knots)))
    for k in range(len(knots)):
        if k > 0:
            m = (x >= knots[k - 1]) & (x <= knots[k])
            B[m, k] = (x[m] - knots[k - 1]) / (knots[k] - knots[k - 1])
        if k < len(knots) - 1:
            m = (x >= knots[k]) & (x < knots[k + 1])
            B[m, k] = (knots[k + 1] - x[m]) / (knots[k + 1] - knots[k])
    B[x >= knots[-1], -1] = 1.0
    return B


def fit_merit_order(df: pd.DataFrame, calib: dict, neg_floor: float) -> tuple[list, float]:
    from scipy.optimize import lsq_linear

    mo = calib["meritOrder"]
    knots = [p[0] for p in mo["points"]]
    kinds = [p[1] for p in mo["points"]]
    ccgt, ocgt = srmc(df["gas"].values, df["co2"].values, mo)
    scale = np.column_stack([
        np.full(len(df), neg_floor) if k == "floor" else np.ones(len(df)) if k == "abs" else ccgt if k == "ccgt" else ocgt
        for k in kinds
    ])
    A = hat_basis(df["x_reg"].values, knots) * scale
    y = df["price_reg"].values
    lo = np.array([0.0 if k == "floor" else -50 if k == "abs" else 0.05 for k in kinds])
    hi = np.array([3.0 if k == "floor" else 50 if k == "abs" else 4.0 for k in kinds])
    res = lsq_linear(A, y, bounds=(lo, hi))
    pred = A @ res.x
    r2 = 1 - np.sum((y - pred) ** 2) / np.sum((y - y.mean()) ** 2)
    points = [[knots[i], kinds[i], round(float(res.x[i]), 4)] for i in range(len(knots))]
    return points, float(r2)


def fit_coupling(df: pd.DataFrame, calib: dict, import_cap: float, export_cap: float) -> dict:
    cp = dict(calib["coupling"])
    spread = df["price_ch"] - df["price_reg_model"]
    n = df["net_import_gw"]
    transit = df["transit_gw"] if "transit_gw" in df else 0.0
    over_imp = np.maximum(0, n - (import_cap - transit))
    over_exp = np.maximum(0, -n - export_cap)
    base_mask = (over_imp == 0) & (over_exp == 0)
    cp["swissPremium"] = round(float(np.median(spread[base_mask])), 2)
    resid = spread - cp["swissPremium"]
    if (over_imp > 0).sum() > 50:
        cp["importSlope"] = round(float(np.clip(np.sum(resid * over_imp) / np.sum(over_imp ** 2), 2, 80)), 2)
    if (over_exp > 0).sum() > 50:
        cp["exportSlope"] = round(float(np.clip(-np.sum(resid * over_exp) / np.sum(over_exp ** 2), 2, 80)), 2)
    if "flow_ch_it" in df:
        m = df.index.month
        winter = df["flow_ch_it"][(m <= 2) | (m == 12)].mean() / 1000
        summer = df["flow_ch_it"][(m >= 6) & (m <= 8)].mean() / 1000
        # transit = share of CH->IT flow not explained by Swiss net exports
        cp["transitWinterGW"] = round(float(np.clip(winter * 0.4, 0, 4)), 2)
        cp["transitSummerGW"] = round(float(np.clip(summer * 0.2, 0, 4)), 2)
    return cp


def fit_hydro(df: pd.DataFrame, calib: dict) -> dict:
    hy = dict(calib["hydro"])
    m = df.index.month
    if df.get("reservoir_ch") is not None and df["reservoir_ch"].sum() > 0:
        s = df["reservoir_ch"].groupby(m).sum()
        hy["storageMonthly"] = [round(float(v), 4) for v in (s / s.sum()).reindex(range(1, 13)).fillna(1 / 12)]
    s = df["ror_ch"].groupby(m).sum()
    if s.sum() > 0:
        hy["rorMonthly"] = [round(float(v), 4) for v in (s / s.sum()).reindex(range(1, 13)).fillna(1 / 12)]
    return hy


def feature_importance(df: pd.DataFrame) -> dict:
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.inspection import permutation_importance

    feats = {
        "Neighbour residual load": df["x_reg"],
        "Gas price": df["gas"],
        "CO₂ price": df["co2"],
        "Swiss load": df["load_ch"],
        "Swiss solar": df["solar_ch"],
        "Swiss nuclear": df["nuclear_ch"],
        "Swiss run-of-river": df["ror_ch"],
        "Neighbour solar": df["solar_reg"],
        "Neighbour wind": df["wind_reg"],
        "Neighbour nuclear": df["nuclear_reg"],
        "Hour of day": pd.Series(df.index.hour, index=df.index),
        "Day type (weekday/weekend)": pd.Series((df.index.dayofweek >= 5).astype(int), index=df.index),
        "Month": pd.Series(df.index.month, index=df.index),
    }
    if "flow_ch_it" in df:
        feats["CH→IT flow (transit)"] = df["flow_ch_it"]
    X = pd.DataFrame(feats).astype(float)
    y = df["price_ch"].astype(float)
    ok = X.notna().all(axis=1) & y.notna()
    X, y = X[ok], y[ok]
    split = int(len(X) * 0.8)  # chronological split: test = most recent 20 %
    model = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, max_leaf_nodes=31, random_state=0)
    model.fit(X.iloc[:split], y.iloc[:split])
    r2 = model.score(X.iloc[split:], y.iloc[split:])
    pi = permutation_importance(model, X.iloc[split:], y.iloc[split:], n_repeats=5, random_state=0)
    imp = np.maximum(pi.importances_mean, 0)
    imp = imp / imp.sum() if imp.sum() > 0 else imp
    items = sorted(({"feature": c, "importance": round(float(v), 4)} for c, v in zip(X.columns, imp)), key=lambda d: -d["importance"])
    return {
        "period": f"{df.index.min():%Y-%m} – {df.index.max():%Y-%m}",
        "r2": round(float(r2), 3),
        "items": items[:10],
    }


# --------------------------------------------------------------------------- main
def prepare(df: pd.DataFrame, fuel: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    missing = [c for c in ["price_ch", "price_de", "price_fr", "price_it", "load_ch", "load_reg", "solar_reg", "wind_reg", "nuclear_reg", "hydro_reg"] if c not in df]
    if missing:
        sys.exit(f"missing columns: {missing}")
    for c in ["solar_ch", "wind_ch", "nuclear_ch", "ror_ch", "reservoir_ch"]:
        if c not in df:
            df[c] = 0.0
    df = df.join(fuel)
    w = {"de": 0.45, "fr": 0.35, "it": 0.20}  # demand weights of the coupled region
    df["price_reg"] = sum(df[f"price_{k}"] * v for k, v in w.items())
    mean_load = df["load_reg"].mean()
    df["x_reg"] = (df["load_reg"] - df["solar_reg"] - df["wind_reg"] - df["nuclear_reg"] - df["hydro_reg"]) / mean_load
    # Swiss net import need (GW) before dispatchable hydro, as in the web model
    df["net_import_gw"] = (df["load_ch"] - df["solar_ch"] - df["wind_ch"] - df["nuclear_ch"] - df["ror_ch"] - df["reservoir_ch"]) / 1000
    return df.dropna(subset=["price_ch", "price_reg", "x_reg", "gas", "co2"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", default="2023-01-01")
    ap.add_argument("--end", default="2025-01-01")
    ap.add_argument("--from-csv", help="hourly CSV with a 'timestamp' column + HOURLY_COLUMNS")
    ap.add_argument("--save-csv", help="also save the assembled hourly table here")
    ap.add_argument("--fuel", help="CSV with date,gas_eur_mwh,co2_eur_t")
    ap.add_argument("--gas", type=float, default=34.0)
    ap.add_argument("--co2", type=float, default=65.0)
    ap.add_argument("--neg-floor", type=float, default=-60.0, help="negative-price floor of the fit period")
    ap.add_argument("--import-cap", type=float, default=6.5, help="net import capacity of the fit period (GW)")
    ap.add_argument("--export-cap", type=float, default=6.0, help="net export capacity of the fit period (GW)")
    ap.add_argument("--out", default=str(CALIB_PATH))
    ap.add_argument("--no-ml", action="store_true", help="skip the gradient-boosting importance")
    args = ap.parse_args()

    if args.from_csv:
        raw = pd.read_csv(args.from_csv, parse_dates=["timestamp"]).set_index("timestamp")
        if raw.index.tz is None:
            raw.index = raw.index.tz_localize("Europe/Zurich", ambiguous="NaT", nonexistent="NaT")
            raw = raw[raw.index.notna()]
    else:
        print(f"Fetching ENTSO-E data {args.start} .. {args.end}")
        raw = fetch_entsoe(args.start, args.end)
    if args.save_csv:
        raw.reset_index(names="timestamp").to_csv(args.save_csv, index=False)

    fuel = load_fuel(args.fuel, raw.index, args.gas, args.co2)
    df = prepare(raw, fuel)
    print(f"{len(df):,} hourly rows, {df.index.min()} .. {df.index.max()}")

    calib = json.loads(Path(args.out).read_text(encoding="utf-8")) if Path(args.out).exists() else json.loads(CALIB_PATH.read_text(encoding="utf-8"))

    points, r2_mo = fit_merit_order(df, calib, args.neg_floor)
    calib["meritOrder"]["points"] = points
    print(f"merit order fitted, R² on regional price = {r2_mo:.3f}")

    knots = [p[0] for p in points]
    ccgt, ocgt = srmc(df["gas"].values, df["co2"].values, calib["meritOrder"])
    scale = np.column_stack([
        np.full(len(df), args.neg_floor) if p[1] == "floor" else np.ones(len(df)) if p[1] == "abs" else ccgt if p[1] == "ccgt" else ocgt
        for p in points
    ])
    df["price_reg_model"] = (hat_basis(df["x_reg"].values, knots) * scale) @ np.array([p[2] for p in points])
    if "flow_ch_it" in df:
        m = df.index.month
        df["transit_gw"] = np.where((m <= 3) | (m >= 10), calib["coupling"]["transitWinterGW"], calib["coupling"]["transitSummerGW"])
    calib["coupling"] = fit_coupling(df, calib, args.import_cap, args.export_cap)
    calib["hydro"] = fit_hydro(df, calib)

    if not args.no_ml:
        print("training gradient-boosting model for driver importance ...")
        calib["historicalImportance"] = feature_importance(df)
        print(f"  out-of-sample R² = {calib['historicalImportance']['r2']}")

    calib["fitted"] = True
    calib["fittedOn"] = f"{df.index.min():%Y-%m-%d} – {df.index.max():%Y-%m-%d}, fitted {dt.date.today().isoformat()}"
    calib["_comment"] = "Fitted by model/calibrate.py. Re-run to update; the web app reads this file at build time."
    Path(args.out).write_text(json.dumps(calib, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
