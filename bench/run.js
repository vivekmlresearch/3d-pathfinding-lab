#!/usr/bin/env node
'use strict';
/*
 * Command-line benchmark. Runs every algorithm on the same random (start, end) pairs of seeded
 * random cubes and prints Markdown tables. Also fits a power law  expanded ~ c * V^alpha  per
 * algorithm across the cube sizes, and writes JSON for scripts/make-assets.js.
 *
 *   node bench/run.js                                   defaults: sizes 8,16,24,32,40, 20 pairs, 26 moves
 *   node bench/run.js --sizes 8,16,32 --pairs 50 --conn 6 --obst 10
 *   node bench/run.js --out bench/results.json
 *
 * Options: --sizes a,b,c  --pairs N  --conn 6|26  --obst PERCENT  --wmin X  --wmax X
 *          --eps X (heuristic scale, <= 1 keeps A* variants exact)  --seed N  --limit MS  --out FILE
 */
const fs = require('fs');
const path = require('path');
const A = require('../docs/js/algorithms.js');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true'; }
}
const sizes = (args.sizes || '8,16,24,32,40').split(',').map(Number);
const pairs = +(args.pairs || 20);
const conn = +(args.conn || 26);
const obst = +(args.obst || 5) / 100;
const wmin = +(args.wmin || 1), wmax = +(args.wmax || 10);
const eps = args.eps == null ? 1 : +args.eps;
const seed = +(args.seed || 20261024);
const limit = +(args.limit || 20000);
const out = args.out || path.join(__dirname, 'results.json');

const f0 = (v) => Math.round(v).toLocaleString('en-US');
const f2 = (v) => (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0));
const pad = (s, n) => String(s).padEnd(n);

function fitExponent(xs, ys) {
  // least squares on log-log, returns slope
  const n = xs.length; if (n < 2) return NaN;
  const lx = xs.map(Math.log), ly = ys.map(Math.log);
  const mx = lx.reduce((a, b) => a + b) / n, my = ly.reduce((a, b) => a + b) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; }
  return num / den;
}

const keys = A.META.map((m) => m.key);
const short = Object.fromEntries(A.META.map((m) => [m.key, m.short]));
const results = { config: { sizes, pairs, conn, obst, wmin, wmax, eps, seed, node: process.version, platform: process.platform + ' ' + process.arch }, sizes: {} };

console.log(`# Benchmark: ${pairs} random pairs per cube, ${conn} moves, ${(obst * 100).toFixed(0)}% walls, cost ${wmin}-${wmax}, eps ${eps}, seed ${seed}`);
console.log(`Node ${process.version} on ${process.platform} ${process.arch}\n`);

// warm the JIT on a small cube so the first size is not penalised
{
  const g = A.makeGrid({ n: 12, wmin, wmax, obst, seed });
  const p = A.randomPairs(g, 4, seed);
  A.batch(g, conn, keys, p, { hscale: eps, deadline: limit });
}

for (const n of sizes) {
  const grid = A.makeGrid({ n, wmin, wmax, obst, seed: seed + n });
  const pr = A.randomPairs(grid, pairs, seed + 1000 + n);
  const t0 = Date.now();
  const sum = A.batch(grid, conn, keys, pr, { hscale: eps, deadline: limit });
  results.sizes[n] = { V: n * n * n, summary: sum, wallMs: Date.now() - t0 };
  console.log(`## N = ${n}  (V = ${f0(n * n * n)}, ${sum.pairs - sum.unreachable} reachable pairs, mean ${f0(sum.hops.mean)} hops on the optimal path)\n`);
  console.log('| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const k of sum.order) {
    const a = sum.algos[k], V = n * n * n;
    console.log(`| ${short[k]} | ${f0(a.expanded.mean)} | ${f0(a.expanded.median)} | ${(100 * a.expanded.mean / V).toFixed(1)}% | ${f2(a.ms.median)} | ${f2(a.ms.p95)} | ${f2(a.ms.std)} | ${a.optimal}/${a.found} | ${a.gap.mean.toFixed(2)} | ${a.gap.max.toFixed(2)} |`);
  }
  console.log('');
}

// scaling exponents
console.log('## Empirical scaling, median time and mean expansions as a power of V\n');
console.log('| Algorithm | alpha (expanded ~ V^alpha) | alpha (time ~ V^alpha) |');
console.log('|---|---:|---:|');
results.exponents = {};
for (const k of keys) {
  const V = [], ex = [], ms = [];
  for (const n of sizes) {
    const a = results.sizes[n].summary.algos[k];
    if (a && a.found > 0 && a.expanded.mean > 0 && a.ms.median > 0) { V.push(n * n * n); ex.push(a.expanded.mean); ms.push(a.ms.median); }
  }
  const ae = fitExponent(V, ex), at = fitExponent(V, ms);
  results.exponents[k] = { expanded: ae, time: at };
  console.log(`| ${short[k]} | ${ae.toFixed(2)} | ${at.toFixed(2)} |`);
}
console.log('\nTimes are single timed runs per pair (no repeats) after a JIT warm-up, so read medians, not single values.');

fs.writeFileSync(out, JSON.stringify(results, null, 1));
console.error(`\nwrote ${path.relative(process.cwd(), out)}`);
