// Hourly calendar for a PFC year (local Swiss market time, 365 x 24 clock hours).
// DST is tracked for solar geometry; the 23/25-hour days are normalised to 24h,
// as is common practice for PFC products.

function lastSunday(year, month) {
  // month: 0-based
  const d = new Date(Date.UTC(year, month + 1, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function easterSunday(year) {
  // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const cache = new Map();

export function buildCalendar(year = 2035) {
  if (cache.has(year)) return cache.get(year);
  const days = 365;
  const start = Date.UTC(year, 0, 1);
  const dstStart = lastSunday(year, 2).getTime();
  const dstEnd = lastSunday(year, 9).getTime();
  const easter = easterSunday(year).getTime();
  const DAY = 86400000;
  const holidays = new Set([
    Date.UTC(year, 0, 1), Date.UTC(year, 0, 2), Date.UTC(year, 7, 1),
    Date.UTC(year, 11, 25), Date.UTC(year, 11, 26),
    easter - 2 * DAY, easter + DAY, easter + 39 * DAY, easter + 50 * DAY,
  ]);

  const H = days * 24;
  const hour = new Uint8Array(H), month = new Uint8Array(H), doy = new Uint16Array(H);
  const dayType = new Uint8Array(H); // 0 working day, 1 Saturday, 2 Sunday/holiday
  const dst = new Uint8Array(H);
  const dayInfo = [];
  for (let d = 0; d < days; d++) {
    const t = start + d * DAY;
    const date = new Date(t);
    const wd = date.getUTCDay();
    const type = holidays.has(t) || wd === 0 ? 2 : wd === 6 ? 1 : 0;
    const isDst = t >= dstStart && t < dstEnd ? 1 : 0;
    dayInfo.push({ date: date.toISOString().slice(0, 10), month: date.getUTCMonth(), weekday: wd, type, week: Math.min(51, Math.floor(d / 7)) });
    for (let h = 0; h < 24; h++) {
      const i = d * 24 + h;
      hour[i] = h; month[i] = date.getUTCMonth(); doy[i] = d; dayType[i] = type; dst[i] = isDst;
    }
  }
  const cal = { year, days, H, hour, month, doy, dayType, dst, dayInfo };
  cache.set(year, cal);
  return cal;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const isPeakHour = (cal, i) => cal.dayType[i] === 0 && cal.hour[i] >= 8 && cal.hour[i] < 20;
