#!/usr/bin/env node
'use strict';
/*
 * Builds the SVG figures used in README.md from real runs of docs/js/algorithms.js.
 *   assets/cutaway.svg        isometric cut-away of a 10x10x10 cube with the Bi-A* path drawn through it
 *   assets/expanded-n40.svg   share of the cube each algorithm expands (from bench/results-26.json)
 *   assets/scaling.svg        mean expansions against cube volume, log-log (from bench/results-26.json)
 * Run `node bench/run.js --out bench/results-26.json` first for the two charts.
 */
const fs = require('fs');
const path = require('path');
const A = require('../docs/js/algorithms.js');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets');
fs.mkdirSync(outDir, { recursive: true });

const BG = '#0d1117', PANEL = '#161b22', FG = '#e6edf3', MUTED = '#8b949e', GRID = '#30363d';
const COLORS = { dijkstra: '#56b4e9', astar: '#e69f00', bidijkstra: '#009e73', biastar: '#cc79a7', spfa: '#d55e00', greedy: '#f0e442' };
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const VIRIDIS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
function viridis(t) {
  t = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
  const k = Math.min(VIRIDIS.length - 2, Math.floor(t)), u = t - k;
  return [0, 1, 2].map((c) => VIRIDIS[k][c] * (1 - u) + VIRIDIS[k + 1][c] * u);
}
const rgb = (c, f = 1) => 'rgb(' + c.map((v) => Math.round(Math.max(0, Math.min(255, v * f)))).join(',') + ')';
const mix = (c, d, a) => c.map((v, i) => v * a + d[i] * (1 - a));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* ---------------------------------------------------------------- cut-away */
function cutaway() {
  const N = 10, S = 24, c30 = Math.sqrt(3) / 2;
  const grid = A.makeGrid({ n: N, wmin: 1, wmax: 10, obst: 0.05, seed: 11 });
  const idx = (x, y, z) => x + N * (y + N * z);
  const s = idx(0, 8, 1), t = idx(8, 1, 7);
  grid.w[s] = 5; grid.w[t] = 5;
  const res = A.runOnce('biastar', grid, 26, s, t, { record: true });
  const dij = A.runOnce('dijkstra', grid, 26, s, t, { record: false });
  const explored = new Uint8Array(N * N * N);
  for (let i = 0; i < res.order.length; i++) explored[res.order[i]] = 1;
  const onPath = new Set(Array.from(res.path));

  // the near top corner is cut away so the inside of the cube shows
  const carved = (x, y, z) => x >= 5 && y >= 5 && z >= 5;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < N && y < N && z < N && !carved(x, y, z) && grid.w[idx(x, y, z)] !== Infinity;
  const P = (x, y, z) => [(x - y) * c30 * S, (x + y) * 0.5 * S - z * S];

  const cells = [];
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (solid(x, y, z)) cells.push([x, y, z]);
  cells.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));

  const polys = [];
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const grow = (p) => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); };
  const face = (pts, fill) => { pts.forEach(grow); polys.push([pts, fill]); };
  for (const [x, y, z] of cells) {
    const i = idx(x, y, z);
    const base = viridis((grid.w[i] - 1) / 9);
    const col = explored[i] ? base : mix(base, [22, 27, 34], 0.22);
    const k = explored[i] ? 1 : 0.85;
    if (!solid(x, y, z + 1)) face([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], rgb(col, 1.08 * k));
    if (!solid(x + 1, y, z)) face([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)], rgb(col, 0.80 * k));
    if (!solid(x, y + 1, z)) face([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], rgb(col, 0.60 * k));
  }
  const pathPts = Array.from(res.path).map((i) => P((i % N) + 0.5, (((i / N) | 0) % N) + 0.5, ((i / (N * N)) | 0) + 0.5));
  const sp = pathPts[0], tp = pathPts[pathPts.length - 1];
  [sp, tp].forEach(grow);

  const pad = 22, head = 54, foot = 44;
  const W = Math.ceil(maxX - minX + pad * 2), H = Math.ceil(maxY - minY + pad * 2 + head + foot);
  const ox = pad - minX, oy = pad + head - minY;
  const tr = (p) => (p[0] + ox).toFixed(1) + ',' + (p[1] + oy).toFixed(1);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">\n`;
  svg += `<title id="t">Cut-away of a 10 by 10 by 10 cost cube with a bidirectional A* path</title>\n`;
  svg += `<desc id="d">Cells are colored by cost from dark purple (cheap) to yellow (expensive). Bright cells were expanded by the search, dim cells were never touched. The white line is the optimal path.</desc>\n`;
  svg += `<rect width="${W}" height="${H}" rx="10" fill="${BG}"/>\n`;
  svg += `<text x="${pad}" y="28" fill="${FG}" font-family="${FONT}" font-size="15" font-weight="600">Bidirectional A* on a 10×10×10 cost cube, 26 moves</text>\n`;
  svg += `<text x="${pad}" y="46" fill="${MUTED}" font-family="${FONT}" font-size="12">bright cells were expanded · dim cells never touched · line is the optimal path</text>\n`;
  for (const [pts, fill] of polys) svg += `<polygon points="${pts.map(tr).join(' ')}" fill="${fill}" stroke="${BG}" stroke-opacity="0.35" stroke-width="0.6"/>\n`;
  svg += `<polyline points="${pathPts.map(tr).join(' ')}" fill="none" stroke="#000" stroke-opacity="0.75" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"/>\n`;
  svg += `<polyline points="${pathPts.map(tr).join(' ')}" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>\n`;
  svg += `<circle cx="${(sp[0] + ox).toFixed(1)}" cy="${(sp[1] + oy).toFixed(1)}" r="6" fill="#2ea043" stroke="#fff" stroke-width="2"/>\n`;
  svg += `<circle cx="${(tp[0] + ox).toFixed(1)}" cy="${(tp[1] + oy).toFixed(1)}" r="6" fill="#f85149" stroke="#fff" stroke-width="2"/>\n`;
  const fy = H - 16;
  svg += `<text x="${pad}" y="${fy}" fill="${MUTED}" font-family="${MONO}" font-size="11.5">Bi-A*: ${res.stats.expanded} expanded · Dijkstra: ${dij.stats.expanded} expanded · cost ${res.cost.toFixed(2)} (identical)</text>\n`;
  svg += '</svg>\n';
  if (Math.abs(res.cost - dij.cost) > 1e-6) throw new Error('cutaway: Bi-A* and Dijkstra disagree');
  fs.writeFileSync(path.join(outDir, 'cutaway.svg'), svg);
}

