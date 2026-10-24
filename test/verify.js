'use strict';
/*
 * Correctness suite. Every exact algorithm is compared against an independent O(V^2)
 * reference Dijkstra on many small random grids (6 and 26 connectivity, with obstacles).
 * Run: node test/verify.js
 */
const Algos = require('../docs/js/algorithms.js');

function referenceDijkstra(grid, conn, s, t) {
  const n = grid.n, total = grid.total, w = grid.w;
  const off = Algos.offsets(conn);
  const dist = new Float64Array(total).fill(Infinity);
  const done = new Uint8Array(total);
  dist[s] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < total; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === t) break;
    done[u] = 1;
    const x = u % n, y = ((u / n) | 0) % n, z = (u / (n * n)) | 0;
    for (let k = 0; k < off.K; k++) {
      const X = x + off.dx[k], Y = y + off.dy[k], Z = z + off.dz[k];
      if (X < 0 || Y < 0 || Z < 0 || X >= n || Y >= n || Z >= n) continue;
      const v = X + n * (Y + n * Z);
      if (w[v] === Infinity) continue;
      if (dist[u] + w[v] < dist[v]) dist[v] = dist[u] + w[v];
    }
  }
  return dist[t];
}

function checkPath(grid, conn, s, t, path) {
  const n = grid.n;
  if (path[0] !== s || path[path.length - 1] !== t) return 'path endpoints wrong';
  for (let i = 0; i < path.length; i++) {
    if (grid.w[path[i]] === Infinity) return 'path crosses a blocked cell';
    if (i === 0) continue;
    const a = path[i - 1], b = path[i];
    const ax = a % n, ay = ((a / n) | 0) % n, az = (a / (n * n)) | 0;
    const bx = b % n, by = ((b / n) | 0) % n, bz = (b / (n * n)) | 0;
    const d = [Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz)];
    const mx = Math.max(...d), sum = d[0] + d[1] + d[2];
    if (mx > 1 || sum === 0) return 'non-adjacent step';
    if (conn === 6 && sum !== 1) return 'diagonal step in 6-neighbourhood';
  }
  return null;
}

let checks = 0, failures = 0, reachable = 0, unreachable = 0;
function fail(msg) { failures++; if (failures <= 20) console.error('FAIL', msg); }

const exactKeys = ['dijkstra', 'astar', 'bidijkstra', 'biastar', 'spfa'];
const configs = [];
for (const conn of [6, 26]) for (const obst of [0, 0.15, 0.35]) for (const n of [3, 4, 5, 6, 7]) {
  for (const [wmin, wmax] of [[1, 10], [0, 10], [2, 3]]) configs.push({ conn, obst, n, wmin, wmax });
}

for (const cfg of configs) {
  for (let seed = 1; seed <= 6; seed++) {
    const grid = Algos.makeGrid({ n: cfg.n, wmin: cfg.wmin, wmax: cfg.wmax, obst: cfg.obst, seed: seed * 7919 + cfg.n });
    const pairs = Algos.randomPairs(grid, 4, seed);
    pairs.push([0, grid.total - 1]);
    for (const [s, t] of pairs) {
      const ref = referenceDijkstra(grid, cfg.conn, s, t);
      const tag = JSON.stringify(cfg) + ' seed=' + seed + ' s=' + s + ' t=' + t;
      if (ref === Infinity) unreachable++; else reachable++;
      for (const key of exactKeys.concat(['greedy'])) {
        for (const hscale of (key === 'astar' || key === 'biastar') ? [1, 0.5, 2.0] : [1]) {
          const r = Algos.runOnce(key, grid, cfg.conn, s, t, { hscale, record: true });
          checks++;
          if (ref === Infinity) { if (r.found) fail(tag + ' ' + key + ' found a path that should not exist'); continue; }
          if (!r.found) { fail(tag + ' ' + key + ' missed a reachable target'); continue; }
          const bad = checkPath(grid, cfg.conn, s, t, r.path);
          if (bad) { fail(tag + ' ' + key + ': ' + bad); continue; }
          const rel = Math.abs(r.cost - ref) / Math.max(1, ref);
          if (Algos.exactFor(key, hscale)) {
            if (rel > 1e-9) fail(tag + ' ' + key + ' eps=' + hscale + ' cost ' + r.cost + ' != ref ' + ref);
          } else if (r.cost < ref - 1e-9) fail(tag + ' ' + key + ' beat the optimum');
          if (!r.order || r.order.length !== r.stats.expanded) fail(tag + ' ' + key + ' expansion log length mismatch');
        }
      }
    }
  }
}

// Determinism: identical inputs must give bit-identical statistics and paths.
{
  const grid = Algos.makeGrid({ n: 14, wmin: 1, wmax: 10, obst: 0.1, seed: 42 });
  for (const key of Algos.META.map(m => m.key)) {
    const a = Algos.runOnce(key, grid, 6, 0, grid.total - 1, { record: true });
    const b = Algos.runOnce(key, grid, 6, 0, grid.total - 1, { record: true });
    checks++;
    if (JSON.stringify(a.stats) !== JSON.stringify(b.stats) || String(a.path) !== String(b.path) || a.cost !== b.cost) {
      fail('non-deterministic result for ' + key);
    }
  }
}

console.log(`checks: ${checks}, reachable pairs: ${reachable}, unreachable pairs: ${unreachable}, failures: ${failures}`);
if (failures) process.exit(1);
console.log('OK: all exact algorithms match the reference; greedy returns valid (never better than optimal) paths.');
