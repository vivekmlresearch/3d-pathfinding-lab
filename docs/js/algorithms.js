/*!
 * deterministic-algorithm · algorithms.js
 * Shortest-path algorithms on a 3D node-weighted grid.
 * Works unchanged in the browser (global `Algos`), in a Web Worker, and in Node (require).
 * MIT License.
 *
 * Cost model
 *   Moving from cell u into neighbour v costs w[v] (the weight of the cell you enter).
 *   The start cell's own weight is never paid. Blocked cells have w = Infinity.
 *   Neighbourhood: 6 (faces) or 26 (faces + edges + corners); every step into a cell costs w[v].
 *
 * Determinism
 *   Weights come from a seeded mulberry32 stream, heaps break key ties on node index,
 *   and neighbours are visited in a fixed order, so every run is exactly reproducible.
 */
(function (root) {
  'use strict';

  function factory() {
    'use strict';

    var INF = Infinity;
    var nowFn = (typeof performance !== 'undefined' && performance.now)
      ? function () { return performance.now(); }
      : function () { return Date.now(); };

    /* ------------------------------------------------------------------ PRNG + grid */

    function mulberry32(a) {
      return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }

    function gridStats(w) {
      var mn = INF, mx = -INF, free = 0;
      for (var i = 0; i < w.length; i++) {
        var v = w[i];
        if (v !== INF) { free++; if (v < mn) mn = v; if (v > mx) mx = v; }
      }
      if (free === 0) { mn = 0; mx = 0; }
      return { wmin: mn, wmax: mx, free: free, total: w.length };
    }

    /** cfg: { n, wmin, wmax, obst (0..1), seed }. The two opposite corners are always free. */
    function makeGrid(cfg) {
      var n = cfg.n | 0, total = n * n * n;
      var w = new Float32Array(total);
      var r = mulberry32(cfg.seed >>> 0);
      var span = cfg.wmax - cfg.wmin, ob = cfg.obst || 0;
      for (var i = 0; i < total; i++) {
        var a = r(), b = r();
        w[i] = a < ob ? INF : cfg.wmin + b * span;
      }
      var mid = cfg.wmin + 0.5 * span;
      if (w[0] === INF) w[0] = mid;
      if (w[total - 1] === INF) w[total - 1] = mid;
      return { cfg: cfg, n: n, total: total, w: w, stats: gridStats(w) };
    }

    function offsets(conn) {
      var dx = [], dy = [], dz = [];
      for (var z = -1; z <= 1; z++) for (var y = -1; y <= 1; y++) for (var x = -1; x <= 1; x++) {
        if (!x && !y && !z) continue;
        if (conn === 6 && Math.abs(x) + Math.abs(y) + Math.abs(z) !== 1) continue;
        dx.push(x); dy.push(y); dz.push(z);
      }
      return { K: dx.length, dx: Int8Array.from(dx), dy: Int8Array.from(dy), dz: Int8Array.from(dz) };
    }

    /** Minimum number of steps between two cells on an empty grid. */
    function hopDist(conn, ax, ay, az, bx, by, bz) {
      var a = ax - bx; if (a < 0) a = -a;
      var b = ay - by; if (b < 0) b = -b;
      var c = az - bz; if (c < 0) c = -c;
      return conn === 6 ? a + b + c : (a > b ? (a > c ? a : c) : (b > c ? b : c));
    }

    /* ------------------------------------------------------------------ run context */

    function Ctx(grid, conn, s, t, opts) {
      var n = grid.n;
      this.n = n; this.nn = n * n; this.total = grid.total; this.w = grid.w;
      var o = offsets(conn);
      this.K = o.K; this.dx = o.dx; this.dy = o.dy; this.dz = o.dz; this.conn = conn;
      this.s = s; this.t = t;
      this.sx = s % n; this.sy = ((s / n) | 0) % n; this.sz = (s / (n * n)) | 0;
      this.tx = t % n; this.ty = ((t / n) | 0) % n; this.tz = (t / (n * n)) | 0;
      var eps = opts.hscale == null ? 1 : opts.hscale;
      this.hs = eps * grid.stats.wmin;               // heuristic cost per hop
      this.deadline = opts.deadline ? nowFn() + opts.deadline : INF;
      this.timedOut = false;
      this.mem = 0;
      this.record = !!opts.record;
      this.oc = 4096; this.ol = 0;
      if (this.record) { this.order = new Int32Array(this.oc); this.dirs = new Uint8Array(this.oc); }
    }
    Ctx.prototype.f64 = function (len) { this.mem += len * 8; return new Float64Array(len); };
    Ctx.prototype.i32 = function (len) { this.mem += len * 4; return new Int32Array(len); };
    Ctx.prototype.u8 = function (len) { this.mem += len; return new Uint8Array(len); };
    Ctx.prototype.rec = function (node, dir) {
      if (!this.record) return;
      if (this.ol === this.oc) {
        var no = new Int32Array(this.oc * 2); no.set(this.order); this.order = no;
        var nd = new Uint8Array(this.oc * 2); nd.set(this.dirs); this.dirs = nd;
        this.oc *= 2;
      }
      this.order[this.ol] = node; this.dirs[this.ol] = dir; this.ol++;
    };
    Ctx.prototype.timeUp = function () {
      if (nowFn() > this.deadline) { this.timedOut = true; return true; }
      return false;
    };

    /* ------------------------------------------------------------------ indexed binary min-heap */
    /* Key ties are broken on node index, which makes every run deterministic. */

    function Heap(ctx, cap) {
      this.nodes = ctx.i32(cap);
      this.keys = ctx.f64(cap);
      this.pos = ctx.i32(ctx.total).fill(-1);
      this.size = 0; this.pushes = 0; this.decs = 0; this.pops = 0; this.peak = 0;
    }
    Heap.prototype._up = function (i, node, key) {
      var nodes = this.nodes, keys = this.keys, pos = this.pos;
      while (i > 0) {
        var p = (i - 1) >> 1, pk = keys[p], pn = nodes[p];
        if (pk < key || (pk === key && pn < node)) break;
        nodes[i] = pn; keys[i] = pk; pos[pn] = i; i = p;
      }
      nodes[i] = node; keys[i] = key; pos[node] = i;
    };
    Heap.prototype.push = function (node, key) {
      var i = this.size++;
      this.pushes++;
      if (this.size > this.peak) this.peak = this.size;
      this._up(i, node, key);
    };
    Heap.prototype.decrease = function (node, key) {
      this.decs++;
      this._up(this.pos[node], node, key);
    };
    Heap.prototype.topKey = function () { return this.keys[0]; };
    Heap.prototype.pop = function () {
      var nodes = this.nodes, keys = this.keys, pos = this.pos;
      var top = nodes[0];
      pos[top] = -1; this.pops++;
      var size = --this.size;
      if (size > 0) {
        var node = nodes[size], key = keys[size], i = 0;
        for (;;) {
          var l = 2 * i + 1;
          if (l >= size) break;
          var r = l + 1, c = l;
          if (r < size) { var lk = keys[l], rk = keys[r]; if (rk < lk || (rk === lk && nodes[r] < nodes[l])) c = r; }
          var ck = keys[c], cn = nodes[c];
          if (key < ck || (key === ck && node < cn)) break;
          nodes[i] = cn; keys[i] = ck; pos[cn] = i; i = c;
        }
        nodes[i] = node; keys[i] = key; pos[node] = i;
      }
      return top;
    };

    function tracePath(parent, s, t) {
      var len = 1, v = t;
      while (v !== s) { v = parent[v]; len++; }
      var p = new Int32Array(len);
      v = t;
      for (var i = len - 1; i >= 0; i--) { p[i] = v; v = parent[v]; }
      return p;
    }

    function newStats() {
      return { expanded: 0, distinct: 0, generated: 0, scanned: 0, improved: 0, reopened: 0,
               heapPush: 0, heapDec: 0, heapPop: 0, peakOpen: 0 };
    }
    function absorbHeap(st, h) {
      st.heapPush += h.pushes; st.heapDec += h.decs; st.heapPop += h.pops;
      st.generated += h.pushes; st.peakOpen += h.peak;
    }

    /* ------------------------------------------------------------------ 1. Dijkstra */

    function dijkstra(c) {
      var n = c.n, nn = c.nn, total = c.total, w = c.w, K = c.K, DX = c.dx, DY = c.dy, DZ = c.dz, s = c.s, t = c.t;
      var dist = c.f64(total).fill(INF), parent = c.i32(total).fill(-1), closed = c.u8(total);
      var H = new Heap(c, total), st = newStats(), found = false;
      dist[s] = 0; H.push(s, 0);
      while (H.size > 0) {
        if ((st.expanded & 1023) === 0 && c.timeUp()) break;
        var u = H.pop(); closed[u] = 1; st.expanded++; c.rec(u, 1);
        if (u === t) { found = true; break; }
        var du = dist[u], x = u % n, y = ((u / n) | 0) % n, z = (u / nn) | 0;
        for (var k = 0; k < K; k++) {
          var X = x + DX[k]; if (X < 0 || X >= n) continue;
          var Y = y + DY[k]; if (Y < 0 || Y >= n) continue;
          var Z = z + DZ[k]; if (Z < 0 || Z >= n) continue;
          var v = X + n * (Y + n * Z), wv = w[v];
          if (wv === INF) continue;
          st.scanned++;
          if (closed[v]) continue;
          var nd = du + wv;
          if (nd < dist[v]) {
            dist[v] = nd; parent[v] = u; st.improved++;
            if (H.pos[v] >= 0) H.decrease(v, nd); else H.push(v, nd);
          }
        }
      }
      st.distinct = st.expanded; absorbHeap(st, H);
      return { found: found, path: found ? tracePath(parent, s, t) : null, st: st };
    }

    /* ------------------------------------------------------------------ 2. A* (with re-opening) */

    function astar(c) {
      var n = c.n, nn = c.nn, total = c.total, w = c.w, K = c.K, DX = c.dx, DY = c.dy, DZ = c.dz, s = c.s, t = c.t;
      var hs = c.hs, conn = c.conn, tx = c.tx, ty = c.ty, tz = c.tz;
      var g = c.f64(total).fill(INF), parent = c.i32(total).fill(-1), closed = c.u8(total), seen = c.u8(total);
      var H = new Heap(c, total), st = newStats(), found = false;
      g[s] = 0; H.push(s, hs * hopDist(conn, c.sx, c.sy, c.sz, tx, ty, tz));
      while (H.size > 0) {
        if ((st.expanded & 1023) === 0 && c.timeUp()) break;
        var u = H.pop(); closed[u] = 1; st.expanded++; c.rec(u, 1);
        if (!seen[u]) { seen[u] = 1; st.distinct++; }
        if (u === t) { found = true; break; }
        var gu = g[u], x = u % n, y = ((u / n) | 0) % n, z = (u / nn) | 0;
        for (var k = 0; k < K; k++) {
          var X = x + DX[k]; if (X < 0 || X >= n) continue;
          var Y = y + DY[k]; if (Y < 0 || Y >= n) continue;
          var Z = z + DZ[k]; if (Z < 0 || Z >= n) continue;
          var v = X + n * (Y + n * Z), wv = w[v];
          if (wv === INF) continue;
          st.scanned++;
          var ng = gu + wv;
          if (ng < g[v]) {
            g[v] = ng; parent[v] = u; st.improved++;
            var key = ng + hs * hopDist(conn, X, Y, Z, tx, ty, tz);
            if (H.pos[v] >= 0) H.decrease(v, key);
            else { if (closed[v]) { closed[v] = 0; st.reopened++; } H.push(v, key); }
          }
        }
      }
      absorbHeap(st, H);
      return { found: found, path: found ? tracePath(parent, s, t) : null, st: st };
    }

    /* ------------------------------------------------------------------ 3 + 4. Bidirectional Dijkstra / A* */
    /* Forward search from s, backward search from t over reversed edges.
       Bi-A* uses the consistent average potential pi(v) = (hT(v) - hS(v)) / 2 (Ikeda et al.),
       which turns both searches into plain Dijkstra on non-negative reduced costs.
       Forward key = gF + pi, backward key = gB - pi, stop when topF + topB >= mu. */

    function bidir(c, useH) {
      var n = c.n, nn = c.nn, total = c.total, w = c.w, K = c.K, DX = c.dx, DY = c.dy, DZ = c.dz, s = c.s, t = c.t;
      var hs = useH ? c.hs : 0, conn = c.conn;
      var sx = c.sx, sy = c.sy, sz = c.sz, tx = c.tx, ty = c.ty, tz = c.tz;
      var gF = c.f64(total).fill(INF), gB = c.f64(total).fill(INF);
      var pF = c.i32(total).fill(-1), pB = c.i32(total).fill(-1);
      var cF = c.u8(total), cB = c.u8(total), seen = c.u8(total);
      var HF = new Heap(c, total), HB = new Heap(c, total), st = newStats();
      var mu = INF, ba = -1, bb = -1;

      function pi(X, Y, Z) {
        return hs === 0 ? 0 : 0.5 * hs * (hopDist(conn, X, Y, Z, tx, ty, tz) - hopDist(conn, X, Y, Z, sx, sy, sz));
      }

      if (s === t) {
        st.expanded = 1; st.distinct = 1; c.rec(s, 1);
        return { found: true, path: Int32Array.of(s), st: st };
      }
      gF[s] = 0; HF.push(s, pi(sx, sy, sz));
      gB[t] = 0; HB.push(t, -pi(tx, ty, tz));

      while (HF.size > 0 && HB.size > 0) {
        if ((st.expanded & 1023) === 0 && c.timeUp()) break;
        var kf = HF.topKey(), kb = HB.topKey();
        if (kf + kb >= mu) break;
        var u, x, y, z, k, X, Y, Z, v, wv, key;
        if (kf <= kb) {
          u = HF.pop(); cF[u] = 1; st.expanded++; c.rec(u, 1);
          if (!seen[u]) { seen[u] = 1; st.distinct++; }
          var gu = gF[u]; x = u % n; y = ((u / n) | 0) % n; z = (u / nn) | 0;
          for (k = 0; k < K; k++) {
            X = x + DX[k]; if (X < 0 || X >= n) continue;
            Y = y + DY[k]; if (Y < 0 || Y >= n) continue;
            Z = z + DZ[k]; if (Z < 0 || Z >= n) continue;
            v = X + n * (Y + n * Z); wv = w[v];
            if (wv === INF) continue;
            st.scanned++;
            var ng = gu + wv;
            if (ng < gF[v]) {
              gF[v] = ng; pF[v] = u; st.improved++;
              key = ng + pi(X, Y, Z);
              if (HF.pos[v] >= 0) HF.decrease(v, key);
              else { if (cF[v]) { cF[v] = 0; st.reopened++; } HF.push(v, key); }
              if (gB[v] < INF) { var cand = ng + gB[v]; if (cand < mu) { mu = cand; ba = u; bb = v; } }
            }
          }
        } else {
          v = HB.pop(); cB[v] = 1; st.expanded++; c.rec(v, 2);
          if (!seen[v]) { seen[v] = 1; st.distinct++; }
          var gv = gB[v], wself = w[v];
          x = v % n; y = ((v / n) | 0) % n; z = (v / nn) | 0;
          var nb = gv + wself;
          for (k = 0; k < K; k++) {
            X = x + DX[k]; if (X < 0 || X >= n) continue;
            Y = y + DY[k]; if (Y < 0 || Y >= n) continue;
            Z = z + DZ[k]; if (Z < 0 || Z >= n) continue;
            u = X + n * (Y + n * Z);
            if (w[u] === INF) continue;
            st.scanned++;
            if (nb < gB[u]) {
              gB[u] = nb; pB[u] = v; st.improved++;
              key = nb - pi(X, Y, Z);
              if (HB.pos[u] >= 0) HB.decrease(u, key);
              else { if (cB[u]) { cB[u] = 0; st.reopened++; } HB.push(u, key); }
              if (gF[u] < INF) { var cand2 = gF[u] + nb; if (cand2 < mu) { mu = cand2; ba = u; bb = v; } }
            }
          }
        }
      }
      absorbHeap(st, HF); absorbHeap(st, HB);
      if (mu === INF) return { found: false, path: null, st: st };
      var left = tracePath(pF, s, ba), rightLen = 1, q = bb;
      while (q !== t) { q = pB[q]; rightLen++; }
      var path = new Int32Array(left.length + rightLen);
      path.set(left);
      q = bb;
      for (var i = left.length; i < path.length; i++) { path[i] = q; q = pB[q]; }
      return { found: true, path: path, st: st };
    }

    /* ------------------------------------------------------------------ 5. SPFA (queue-based Bellman-Ford) */
    /* FIFO label-correcting search with an in-queue flag. Because all weights are >= 0, any label
       that is not below the current best distance to the target can be pruned. */

    function spfa(c) {
      var n = c.n, nn = c.nn, total = c.total, w = c.w, K = c.K, DX = c.dx, DY = c.dy, DZ = c.dz, s = c.s, t = c.t;
      var dist = c.f64(total).fill(INF), parent = c.i32(total).fill(-1), inQ = c.u8(total), seen = c.u8(total);
      var cap = total + 1, queue = c.i32(cap), head = 0, tail = 0, qsize = 0, qpeak = 0;
      var st = newStats();
      dist[s] = 0; queue[tail++] = s; inQ[s] = 1; qsize = 1; qpeak = 1; st.generated = 1;
      while (qsize > 0) {
        if ((st.expanded & 1023) === 0 && c.timeUp()) break;
        var u = queue[head++]; if (head === cap) head = 0; qsize--; inQ[u] = 0;
        var du = dist[u];
        if (du >= dist[t]) continue;
        st.expanded++; c.rec(u, 1);
        if (!seen[u]) { seen[u] = 1; st.distinct++; }
        var x = u % n, y = ((u / n) | 0) % n, z = (u / nn) | 0;
        for (var k = 0; k < K; k++) {
          var X = x + DX[k]; if (X < 0 || X >= n) continue;
          var Y = y + DY[k]; if (Y < 0 || Y >= n) continue;
          var Z = z + DZ[k]; if (Z < 0 || Z >= n) continue;
          var v = X + n * (Y + n * Z), wv = w[v];
          if (wv === INF) continue;
          st.scanned++;
          var nd = du + wv;
          if (nd < dist[v] && nd < dist[t]) {
            dist[v] = nd; parent[v] = u; st.improved++;
            if (!inQ[v]) {
              inQ[v] = 1; queue[tail++] = v; if (tail === cap) tail = 0; qsize++; st.generated++;
              if (qsize > qpeak) qpeak = qsize;
            }
          }
        }
      }
      st.peakOpen = qpeak;
      var found = dist[t] < INF && !c.timedOut;
      return { found: found, path: found ? tracePath(parent, s, t) : null, st: st };
    }

    /* ------------------------------------------------------------------ 6. Greedy best-first (not optimal) */
    /* Orders the open list by hop distance to the target only. Fast, complete, but ignores cell cost. */

    function greedy(c) {
      var n = c.n, nn = c.nn, total = c.total, w = c.w, K = c.K, DX = c.dx, DY = c.dy, DZ = c.dz, s = c.s, t = c.t;
      var conn = c.conn, tx = c.tx, ty = c.ty, tz = c.tz;
      var parent = c.i32(total).fill(-1), disc = c.u8(total);
      var H = new Heap(c, total), st = newStats(), found = false;
      disc[s] = 1; H.push(s, hopDist(conn, c.sx, c.sy, c.sz, tx, ty, tz));
      while (H.size > 0) {
        if ((st.expanded & 1023) === 0 && c.timeUp()) break;
        var u = H.pop(); st.expanded++; c.rec(u, 1);
        if (u === t) { found = true; break; }
        var x = u % n, y = ((u / n) | 0) % n, z = (u / nn) | 0;
        for (var k = 0; k < K; k++) {
          var X = x + DX[k]; if (X < 0 || X >= n) continue;
          var Y = y + DY[k]; if (Y < 0 || Y >= n) continue;
          var Z = z + DZ[k]; if (Z < 0 || Z >= n) continue;
          var v = X + n * (Y + n * Z);
          if (w[v] === INF) continue;
          st.scanned++;
          if (disc[v]) continue;
          disc[v] = 1; parent[v] = u; st.improved++;
          H.push(v, hopDist(conn, X, Y, Z, tx, ty, tz));
        }
      }
      st.distinct = st.expanded; absorbHeap(st, H);
      return { found: found, path: found ? tracePath(parent, s, t) : null, st: st };
    }

    /* ------------------------------------------------------------------ registry + runner */

    var META = [
      { key: 'dijkstra', name: 'Dijkstra', short: 'Dijkstra', exact: true,
        structure: 'Indexed binary heap, decrease-key', time: 'O((V + E) log V)', space: 'O(V)',
        stop: 'Target popped from the open list', heuristic: 'none' },
      { key: 'astar', name: 'A*', short: 'A*', exact: 'eps',
        structure: 'Indexed binary heap, re-opening of closed nodes', time: 'O((V + E) log V), often far less', space: 'O(V)',
        stop: 'Target popped from the open list', heuristic: 'epsilon x min-cost x hop distance to target' },
      { key: 'bidijkstra', name: 'Bidirectional Dijkstra', short: 'Bi-Dijkstra', exact: true,
        structure: 'Two indexed heaps, reversed edges for the backward search', time: 'O((V + E) log V)', space: 'O(V)',
        stop: 'topKeyF + topKeyB >= best meeting cost', heuristic: 'none' },
      { key: 'biastar', name: 'Bidirectional A*', short: 'Bi-A*', exact: 'eps',
        structure: 'Two indexed heaps, consistent average potential', time: 'O((V + E) log V)', space: 'O(V)',
        stop: 'topKeyF + topKeyB >= best meeting cost (reduced costs)', heuristic: 'average of the forward and backward potentials' },
      { key: 'spfa', name: 'SPFA (Bellman-Ford)', short: 'SPFA', exact: true,
        structure: 'FIFO ring queue with in-queue flags, bound pruning at the target', time: 'O(V E) worst case', space: 'O(V)',
        stop: 'Queue is empty', heuristic: 'none' },
      { key: 'greedy', name: 'Greedy best-first', short: 'Greedy', exact: false,
        structure: 'Indexed binary heap keyed on hop distance only', time: 'O(V log V)', space: 'O(V)',
        stop: 'Target popped from the open list', heuristic: 'hop distance to target (ignores cell cost)' }
    ];
    var FN = {
      dijkstra: dijkstra, astar: astar,
      bidijkstra: function (c) { return bidir(c, false); },
      biastar: function (c) { return bidir(c, true); },
      spfa: spfa, greedy: greedy
    };

    function exactFor(key, hscale) {
      for (var i = 0; i < META.length; i++) if (META[i].key === key) {
        var e = META[i].exact;
        return e === 'eps' ? (hscale == null ? 1 : hscale) <= 1 + 1e-12 : !!e;
      }
      return false;
    }

    function pathCost(w, path) {
      var s = 0;
      for (var i = 1; i < path.length; i++) s += w[path[i]];
      return s;
    }

    /** One run of one algorithm. opts: { hscale, deadline (ms), record } */
    function runOnce(key, grid, conn, s, t, opts) {
      opts = opts || {};
      var c = new Ctx(grid, conn, s, t, opts);
      var t0 = nowFn();
      var r = FN[key](c);
      var ms = nowFn() - t0;
      var res = {
        key: key, found: r.found && !c.timedOut, timedOut: c.timedOut, ms: ms, mem: c.mem,
        stats: r.st, path: r.found ? r.path : null,
        cost: r.found ? pathCost(grid.w, r.path) : null, hops: r.found ? r.path.length - 1 : null
      };
      if (opts.record) { res.order = c.order.slice(0, c.ol); res.dirs = c.dirs.slice(0, c.ol); }
      return res;
    }

    function percentile(sorted, p) {
      if (!sorted.length) return 0;
      var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
    }
    function summarize(arr) {
      var a = arr.slice().sort(function (x, y) { return x - y; });
      var n = a.length, sum = 0, i;
      for (i = 0; i < n; i++) sum += a[i];
      var mean = n ? sum / n : 0, v = 0;
      for (i = 0; i < n; i++) v += (a[i] - mean) * (a[i] - mean);
      return { n: n, mean: mean, median: percentile(a, 0.5), p95: percentile(a, 0.95),
               std: n > 1 ? Math.sqrt(v / (n - 1)) : 0, min: n ? a[0] : 0, max: n ? a[n - 1] : 0 };
    }

    /** One recorded run (for visualisation) followed by `reps` unrecorded timed runs. */
    function benchmark(key, grid, conn, s, t, opts, reps) {
      opts = opts || {};
      var rec = runOnce(key, grid, conn, s, t, { hscale: opts.hscale, deadline: opts.deadline, record: true });
      var times = [];
      if (!rec.timedOut) {
        for (var i = 0; i < Math.max(1, reps | 0); i++) {
          times.push(runOnce(key, grid, conn, s, t, { hscale: opts.hscale, deadline: opts.deadline, record: false }).ms);
        }
      } else times.push(rec.ms);
      var sm = summarize(times);
      rec.timing = { reps: times.length, median: sm.median, min: sm.min, max: sm.max, mean: sm.mean, std: sm.std };
      rec.exact = exactFor(key, opts.hscale);
      return rec;
    }

    function freeCells(w) { var f = []; for (var i = 0; i < w.length; i++) if (w[i] !== INF) f.push(i); return f; }

    /** Random (s, t) pairs, distinct, drawn from free cells with a seeded stream. */
    function randomPairs(grid, count, seed) {
      var r = mulberry32((seed >>> 0) ^ 0x9e3779b9), free = freeCells(grid.w), out = [];
      while (out.length < count && free.length > 1) {
        var a = free[(r() * free.length) | 0], b = free[(r() * free.length) | 0];
        if (a !== b) out.push([a, b]);
      }
      return out;
    }

    /** Batch benchmark over random pairs. Returns per-algorithm aggregates. */
    function batch(grid, conn, keys, pairs, opts, onProgress) {
      var list = keys.slice();
      if (list.indexOf('dijkstra') < 0) list.unshift('dijkstra');
      var acc = {}, i, j;
      list.forEach(function (k) { acc[k] = { expanded: [], ms: [], gap: [], found: 0, timeouts: 0, optimal: 0 }; });
      var hops = [], unreachable = 0;
      for (i = 0; i < pairs.length; i++) {
        var s = pairs[i][0], t = pairs[i][1], ref = null, runs = {};
        for (j = 0; j < list.length; j++) {
          var r = runOnce(list[j], grid, conn, s, t, { hscale: opts.hscale, deadline: opts.deadline, record: false });
          runs[list[j]] = r;
        }
        ref = runs.dijkstra;
        if (!ref.found) { unreachable++; if (onProgress) onProgress(i + 1, pairs.length); continue; }
        hops.push(ref.hops);
        for (j = 0; j < list.length; j++) {
          var k = list[j], a = acc[k], rr = runs[k];
          if (rr.timedOut) { a.timeouts++; continue; }
          if (!rr.found) continue;
          a.found++; a.expanded.push(rr.stats.expanded); a.ms.push(rr.ms);
          var gap = ref.cost > 0 ? (rr.cost / ref.cost - 1) * 100 : 0;
          if (gap < 1e-9) gap = 0;
          a.gap.push(gap); if (gap === 0) a.optimal++;
        }
        if (onProgress) onProgress(i + 1, pairs.length);
      }
      var out = {};
      list.forEach(function (k) {
        var a = acc[k];
        out[k] = { found: a.found, timeouts: a.timeouts, optimal: a.optimal,
                   expanded: summarize(a.expanded), ms: summarize(a.ms), gap: summarize(a.gap) };
      });
      return { pairs: pairs.length, unreachable: unreachable, hops: summarize(hops), algos: out, order: list };
    }

    /* ------------------------------------------------------------------ message service (worker or main thread) */

    function createService() {
      var grid = null;
      return {
        handle: function (msg, post) {
          var id = msg.id;
          try {
            if (msg.type === 'grid') {
              grid = makeGrid(msg.cfg);
              post({ id: id, type: 'grid', stats: grid.stats });
            } else if (msg.type === 'run') {
              var opts = { hscale: msg.hscale, deadline: msg.deadline };
              for (var i = 0; i < msg.algos.length; i++) {
                var res = benchmark(msg.algos[i], grid, msg.conn, msg.s, msg.t, opts, msg.reps);
                var tr = [];
                if (res.order) tr.push(res.order.buffer, res.dirs.buffer);
                if (res.path) tr.push(res.path.buffer);
                post({ id: id, type: 'result', result: res }, tr);
              }
              post({ id: id, type: 'done' });
            } else if (msg.type === 'batch') {
              var pairs = randomPairs(grid, msg.pairs, msg.seed);
              var summary = batch(grid, msg.conn, msg.algos, pairs,
                { hscale: msg.hscale, deadline: msg.deadline },
                function (d, tot) { post({ id: id, type: 'progress', done: d, total: tot }); });
              post({ id: id, type: 'batch', summary: summary });
              post({ id: id, type: 'done' });
            }
          } catch (e) {
            post({ id: id, type: 'error', message: String(e && e.message || e) });
          }
        }
      };
    }

    return {
      version: '1.0.0',
      META: META, INF: INF,
      makeGrid: makeGrid, gridStats: gridStats, offsets: offsets, hopDist: hopDist,
      runOnce: runOnce, benchmark: benchmark, batch: batch, randomPairs: randomPairs,
      exactFor: exactFor, summarize: summarize, mulberry32: mulberry32,
      createService: createService
    };
  }

  var api = factory();
  api.factorySource = factory.toString();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Algos = api;
})(typeof self !== 'undefined' ? self : this);
