import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UsageStats, dayKey, monthKey, previousMonth } from '../../src/main/stats.js';

const fresh = () => new UsageStats(fs.mkdtempSync(path.join(os.tmpdir(), 'clipvault-stats-'))).load();
const at = (s) => new Date(`${s}T12:00:00`); // local noon avoids timezone edge cases

test('date keys use local time', () => {
  assert.equal(dayKey(at('2026-10-05')), '2026-10-05');
  assert.equal(monthKey(at('2026-10-05')), '2026-10');
  assert.equal(previousMonth('2026-01'), '2025-12');
  assert.equal(previousMonth('2026-10'), '2026-09');
});

test('records daily counts and totals a month', () => {
  const s = fresh();
  s.record('pasted', at('2026-10-01'));
  s.record('pasted', at('2026-10-01'));
  s.record('copied', at('2026-10-03'));
  s.record('captured', at('2026-10-03'));
  s.record('pasted', at('2026-09-30')); // previous month
  const m = s.month('2026-10');
  assert.equal(m.totals.pasted, 2);
  assert.equal(m.totals.copied, 1);
  assert.equal(m.totals.captured, 1);
  assert.equal(m.used, 3);
  assert.equal(m.activeDays, 2);
  assert.equal(m.averagePerActiveDay, 2);
  assert.deepEqual(m.busiestDay, { day: '2026-10-01', pasted: 2, used: 2 });
  assert.equal(m.daily.length, 31);
});

test('February has the right number of days', () => {
  assert.equal(fresh().month('2028-02').daily.length, 29); // leap year
  assert.equal(fresh().month('2026-02').daily.length, 28);
});

test('rejects unknown events', () => {
  assert.throws(() => fresh().record('keylogged'));
});

test('monthly report fires once, for the month that just ended', () => {
  const s = fresh();
  s.record('pasted', at('2026-10-20'));
  assert.equal(s.takeMonthlyReport(at('2026-10-25')), null, 'September had no activity');
  const report = s.takeMonthlyReport(at('2026-11-01'));
  assert.equal(report.month, '2026-10');
  assert.equal(report.totals.pasted, 1);
  assert.equal(s.takeMonthlyReport(at('2026-11-15')), null, 'not twice');
});

test('no report for a month with no activity', () => {
  const s = fresh();
  assert.equal(s.takeMonthlyReport(at('2026-11-01')), null);
});

test('CSV has a header and one row per active day', () => {
  const s = fresh();
  s.record('pasted', at('2026-10-02'));
  s.record('searched', at('2026-10-02'));
  s.record('opened', at('2026-10-01'));
  assert.equal(s.toCSV(), 'date,pasted,copied,captured,opened,searched\n2026-10-01,0,0,0,1,0\n2026-10-02,1,0,0,0,1\n');
});

test('keeps about a year and drops older days', () => {
  const s = fresh();
  s.record('pasted', at('2025-01-01'));
  s.record('pasted', at('2026-10-01'));
  assert.deepEqual(Object.keys(s.data.days), ['2026-10-01']);
});

test('persists, survives junk, and never stores anything but counts', () => {
  const s = fresh();
  s.record('pasted', at('2026-10-01'));
  s.flush();
  const raw = JSON.parse(fs.readFileSync(s.file, 'utf8'));
  raw.days['2026-10-01'].text = 'secret';
  raw.days['not-a-date'] = { pasted: 5 };
  raw.days['2026-10-02'] = { pasted: -3, copied: 'x' };
  fs.writeFileSync(s.file, JSON.stringify(raw));
  const again = new UsageStats(path.dirname(s.file)).load();
  assert.deepEqual(again.data.days, { '2026-10-01': { pasted: 1 }, '2026-10-02': {} });
});

test('reset clears counts but remembers which month was reported', () => {
  const s = fresh();
  s.record('pasted', at('2026-10-01'));
  s.takeMonthlyReport(at('2026-11-01'));
  s.reset();
  assert.deepEqual(s.data.days, {});
  assert.equal(s.data.lastReportedMonth, '2026-10');
});
