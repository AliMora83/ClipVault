// The Usage view: this month's numbers, a daily chart, CSV export and reset.

import { $, el } from './dom.js';

const SVG = 'http://www.w3.org/2000/svg';
const CHART_HEIGHT = 80;
const BAR_GAP = 2;
const BAR_RADIUS = 3;

export class UsagePanel {
  /**
   * @param {object} deps
   * @param {typeof window.clipvault} deps.api
   * @param {(view: string) => void} deps.show switches the visible view
   */
  constructor({ api, show }) {
    this.api = api;
    this.show = show;
    this.returnTo = 'history';
    this.data = null;
    $('close-usage').addEventListener('click', () => this.close());
    $('u-export').addEventListener('click', () => this.exportCsv());
    $('u-reset').addEventListener('click', () => this.reset());
  }

  get isOpen() {
    return !$('view-usage').hidden;
  }

  async open(returnTo = 'history') {
    this.returnTo = returnTo;
    this.show('usage');
    $('usage-msg').textContent = '';
    $('close-usage').focus();
    await this.refresh();
  }

  close() {
    this.show(this.returnTo);
  }

  async refresh() {
    this.data = await this.api.getUsage();
    this.render();
  }

  render() {
    const { current, previous, today, enabled } = this.data;
    const nf = (n) => n.toLocaleString();
    const monthName = (m, opts = { month: 'long', year: 'numeric' }) =>
      new Date(`${m}-15T12:00:00`).toLocaleString(undefined, opts);

    $('usage-off').hidden = enabled;
    $('usage-month').textContent = monthName(current.month);
    $('u-used').textContent = nf(current.used);
    $('u-pasted').textContent = nf(current.totals.pasted);
    $('u-captured').textContent = nf(current.totals.captured);
    $('u-used-delta').textContent = previous.used
      ? `${monthName(previous.month, { month: 'long' })}: ${nf(previous.used)}`
      : '';

    const daysSoFar = current.daily.filter((d) => d.day <= today).length;
    const facts = [];
    if (current.used) {
      facts.push(
        `Active on ${current.activeDays} of ${daysSoFar} days so far, about ${current.averagePerActiveDay} a day.`,
      );
      if (current.busiestDay)
        facts.push(`Busiest: ${shortDate(current.busiestDay.day)} with ${nf(current.busiestDay.used)}.`);
      if (current.totals.searched) facts.push(`${nf(current.totals.searched)} found by search.`);
    } else {
      facts.push('No clips used yet this month. Press your shortcut, pick a clip and press Enter.');
    }
    $('u-facts').textContent = facts.join(' ');

    this.renderChart(current.daily, today);
  }

  renderChart(daily, today) {
    const host = $('u-chart');
    const width = Math.max(200, host.clientWidth || 520);
    const max = Math.max(1, ...daily.map((d) => d.used));
    const slot = width / daily.length;
    const barWidth = Math.max(2, slot - BAR_GAP);

    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${CHART_HEIGHT}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(CHART_HEIGHT));

    const baseline = document.createElementNS(SVG, 'line');
    Object.entries({ x1: 0, x2: width, y1: CHART_HEIGHT - 0.5, y2: CHART_HEIGHT - 0.5, class: 'chart-base' }).forEach(
      ([k, v]) => baseline.setAttribute(k, String(v)),
    );
    svg.append(baseline);

    daily.forEach((d, i) => {
      const x = i * slot + BAR_GAP / 2;
      const future = d.day > today;
      if (d.used > 0) {
        const h = Math.max(2, (d.used / max) * (CHART_HEIGHT - 6));
        const bar = document.createElementNS(SVG, 'path');
        bar.setAttribute('d', roundedTopBar(x, CHART_HEIGHT - 1, barWidth, h, Math.min(BAR_RADIUS, barWidth / 2)));
        bar.setAttribute('class', `chart-bar${d.day === today ? ' is-today' : ''}`);
        svg.append(bar);
      }
      if (future) return;
      // Full-height, full-slot hit target so thin bars are easy to hover.
      const hit = document.createElementNS(SVG, 'rect');
      Object.entries({ x: i * slot, y: 0, width: slot, height: CHART_HEIGHT, class: 'chart-hit' }).forEach(([k, v]) =>
        hit.setAttribute(k, String(v)),
      );
      hit.addEventListener('mouseenter', () => this.tip(d, (i + 0.5) * slot, width));
      hit.addEventListener('mouseleave', () => this.tip(null));
      svg.append(hit);
    });

    const axis = el('div', { cls: 'chart-axis' });
    axis.append(el('span', { text: shortDate(daily[0].day) }), el('span', { text: shortDate(daily.at(-1).day) }));
    host.replaceChildren(svg, axis);
    $('u-peak').textContent = daily.some((d) => d.used) ? `Peak ${max}` : '';
    host.setAttribute(
      'aria-label',
      `Clips used per day this month. Highest day: ${max}. Total: ${daily.reduce((s, d) => s + d.used, 0)}.`,
    );
  }

  tip(day, x = 0, width = 0) {
    const tip = $('u-tooltip');
    if (!day) {
      tip.hidden = true;
      return;
    }
    tip.replaceChildren(
      el('b', { text: shortDate(day.day) }),
      el('span', { text: `${day.used} used, ${day.pasted} pasted` }),
    );
    tip.hidden = false;
    const tipWidth = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(x - tipWidth / 2, 0), width - tipWidth)}px`;
  }

  async exportCsv() {
    const res = await this.api.exportUsage();
    $('usage-msg').textContent = res.saved ? `Saved ${res.name}.` : '';
  }

  async reset() {
    const res = await this.api.resetUsage();
    if (res.reset) {
      $('usage-msg').textContent = 'Usage stats reset.';
      await this.refresh();
    }
  }
}

function shortDate(day) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** A bar anchored to the baseline with rounded top corners only. */
function roundedTopBar(x, baseY, w, h, r) {
  const top = baseY - h;
  return [
    `M${x},${baseY}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + w - r}`,
    `Q${x + w},${top} ${x + w},${top + r}`,
    `V${baseY}`,
    'Z',
  ].join(' ');
}
