# Swiss PFC 2035 — hourly Price Forward Curve model

Interactive web application that estimates the **hourly Swiss day-ahead price curve (PFC) for 2035**, shows how its shape changes compared with 2024, and quantifies how sensitive it is to its drivers (PV deployment, nuclear, hydro, flexibility, cross-border capacity, neighbouring markets, gas & CO₂).

**Live app:** https://tomkaXX.github.io/e-cube
```
cd .\e-cube
npm install
npm run dev
```

<img width="1841" height="1038" alt="image" src="https://github.com/user-attachments/assets/852c1821-7669-4045-82af-2dabe6078904" />


The model runs entirely in the browser (in a Web Worker), so every slider recomputes the full 8,760-hour curve in about 0.1 s and the app can be hosted for free on GitHub Pages.

## What's in the app

| Tab | Content |
|---|---|
| Overview | KPI tiles (baseload, peak, summer midday, winter evening, PV capture rate, negative hours, volatility) vs. 2024 with weather P10–P90; daily PFC chart with intra-day range; monthly baseload; price duration curve |
| Curve shape | Month × hour heat maps (2035 vs. 2024), seasonal daily profiles with weather bands |
| Fundamentals | Hourly supply stack vs. demand for any week, Swiss vs. neighbour price, annual energy balance, driver attribution |
| Sensitivity | Tornado chart for any KPI (12 parameters moved down/up), standardised driver regression, historical ML feature importance (after calibration) |
| PV target | Full model re-run for PV volumes from 8 to 50 TWh: baseload, capture price/rate, summer midday, winter evening, negative hours, net exports |
| Method & assumptions | Short answers to the research questions, methodology, assumption table, merit-order curve, data sources, limitations |

Scenario presets: 2035 central, slow PV (18.7 TWh), high PV (40 TWh), no CH-EU agreement, gas crisis, 2024 reference. All 25 parameters are adjustable, and the hourly result can be downloaded as CSV.

## Model in short

1. **Weather year** (7 seeded synthetic years): PV from solar geometry × daily clearness (with Plateau winter fog), wind (synoptic AR(1)), temperature, hydrology.
2. **Swiss fundamentals**: demand (base + heat pumps + e-mobility), PV with feed-in limit, wind, biomass, nuclear with summer revision, run-of-river, storage hydro budget (with optional summer→winter shift).
3. **Neighbour region (DE/FR/IT/AT)**: residual-load share → price through a calibrated piecewise-linear **merit-order curve** anchored on CCGT/OCGT short-run marginal cost `(gas + CO₂·0.202)/η + VOM`.
4. **Coupling**: Swiss net import need shifts the regional residual load; beyond import capacity (minus Italian transit) a scarcity premium applies; beyond export capacity the Swiss price decouples downwards.
5. **Flexibility dispatch**: storage hydro by weekly water value; pumped storage, batteries and demand-side flexibility by daily price arbitrage; iterated with prices.

