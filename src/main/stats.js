// Local usage statistics: daily counts of what you do with ClipVault.
// Only counts are stored, never clip text. Pure Node so it can be unit-tested.

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

/** Events that are counted, in display order. */
export const EVENTS = Object.freeze({
  pasted: 'Pasted into an app',
  copied: 'Copied back (no paste)',
  captured: 'Copies captured',
  opened: 'Times opened',
  searched: 'Found by search',
});

const KEEP_DAYS = 400; // a little over a year, enough for month-on-month and a year view
const SAVE_DEBOUNCE_MS = 1000;

/** "2026-10-18" in local time. */
export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** "2026-10" in local time. */
export function monthKey(date = new Date()) {
  return dayKey(date).slice(0, 7);
}

/** The month before `month` ("2026-01" → "2025-12"). */
export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export class UsageStats extends EventEmitter {
  constructor(dir) {
    super();
    this.file = path.join(dir, 'stats.json');
    /** @type {{ days: Record<string, Record<string, number>>, lastReportedMonth: string | null, since: string | null }} */
    this.data = { days: {}, lastReportedMonth: null, since: null };
    this._timer = null;
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && typeof raw.days === 'object') {
        this.data = {
          days: sanitizeDays(raw.days),
          lastReportedMonth: typeof raw.lastReportedMonth === 'string' ? raw.lastReportedMonth : null,
          since: typeof raw.since === 'string' ? raw.since : null,
        };
      }
    } catch {
      // first run or unreadable file: start fresh
    }
    return this;
  }

  /** Counts one occurrence of `event` (a key of EVENTS) on the given day. */
  record(event, date = new Date()) {
    if (!(event in EVENTS)) throw new Error(`Unknown usage event "${event}"`);
    const day = dayKey(date);
    const counts = (this.data.days[day] ??= {});
    counts[event] = (counts[event] ?? 0) + 1;
    this.data.since ??= day;
    this._prune(date);
    this._changed();
  }

  /** Totals and per-day counts for a month. */
  month(month) {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const totals = Object.fromEntries(Object.keys(EVENTS).map((e) => [e, 0]));
    const daily = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${month}-${String(d).padStart(2, '0')}`;
      const counts = this.data.days[key] ?? {};
      for (const e of Object.keys(EVENTS)) totals[e] += counts[e] ?? 0;
      daily.push({ day: key, pasted: counts.pasted ?? 0, used: (counts.pasted ?? 0) + (counts.copied ?? 0) });
    }
    const activeDays = daily.filter((d) => d.used > 0).length;
    const busiest = daily.reduce((best, d) => (d.used > best.used ? d : best), { day: null, used: 0 });
    const used = totals.pasted + totals.copied;
    return {
      month,
      totals,
      used,
      activeDays,
      averagePerActiveDay: activeDays ? Math.round(used / activeDays) : 0,
      busiestDay: busiest.used ? busiest : null,
      daily,
    };
  }

  /** This month and last month, for the Usage screen. */
  overview(now = new Date()) {
    const current = monthKey(now);
    return {
      current: this.month(current),
      previous: this.month(previousMonth(current)),
      today: dayKey(now),
      since: this.data.since,
    };
  }

  /**
   * The month that just ended, if it hasn't been reported yet and had any use.
   * Marks it reported, so each month is summarised once.
   */
  takeMonthlyReport(now = new Date()) {
    const last = previousMonth(monthKey(now));
    if (this.data.lastReportedMonth && this.data.lastReportedMonth >= last) return null;
    this.data.lastReportedMonth = last;
    this._changed();
    const summary = this.month(last);
    return summary.used > 0 || summary.totals.captured > 0 ? summary : null;
  }

  /** CSV with one row per day that has any activity. */
  toCSV() {
    const events = Object.keys(EVENTS);
    const rows = Object.keys(this.data.days)
      .sort()
      .map((day) => [day, ...events.map((e) => this.data.days[day][e] ?? 0)].join(','));
    return [['date', ...events].join(','), ...rows].join('\n') + '\n';
  }

  reset() {
    this.data = { days: {}, lastReportedMonth: this.data.lastReportedMonth, since: null };
    this._changed();
  }

  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  _prune(now) {
    const cutoff = dayKey(new Date(now.getTime() - KEEP_DAYS * 86_400_000));
    for (const day of Object.keys(this.data.days)) if (day < cutoff) delete this.data.days[day];
  }

  _changed() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
    this._timer.unref?.();
    this.emit('change');
  }
}

function sanitizeDays(days) {
  const out = {};
  for (const [day, counts] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof counts !== 'object' || counts === null) continue;
    out[day] = {};
    for (const e of Object.keys(EVENTS)) {
      const n = counts[e];
      if (Number.isInteger(n) && n > 0) out[day][e] = n;
    }
  }
  return out;
}