/* ---------------------------------------------------------------- charts */
function loadBench() {
  const f = path.join(root, 'bench', 'results-26.json');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const NAMES = Object.fromEntries(A.META.map((m) => [m.key, m.short]));

function barChart(b) {
  const sizes = Object.keys(b.sizes).map(Number).sort((x, y) => x - y);
  const n = sizes[sizes.length - 1], d = b.sizes[n], V = d.V;
  const keys = d.summary.order;
  const W = 640, row = 34, top = 74, left = 118, right = 96, H = top + keys.length * row + 52;
  const vals = keys.map((k) => 100 * d.summary.algos[k].expanded.mean / V);
  const mx = 100;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">\n`;
  s += `<title id="t">Share of a ${n}×${n}×${n} cube expanded by each algorithm</title>\n<desc id="d">Mean nodes expanded as a percentage of all cells, over ${b.config.pairs} random start and end pairs, ${b.config.conn} moves.</desc>\n`;
  s += `<rect width="${W}" height="${H}" rx="10" fill="${BG}"/>\n`;
  s += `<text x="22" y="30" fill="${FG}" font-family="${FONT}" font-size="15" font-weight="600">How much of the ${n}×${n}×${n} cube each algorithm expands</text>\n`;
  s += `<text x="22" y="49" fill="${MUTED}" font-family="${FONT}" font-size="12">mean over ${b.config.pairs} random pairs · ${b.config.conn} moves · ${Math.round(b.config.obst * 100)}% walls · lower is better</text>\n`;
  const x0 = left, x1 = W - right;
  [0, 25, 50, 75, 100].forEach((g) => {
    const x = x0 + (x1 - x0) * g / mx;
    s += `<line x1="${x}" x2="${x}" y1="${top - 8}" y2="${top + keys.length * row - 6}" stroke="${GRID}" stroke-width="1"/>\n`;
    s += `<text x="${x}" y="${top + keys.length * row + 12}" fill="${MUTED}" text-anchor="middle" font-family="${MONO}" font-size="11">${g}%</text>\n`;
  });
  keys.forEach((k, i) => {
    const y = top + i * row, w = Math.max(2, (x1 - x0) * vals[i] / mx);
    const opt = d.summary.algos[k].optimal === d.summary.algos[k].found;
    s += `<text x="${left - 12}" y="${y + 14}" fill="${FG}" text-anchor="end" font-family="${FONT}" font-size="13">${esc(NAMES[k])}</text>\n`;
    s += `<rect x="${x0}" y="${y}" width="${w.toFixed(1)}" height="20" rx="3" fill="${COLORS[k]}"${opt ? '' : ' fill-opacity="0.55"'}/>\n`;
    s += `<text x="${x0 + w + 8}" y="${y + 14.5}" fill="${FG}" font-family="${MONO}" font-size="12">${vals[i] < 1 ? vals[i].toFixed(2) : vals[i].toFixed(1)}%${opt ? '' : ' ·not optimal'}</text>\n`;
  });
  s += '</svg>\n';
  fs.writeFileSync(path.join(outDir, 'expanded-n40.svg'), s);
}

function scalingChart(b) {
  const sizes = Object.keys(b.sizes).map(Number).sort((x, y) => x - y);
  const keys = b.sizes[sizes[0]].summary.order;
  const W = 640, H = 400, L = 70, R = 118, T = 70, B = 56;
  const xs = sizes.map((n) => n * n * n);
  const all = [];
  keys.forEach((k) => sizes.forEach((n) => { const a = b.sizes[n].summary.algos[k]; if (a.found) all.push(a.expanded.mean); }));
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...all)))), hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all))));
  const xl = Math.log10(xs[0]), xh = Math.log10(xs[xs.length - 1]);
  const X = (v) => L + (W - L - R) * (Math.log10(v) - xl) / (xh - xl);
  const Y = (v) => T + (H - T - B) * (1 - (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">\n`;
  s += `<title id="t">Mean nodes expanded against cube volume, log-log</title>\n<desc id="d">Expansions grow roughly linearly with volume for the exact algorithms; greedy best-first grows far slower.</desc>\n`;
  s += `<rect width="${W}" height="${H}" rx="10" fill="${BG}"/>\n`;
  s += `<text x="22" y="30" fill="${FG}" font-family="${FONT}" font-size="15" font-weight="600">Expansions against cube volume</text>\n`;
  s += `<text x="22" y="49" fill="${MUTED}" font-family="${FONT}" font-size="12">log-log, mean over ${b.config.pairs} pairs per size · slope α in expanded ≈ c·V^α shown at the line ends</text>\n`;
  for (let e = Math.log10(lo); e <= Math.log10(hi) + 1e-9; e++) {
    const y = Y(Math.pow(10, e));
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${GRID}"/>\n<text x="${L - 8}" y="${y + 4}" fill="${MUTED}" text-anchor="end" font-family="${MONO}" font-size="11">${Math.pow(10, e).toLocaleString('en-US')}</text>\n`;
  }
  sizes.forEach((n) => {
    const x = X(n * n * n);
    s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke="${GRID}" stroke-dasharray="2 4"/>\n<text x="${x}" y="${H - B + 18}" fill="${MUTED}" text-anchor="middle" font-family="${MONO}" font-size="11">${n}³</text>\n`;
  });
  s += `<text x="${(L + W - R) / 2}" y="${H - 14}" fill="${MUTED}" text-anchor="middle" font-family="${FONT}" font-size="12">cube size (volume V = N³)</text>\n`;
  keys.forEach((k) => {
    const pts = sizes.map((n) => [X(n * n * n), Y(b.sizes[n].summary.algos[k].expanded.mean)]);
    s += `<polyline points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${COLORS[k]}" stroke-width="2.2"/>\n`;
    pts.forEach((p) => { s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${COLORS[k]}"/>\n`; });
    const last = pts[pts.length - 1];
    s += `<text x="${last[0] + 8}" y="${last[1] + 4}" fill="${COLORS[k]}" font-family="${FONT}" font-size="12">${esc(NAMES[k])} α=${b.exponents[k].expanded.toFixed(2)}</text>\n`;
  });
  s += '</svg>\n';
  fs.writeFileSync(path.join(outDir, 'scaling.svg'), s);
}

cutaway();
const b = loadBench();
if (b) { barChart(b); scalingChart(b); } else console.warn('bench/results-26.json missing: skipped charts');
console.log('wrote', fs.readdirSync(outDir).filter((f) => f.endsWith('.svg')).join(', '));
