/* Small charts for the dashboard. One measure per chart, values on hover or with the arrow keys,
   and the same numbers as a table. Only SVG attributes and element.style are used: the admin's
   security policy blocks inline style attributes in HTML. */
import { $, $$, esc } from './lib.js';

const SVG = 'http://www.w3.org/2000/svg';
const HEIGHT = 190;
const MARGIN = { top: 10, right: 4, bottom: 22, left: 50 };

const shape = (name, attrs, parent) => {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.appendChild(node);
  return node;
};

/** a round top for the axis, and the step between gridlines */
function scale(max, whole) {
  if (!(max > 0)) return { top: whole ? 4 : 1000, step: whole ? 1 : 250 };
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough);
  if (whole) step = Math.max(1, Math.ceil(step));
  return { top: Math.ceil(max / step) * step, step };
}

/** a column with a rounded top, standing square on the baseline */
const column = (x, y, width, base) => {
  const r = Math.min(4, width / 2, base - y);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${base}Z`;
};

/**
 * points: [{ label (short, under the axis), name (for the readout), value }], oldest first.
 * `valueText` writes a value in full; `tickText` writes it on the axis.
 */
export function columnChart(box, { title, points, valueText, tickText = valueText, whole = false }) {
  box.innerHTML = `<div class="chart" tabindex="0" role="group" aria-label="${esc(title)}. Use the left and right arrow keys to read each day.">
    <div class="chart__plot"></div><div class="chart__tip" role="status" hidden></div></div>`;
  const chart = box.firstElementChild;
  const plot = $('.chart__plot', chart);
  const tip = $('.chart__tip', chart);
  let bars = [];
  let slot = 0;
  let active = null;
  let drawnWidth = 0;

  function show(index) {
    active = index;
    bars.forEach((bar, i) => bar?.classList.toggle('is-active', i === index));
    tip.hidden = index === null;
    if (index === null) return;
    // names and values go in as text, never as HTML
    const value = document.createElement('b');
    value.textContent = valueText(points[index].value);
    const name = document.createElement('span');
    name.textContent = points[index].name;
    tip.replaceChildren(value, name);
    const x = MARGIN.left + (index + 0.5) * slot;
    tip.style.left = `${Math.min(Math.max(x, 56), plot.clientWidth - 56)}px`;
  }

  function draw() {
    const width = Math.max(240, plot.clientWidth);
    if (width === drawnWidth) return;
    drawnWidth = width;
    const inner = { width: width - MARGIN.left - MARGIN.right, height: HEIGHT - MARGIN.top - MARGIN.bottom };
    const base = MARGIN.top + inner.height;
    const axis = scale(Math.max(0, ...points.map((p) => p.value)), whole);
    const y = (value) => base - (value / axis.top) * inner.height;
    plot.textContent = '';
    const svg = shape('svg', { width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, 'aria-hidden': 'true' }, plot);
    for (let i = 0; i * axis.step <= axis.top + 1e-9; i++) {
      const value = i * axis.step;
      shape('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: y(value), y2: y(value), class: i ? 'chart__grid' : 'chart__base' }, svg);
      shape('text', { x: MARGIN.left - 6, y: y(value) + 4, 'text-anchor': 'end', class: 'chart__tick' }, svg).textContent = tickText(value);
    }
    slot = inner.width / points.length;
    const barWidth = Math.max(1, Math.min(24, slot - 2));
    bars = points.map((p, i) =>
      p.value > 0
        ? shape('path', { d: column(MARGIN.left + i * slot + (slot - barWidth) / 2, Math.min(base - 1, y(p.value)), barWidth, base), class: 'chart__bar' }, svg)
        : null
    );
    // only the first, middle and last dates, so they never collide
    const last = points.length - 1;
    for (const i of new Set([0, Math.floor(last / 2), last])) {
      const x = i === 0 ? MARGIN.left : i === last ? width - MARGIN.right : MARGIN.left + (i + 0.5) * slot;
      shape('text', { x, y: HEIGHT - 6, 'text-anchor': i === 0 ? 'start' : i === last ? 'end' : 'middle', class: 'chart__tick' }, svg).textContent = points[i].label;
    }
    // each day's whole column is the target, not just its bar
    points.forEach((_, i) =>
      shape('rect', { x: MARGIN.left + i * slot, y: MARGIN.top, width: slot, height: inner.height, class: 'chart__hit' }, svg).addEventListener('pointerenter', () => show(i))
    );
    svg.addEventListener('pointerleave', () => show(null));
    show(active);
  }

  chart.addEventListener('keydown', (e) => {
    const last = points.length - 1;
    const to = { ArrowLeft: (active ?? last + 1) - 1, ArrowRight: (active ?? -1) + 1, Home: 0, End: last }[e.key];
    if (e.key === 'Escape') return show(null);
    if (to === undefined) return;
    e.preventDefault();
    show(Math.min(last, Math.max(0, to)));
  });
  chart.addEventListener('blur', () => show(null));
  new ResizeObserver(draw).observe(plot);
  draw();
}

/** named bars on one baseline: [{ name, value, text }] */
export const barList = (rows) => {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return `<ul class="bars">${rows
    .map(
      (r) => `<li><span class="bars__name">${esc(r.name)}</span><span class="bars__track" aria-hidden="true"><span class="bars__fill" data-width="${
        max ? Math.max(r.value ? 2 : 0, (r.value / max) * 100) : 0
      }"></span></span><span class="bars__value">${esc(r.text)}</span></li>`
    )
    .join('')}</ul>`;
};

/** how much of a limit is used */
export const meter = (used, limit, label) =>
  `<div class="meter" role="img" aria-label="${esc(label)}"><span class="meter__fill" data-width="${limit ? Math.min(100, (used / limit) * 100) : 0}"></span></div>`;

/** give the bars and meters their widths, after the HTML is on the page */
export const applyWidths = (root) => $$('[data-width]', root).forEach((el) => (el.style.width = `${el.dataset.width}%`));