Why fundamental and not pure ML: 2035 is outside the historical feature space (4–5× today's PV, no Beznau, a different neighbour mix), so a regression trained on 2015–2024 cannot extrapolate. ML is used where it is reliable, on historical data, to calibrate the curve and rank the drivers (`model/calibrate.py`).

## Project structure

```
src/
  model/
    pfc.js            hourly model, KPIs, aggregations, driver regression
    scenarios.js      parameters, presets, sensitivity definitions
    weather.js        synthetic weather years (seeded)
    calendar.js       2035 calendar, holidays, DST
    calibration.json  merit-order / coupling / hydro calibration (written by calibrate.py)
    worker.js         Web Worker entry (runs, weather bands, sensitivities, PV sweep)
  components/         React views (Recharts + custom SVG)
model/
  calibrate.py        ENTSO-E download + calibration + gradient-boosting importance
  requirements.txt
scripts/check-model.mjs  quick sanity run of all presets in Node
```

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev          # http://localhost:5173/e-cube/
npm run test:model   # prints KPIs of every preset
```

## Deploy to GitHub Pages

Uses the [`gh-pages`](https://github.com/tschaub/gh-pages) package, as in [react-gh-pages](https://github.com/gitname/react-gh-pages):

```bash
npm run deploy       # builds to dist/ and pushes it to the gh-pages branch
```

Then, once, on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `gh-pages` / `(root)`**.

If you rename the repository or account, update `homepage` in `package.json` and `base` in `vite.config.js` (`/<repo-name>/`).

## Calibrate on real data (ENTSO-E)

The shipped `calibration.json` is hand-tuned to typical 2023–2024 Swiss patterns (2024 reference ≈ 80 €/MWh baseload). To fit it on real data:

```bash
cd model
pip install -r requirements.txt
export ENTSOE_API_KEY=<token>     # free: transparency.entsoe.eu → My account settings → Web API security token
python calibrate.py --start 2023-01-01 --end 2025-01-01 --fuel fuel_prices.csv --save-csv data/hourly.csv
cd .. && npm run deploy
```

`fuel_prices.csv` needs the columns `date,gas_eur_mwh,co2_eur_t` (daily or monthly TTF and EUA prices). Without it, constant `--gas/--co2` values are used, which is only sensible for a single-year fit. Any other hourly data source works through `--from-csv` (column list in `calibrate.py`).

The script fits the merit-order multipliers, the Swiss premium and decoupling slopes, the monthly hydro shapes, and trains a gradient-boosting model whose permutation importance then appears in the Sensitivity tab.

## Limitations

- Neighbours are aggregated into one price zone; flow-based coupling and FR/DE/IT spreads are not modelled explicitly.
- Daily arbitrage ignores intra-day state-of-charge order; storage hydro uses a weekly water value.
- Weather years are synthetic; use reanalysis data (ERA5, renewables.ninja) for production work.
- Hourly resolution (15-minute products would need intra-hour ramps).

Results are scenario projections, not price forecasts or investment advice.

---

## Challenge description — E-Cube: Swiss PFC 2035
**Partner**: external pageE-CUBE Strategy Consultants
**Contacts**: Bruno Meuriot, Nicolas Charton

#### General Description and Problem Formulation
The electricity Spot price is determined on a daily basis, in a day-ahead auction process. For portfolio management and hedging purposes, market actors must rely on a “Price Forward Curve” (PFC), that corresponds to the best estimation of the  Spot price formation in the long term (usually 3 – 5 years ahead but also up to 10 – 20 years).
Historically, the Swiss Spot price curve has been mainly influenced by the demand, the nuclear and hydro production, and by the available import/export capacities with the neighboring countries FR, DE and IT (“transit”).
The development of renewable capacities (in particular PV in Switzerland) but also development of decentralized flexibility (batteries, demand-side management, PV injection management …) has an influence on the shape of the Spot prices, and thus on the PFCs used by market actors. For them, the challenge is to estimate as accurately as possible the future Spot curve shape, in order to do the right hedging decisions or investment decisions in production or flexibility assets.
We assume an hourly resolution for the PFC (even if a shift to 15’ resolution is expected by the end of 2025 in Switzerland)

#### Research Questions
What parameters influences the shape of the Swiss Spot price curve? This parameter could refer to market situation (demand, production of conventional assets,…), network (available cross-border capacities), renewable production, flexibility management,…
How could the Swiss PFC in 2035 look like? This could be solved with a machine learning approach (or other approach if deemed more relevant)
What is the sensitivity of the PFC to the parameters? How stable is the result of the modeled PFC if key framework conditions evolve (e.g. redefinition of the targets for PV deployment in Switzerland by 2035)?

#### Deliverables
The model (Code) to estimate the hourly Swiss PFC in 2035, including an interface to visualize the results of the model (e.g. web based visualisation)
A report in Power Point format presenting the approach (data used, methodology, assumptions,…) and the key outcomes (answering to the questions, max 10 – 12 slides)
The report includes a discussion on the respective influence of the different parameter on the PFC shape
Expertise Required

Data science competences:
Data analysis and data exploration
Coding and implementation of machine learning models
Setup of data visualization interface
Basic understanding of Power markets

#### References
**Example of Spot Price**: external pagehttps://www.epexspot.com/en/market-results ; external pagehttps://www.rte-france.com/donnees-publications/eco2mix-donnees-temps-reel/donnees-marche#
Historical Spot, market, network and production data: external pagehttps://transparency.entsoe.eu/
**Swiss targets for PV 2030**: 18.7 TWh/y external page https://www.admin.ch/de/newnsb/dvb52hRdMmNdS3aNKL96C
**Swiss targets for PV 2035**: Art. 2 Abs. 1 EnG external page https://www.fedlex.admin.ch/eli/cc/2017/762/de
