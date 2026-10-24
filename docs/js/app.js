/* Cube Pathfinding Lab — UI, 3D rendering and worker plumbing. Algorithms live in algorithms.js. */
(function () {
  'use strict';
  var A = window.Algos, INF = Infinity, META = A.META;
  var $ = function (id) { return document.getElementById(id); };
  var COLOR = { dijkstra: '#4f7cff', astar: '#12b3a6', bidijkstra: '#e8892b', biastar: '#c4488d', spfa: '#8a6bd6', greedy: '#d9534f' };
  var DEFAULTS = { n: 24, wmin: 1, wmax: 10, obst: 0, conn: 6, seed: 20261024, eps: 1 };
  var PALETTES = {
    Viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
    Magma: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf'],
    Turbo: ['#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#a4fc3c', '#fabb39', '#e4460a', '#7a0403'],
    Coolwarm: ['#3b4cc0', '#8db0fe', '#dddddd', '#f4987a', '#b40426'],
    Slate: ['#1b2230', '#4a5b78', '#9db0cf', '#eef2fa']
  };

  var S = {
    n: 24, cfg: null, eps: 1, grid: null, start: 0, end: 0, pick: 'start',
    results: {}, view: 'bidijkstra', pref: 'bidijkstra', rank: null, dirArr: null, pathMask: null, maxRank: 0, step: 0,
    playing: false, running: false, gen: 0, pending: null, drawn: 0, palName: 'Viridis', batch: null, batchMeta: null
  };

  var READOUT0 = 'Hover a cell for its cost · drag to orbit · scroll to zoom · click to set start or end';
  var fmt = function (n) { return n == null ? '–' : Math.round(n).toLocaleString('en-US'); };
  var fms = function (ms) { return ms < 1 ? ms.toFixed(3) : ms < 10 ? ms.toFixed(2) : ms < 100 ? ms.toFixed(1) : ms.toFixed(0); };
  var el = {};
  ['n', 'wmin', 'wmax', 'obst', 'conn', 'eps', 'seed', 'x0', 'x1', 'y0', 'y1', 'z0', 'z1', 'f0', 'f1', 'cellSize', 'showMode', 'colorMode',
    'sx', 'sy', 'sz', 'ex', 'ey', 'ez', 'reps', 'limit', 'autorun', 'showObst', 'showBox', 'spin', 'pairs'].forEach(function (id) { el[id] = $(id); });

  function metaOf(key) { for (var i = 0; i < META.length; i++) if (META[i].key === key) return META[i]; }
  function idxOf(x, y, z) { return x + S.n * (y + S.n * z); }
  function coordOf(i) { var n = S.n; return [i % n, ((i / n) | 0) % n, (i / (n * n)) | 0]; }
  function setStatus(t) { $('status').textContent = t; }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  /* ================================================================== worker plumbing */

  var worker = null, svc = null, calls = {}, nextId = 1, gridReady = Promise.resolve();

  function onMsg(e) {
    var m = e.data, c = calls[m.id];
    if (!c) return;
    if (m.type === 'result') { if (c.h.result) c.h.result(m.result); }
    else if (m.type === 'progress') { if (c.h.progress) c.h.progress(m); }
    else if (m.type === 'batch') { if (c.h.batch) c.h.batch(m.summary); }
    else if (m.type === 'grid') { delete calls[m.id]; c.res(m.stats); }
    else if (m.type === 'done') { delete calls[m.id]; c.res(); }
    else if (m.type === 'error') { delete calls[m.id]; c.rej(new Error(m.message)); }
  }
  function startWorker() {
    worker = null;
    try {
      var src = 'var Algos=(' + A.factorySource + ')();\nvar svc=Algos.createService();\n' +
        'onmessage=function(e){svc.handle(e.data,function(m,tr){postMessage(m,tr||[])})};';
      var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = onMsg;
      worker.onerror = function () { worker = null; svc = A.createService(); sendGrid(); };
    } catch (e) { worker = null; }
    if (!worker) svc = A.createService();
  }
  function call(msg, h) {
    return new Promise(function (res, rej) {
      var id = nextId++;
      msg.id = id; calls[id] = { h: h || {}, res: res, rej: rej };
      if (worker) worker.postMessage(msg);
      else setTimeout(function () { svc.handle(msg, function (m) { onMsg({ data: m }); }); }, 0);
    });
  }
  function sendGrid() { gridReady = call({ type: 'grid', cfg: S.cfg }).catch(function () { }); return gridReady; }
  function restartWorker() {
    if (worker) { worker.terminate(); }
    Object.keys(calls).forEach(function (id) { var e = new Error('cancelled'); e.cancelled = true; calls[id].rej(e); delete calls[id]; });
    startWorker();
    sendGrid();
  }

  /* ================================================================== three.js scene */

  var canvas = $('gl'), stageEl = $('stage');
  var renderer, scene, camera, controls, mesh, geom, mat, palTex, outline, frameGroup, boxLine, axisLines = [], markS, markE, pathLine;
  var offA, valA, auxA, off, val, aux, mask, pal = new Uint8Array(256 * 4);
  var sceneOK = false;

  function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function buildPalette(name) {
    var stops = PALETTES[name].map(hexRgb);
    for (var i = 0; i < 256; i++) {
      var t = i / 255 * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(t)), u = t - k;
      for (var c = 0; c < 3; c++) pal[i * 4 + c] = Math.round(stops[k][c] * (1 - u) + stops[k + 1][c] * u);
      pal[i * 4 + 3] = 255;
    }
  }

  function initScene() {
    if (!window.THREE || !THREE.OrbitControls) { fail('The 3D library could not be loaded. Check your connection and reload.'); return false; }
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); }
    catch (e) { fail('This browser could not start WebGL, so the 3D view is unavailable.'); return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(new THREE.Color(0x0a0d13), 1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000);
    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.autoRotateSpeed = 0.8;

    buildPalette(S.palName);
    palTex = new THREE.DataTexture(pal, 256, 1, THREE.RGBAFormat);
    palTex.minFilter = palTex.magFilter = THREE.LinearFilter; palTex.needsUpdate = true;

    mat = new THREE.ShaderMaterial({
      uniforms: {
        uPal: { value: palTex }, uScale: { value: 0.9 }, uStep: { value: 0 }, uMaxRank: { value: 1 },
        uMode: { value: 1 }, uOnlyExp: { value: 0 }, uPathOn: { value: 1 },
        uStage: { value: new THREE.Color(0x0a0d13) }
      },
      vertexShader: [
        'attribute vec3 offset; attribute float value; attribute vec3 aux;',
        'uniform float uScale, uStep, uMaxRank, uOnlyExp, uPathOn;',
        'varying float vV; varying float vS; varying float vR; varying vec3 vN;',
        'void main(){',
        '  float ex = (aux.x >= 0.0 && aux.x < uStep) ? 1.0 : 0.0;',
        '  float st = 0.0;',
        '  if (ex > 0.5) st = aux.y > 1.5 ? 2.0 : 1.0;',
        '  if (aux.z > 0.5 && uPathOn > 0.5) st = 3.0;',
        '  if (uOnlyExp > 0.5 && st < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }',
        '  vV = value; vS = st; vR = clamp(aux.x / max(uMaxRank, 1.0), 0.0, 1.0);',
        '  vN = normalize(normalMatrix * normal);',
        '  float sc = st > 2.5 ? min(1.0, uScale * 1.12) : uScale;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position * sc + offset, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float; uniform sampler2D uPal; uniform float uMode; uniform vec3 uStage;',
        'varying float vV; varying float vS; varying float vR; varying vec3 vN;',
        'void main(){',
        '  vec3 base = texture2D(uPal, vec2(clamp(vV, 0.0, 1.0) * 0.992 + 0.004, 0.5)).rgb;',
        '  vec3 col = base;',
        '  if (vV < 0.0) col = vec3(0.24, 0.27, 0.34);',
        '  else if (uMode > 0.5) {',
        '    if (vS > 2.5) col = vec3(1.0, 1.0, 1.0);',
        '    else if (vS > 1.5) col = mix(vec3(0.75, 0.10, 0.45), vec3(1.0, 0.76, 0.45), vR);',
        '    else if (vS > 0.5) col = mix(vec3(0.10, 0.30, 0.85), vec3(0.40, 0.92, 0.98), vR);',
        '    else col = mix(base, uStage, 0.74);',
        '  }',
        '  vec3 L1 = normalize(vec3(0.35, 0.65, 0.7)); vec3 L2 = normalize(vec3(-0.6, -0.2, 0.3));',
        '  float d = 0.50 + 0.42 * max(dot(vN, L1), 0.0) + 0.18 * max(dot(vN, L2), 0.0);',
        '  if (vS > 2.5) d = 1.0;',
        '  gl_FragColor = vec4(col * d, 1.0);',
        '}'
      ].join('\n')
    });

    var base = new THREE.BoxGeometry(1, 1, 1);
    geom = new THREE.InstancedBufferGeometry();
    geom.index = base.index;
    geom.setAttribute('position', base.attributes.position);
    geom.setAttribute('normal', base.attributes.normal);
    mesh = new THREE.Mesh(geom, mat); mesh.frustumCulled = false; scene.add(mesh);

    outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.15, 1.15, 1.15)),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    outline.renderOrder = 10; outline.visible = false; scene.add(outline);

    frameGroup = new THREE.Group(); scene.add(frameGroup);

    markS = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, transparent: true, opacity: 0.95 }));
    markE = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false, transparent: true, opacity: 0.95 }));
    markS.renderOrder = markE.renderOrder = 6; scene.add(markS); scene.add(markE);

    pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfff3a0, depthTest: false, transparent: true, opacity: 0.9 }));
    pathLine.renderOrder = 5; pathLine.visible = false; pathLine.frustumCulled = false; scene.add(pathLine);

    new ResizeObserver(resize).observe(stageEl); resize();
    sceneOK = true;
    return true;
  }
  function fail(msg) {
    var m = document.createElement('div'); m.className = 'err'; m.textContent = msg; stageEl.appendChild(m);
  }
  function resize() {
    if (!renderer) return;
    var w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function placeCamera() {
    var n = S.n;
    camera.position.set(n * 1.15, n * 0.88, n * 1.3);
    camera.far = n * 40; camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = Math.max(2, n * 0.08); controls.maxDistance = n * 8;
    controls.update();
  }
  function buildFrame() {
    var n = S.n;
    while (frameGroup.children.length) { var c = frameGroup.children.pop(); if (c.geometry) c.geometry.dispose(); }
    axisLines = [];
    var box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(n, n, n)),
      new THREE.LineBasicMaterial({ color: 0x7a8396, transparent: true, opacity: 0.55 }));
    frameGroup.add(box);
    var cols = [0xff6b70, 0x45c88a, 0x6f90ff], dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], o = -n / 2, e = n / 2 + Math.max(2, n * 0.14);
    for (var a = 0; a < 3; a++) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([o, o, o, o + dirs[a][0] * (e - o), o + dirs[a][1] * (e - o), o + dirs[a][2] * (e - o)], 3));
      frameGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: cols[a] })));
    }
    frameGroup.visible = el.showBox.checked;
  }
  function allocRender() {
    var total = S.n * S.n * S.n;
    off = new Float32Array(total * 3); val = new Float32Array(total); aux = new Float32Array(total * 3);
    mask = new Uint8Array(total);
    S.rank = new Float32Array(total).fill(-1); S.dirArr = new Uint8Array(total); S.pathMask = new Uint8Array(total);
    offA = new THREE.InstancedBufferAttribute(off, 3); offA.setUsage(THREE.DynamicDrawUsage);
    valA = new THREE.InstancedBufferAttribute(val, 1); valA.setUsage(THREE.DynamicDrawUsage);
    auxA = new THREE.InstancedBufferAttribute(aux, 3); auxA.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('offset', offA); geom.setAttribute('value', valA); geom.setAttribute('aux', auxA);
  }

  /* visible set: slices, cost filter, show mode, enclosed-cell culling */
  function rebuildInstances() {
    if (!sceneOK) return;
    var n = S.n, nn = n * n, w = S.grid.w, st = S.grid.stats, rk = S.rank, pm = S.pathMask, dr = S.dirArr;
    var X0 = +el.x0.value, X1 = +el.x1.value, Y0 = +el.y0.value, Y1 = +el.y1.value, Z0 = +el.z0.value, Z1 = +el.z1.value;
    var f0 = +el.f0.value - 1e-6, f1 = +el.f1.value + 1e-6, showObst = el.showObst.checked;
    var mode = el.showMode.value, hasRes = S.maxRank > 0;
    if (!hasRes && (mode === 'explored' || mode === 'path')) mode = 'shell';
    var x, y, z, i, ok, c = (n - 1) / 2;
    mask.fill(0);
    for (z = Z0; z <= Z1; z++) for (y = Y0; y <= Y1; y++) for (x = X0; x <= X1; x++) {
      i = x + n * (y + n * z);
      var wv = w[i];
      if (wv === INF) ok = showObst && mode !== 'explored' && mode !== 'path';
      else ok = wv >= f0 && wv <= f1;
      if (ok && mode === 'explored') ok = rk[i] >= 0 || pm[i] === 1 || i === S.start || i === S.end;
      else if (ok && mode === 'path') ok = pm[i] === 1 || i === S.start || i === S.end;
      mask[i] = ok ? 1 : 0;
    }
    var cnt = 0, span = st.wmax - st.wmin;
    for (z = Z0; z <= Z1; z++) for (y = Y0; y <= Y1; y++) for (x = X0; x <= X1; x++) {
      i = x + n * (y + n * z);
      if (!mask[i]) continue;
      if (x > 0 && x < n - 1 && y > 0 && y < n - 1 && z > 0 && z < n - 1 &&
        mask[i - 1] && mask[i + 1] && mask[i - n] && mask[i + n] && mask[i - nn] && mask[i + nn]) continue;
      off[cnt * 3] = x - c; off[cnt * 3 + 1] = y - c; off[cnt * 3 + 2] = z - c;
      var v = w[i];
      val[cnt] = v === INF ? -1 : (span > 0 ? (v - st.wmin) / span : 0.5);
      aux[cnt * 3] = rk[i]; aux[cnt * 3 + 1] = dr[i]; aux[cnt * 3 + 2] = pm[i];
      cnt++;
    }
    S.drawn = cnt;
    geom.instanceCount = cnt;
    offA.updateRange.offset = 0; offA.updateRange.count = cnt * 3; offA.needsUpdate = true;
    valA.updateRange.offset = 0; valA.updateRange.count = cnt; valA.needsUpdate = true;
    auxA.updateRange.offset = 0; auxA.updateRange.count = cnt * 3; auxA.needsUpdate = true;
    mat.uniforms.uOnlyExp.value = (mode === 'explored' || mode === 'path') && hasRes ? 1 : 0;
    lastPick = -1; outline.visible = false;
    updateLegend();
  }
  function applyUniforms() {
    if (!sceneOK) return;
    var u = mat.uniforms;
    u.uScale.value = +el.cellSize.value;
    u.uMode.value = (el.colorMode.value === 'search' && S.maxRank > 0) ? 1 : 0;
    u.uStep.value = S.step; u.uMaxRank.value = Math.max(1, S.maxRank);
    u.uPathOn.value = (S.step >= S.maxRank - 0.5 || el.showMode.value === 'path') ? 1 : 0;
  }
  function placeMarkers() {
    if (!sceneOK) return;
    var n = S.n, c = (n - 1) / 2, a = coordOf(S.start), b = coordOf(S.end), r = 0.7 + n / 70;
    markS.position.set(a[0] - c, a[1] - c, a[2] - c); markS.scale.setScalar(r);
    markE.position.set(b[0] - c, b[1] - c, b[2] - c); markE.scale.setScalar(r);
  }
  function updatePathLine() {
    if (!sceneOK) return;
    var r = S.results[S.view];
    if (!r || !r.path) { pathLine.visible = false; return; }
    var n = S.n, c = (n - 1) / 2, p = r.path, pts = new Float32Array(p.length * 3);
    for (var i = 0; i < p.length; i++) { var v = p[i]; pts[i * 3] = v % n - c; pts[i * 3 + 1] = ((v / n) | 0) % n - c; pts[i * 3 + 2] = ((v / (n * n)) | 0) - c; }
    pathLine.geometry.dispose();
    pathLine.geometry = new THREE.BufferGeometry();
    pathLine.geometry.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    pathLine.visible = true;
  }
  function applyTheme() {
    if (!sceneOK) return;
    mat.uniforms.uStage.value.set(0x0a0d13);
  }

  /* ---------- picking: walk the camera ray through the grid (3D DDA) ---------- */
  var ray, ndc, lastPick = -1;
  function pick(cx, cy) {
    var n = S.n, r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var o = ray.ray.origin, d = ray.ray.direction, h = n / 2;
    var org = [o.x + h, o.y + h, o.z + h], dir = [d.x, d.y, d.z], tmin = 0, tmax = Infinity, a;
    for (a = 0; a < 3; a++) {
      if (Math.abs(dir[a]) < 1e-9) { if (org[a] < 0 || org[a] > n) return -1; }
      else {
        var t1 = (0 - org[a]) / dir[a], t2 = (n - org[a]) / dir[a];
        if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; }
        if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    var cell = [0, 0, 0], step = [0, 0, 0], tMax = [0, 0, 0], tDelta = [0, 0, 0];
    for (a = 0; a < 3; a++) {
      var p = org[a] + dir[a] * (tmin + 1e-4);
      cell[a] = Math.min(n - 1, Math.max(0, Math.floor(p)));
      if (Math.abs(dir[a]) < 1e-9) { step[a] = 0; tMax[a] = Infinity; tDelta[a] = Infinity; }
      else { step[a] = dir[a] > 0 ? 1 : -1; tDelta[a] = Math.abs(1 / dir[a]); tMax[a] = ((dir[a] > 0 ? cell[a] + 1 : cell[a]) - org[a]) / dir[a]; }
    }
    var limit = n * 3 + 8;
    for (var s = 0; s < limit; s++) {
      var idx = cell[0] + n * (cell[1] + n * cell[2]);
      if (mask[idx]) return idx;
      a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      cell[a] += step[a]; tMax[a] += tDelta[a];
      if (cell[a] < 0 || cell[a] >= n) return -1;
    }
    return -1;
  }
  function showPick(idx) {
    lastPick = idx;
    var ro = $('readout'), chip = $('chip');
    if (idx < 0) { outline.visible = false; ro.textContent = READOUT0; chip.style.background = '#2a3140'; return; }
    var c = coordOf(idx), cc = (S.n - 1) / 2, wv = S.grid.w[idx], extra = '';
    outline.position.set(c[0] - cc, c[1] - cc, c[2] - cc); outline.visible = true;
    if (idx === S.start) extra = ' · start'; else if (idx === S.end) extra = ' · end';
    else if (S.maxRank > 0 && S.rank[idx] >= 0) extra = ' · expanded #' + fmt(S.rank[idx] + 1) + (S.dirArr[idx] === 2 ? ' (backward)' : S.results[S.view] && S.results[S.view].dirs && hasBackward(S.view) ? ' (forward)' : '');
    if (S.pathMask[idx] === 1 && S.maxRank > 0) extra += ' · on path';
    if (wv === INF) { ro.innerHTML = 'cell (' + c.join(', ') + ') &nbsp;wall'; chip.style.background = '#3d4557'; return; }
    ro.innerHTML = 'cell (' + c.join(', ') + ') &nbsp;cost <b>' + wv.toFixed(2) + '</b>' + extra;
    var span = S.grid.stats.wmax - S.grid.stats.wmin, t = span > 0 ? (wv - S.grid.stats.wmin) / span : 0.5, p = Math.round(t * 255) * 4;
    chip.style.background = 'rgb(' + pal[p] + ',' + pal[p + 1] + ',' + pal[p + 2] + ')';
  }
  function hasBackward(key) { return key === 'bidijkstra' || key === 'biastar'; }

  function updateLegend() {
    var bi = hasBackward(S.view), parts = [
      '<span><i style="background:#22c55e"></i>start</span>', '<span><i style="background:#ef4444"></i>end</span>',
      '<span><i style="background:#3fa9f5"></i>' + (bi ? 'forward search' : 'expanded') + '</span>'];
    if (bi) parts.push('<span><i style="background:#f08a60"></i>backward search</span>');
    parts.push('<span><i style="background:#fff"></i>path</span>');
    parts.push('<span>' + fmt(S.drawn) + ' cubes drawn</span>');
    $('legend').innerHTML = parts.join('');
  }

  /* ================================================================== grid state */

  function readCfg() {
    return { n: +el.n.value, wmin: +el.wmin.value, wmax: +el.wmax.value, obst: +el.obst.value / 100, seed: (+el.seed.value) >>> 0 };
  }
  function nearestFree(idx) {
    var w = S.grid.w, total = w.length;
    if (w[idx] !== INF) return idx;
    for (var d = 1; d < total; d++) {
      if (idx + d < total && w[idx + d] !== INF) return idx + d;
      if (idx - d >= 0 && w[idx - d] !== INF) return idx - d;
    }
    return 0;
  }
  function syncCoordInputs() {
    var a = coordOf(S.start), b = coordOf(S.end);
    el.sx.value = a[0]; el.sy.value = a[1]; el.sz.value = a[2];
    el.ex.value = b[0]; el.ey.value = b[1]; el.ez.value = b[2];
    ['sx', 'sy', 'sz', 'ex', 'ey', 'ez'].forEach(function (k) { el[k].max = S.n - 1; });
  }
  function syncOutputs() {
    $('nO').textContent = el.n.value;
    $('wminO').textContent = (+el.wmin.value).toFixed(1); $('wmaxO').textContent = (+el.wmax.value).toFixed(1);
    $('obstO').textContent = el.obst.value + '%'; $('epsO').textContent = (+el.eps.value).toFixed(2);
    $('cellSizeO').textContent = (+el.cellSize.value).toFixed(2);
    $('xO').textContent = el.x0.value + '–' + el.x1.value; $('yO').textContent = el.y0.value + '–' + el.y1.value;
    $('zO').textContent = el.z0.value + '–' + el.z1.value; $('fO').textContent = (+el.f0.value).toFixed(1) + '–' + (+el.f1.value).toFixed(1);
  }
  function resetSlices() {
    ['x', 'y', 'z'].forEach(function (a) { el[a + '0'].max = el[a + '1'].max = S.n - 1; el[a + '0'].value = 0; el[a + '1'].value = S.n - 1; });
  }
  function gridInfo() {
    var st = S.grid.stats, cells = S.n * S.n * S.n;
    $('gridInfo').textContent = fmt(cells) + ' cells · ' + fmt(st.free) + ' open · weights ' + st.wmin.toFixed(2) + ' to ' + st.wmax.toFixed(2) +
      ' · weights use ' + (cells * 4 / 1e6).toFixed(1) + ' MB · seed ' + S.cfg.seed;
  }

  function invalidate(msg) {
    if (S.running) { restartWorker(); S.running = false; setBusy(false); }
    S.gen++; S.results = {}; S.batch = null; $('batch').hidden = true;
    if (S.rank) { S.rank.fill(-1); S.dirArr.fill(0); S.pathMask.fill(0); }
    S.maxRank = 0; S.step = 0; S.playing = false;
    if (sceneOK) pathLine.visible = false;
    updateScrub(); renderResults();
    if (msg) setStatus(msg);
  }

  var gridTimer = null;
  function scheduleGrid(immediate) {
    syncOutputs();
    clearTimeout(gridTimer);
    gridTimer = setTimeout(rebuildGrid, immediate ? 0 : 140);
  }
  function rebuildGrid(keep) {
    var cfg = readCfg();
    if (cfg.wmin > cfg.wmax) { cfg.wmax = cfg.wmin; el.wmax.value = cfg.wmax; }
    var prevN = S.n, sizeChanged = cfg.n !== prevN || !off;
    var oldS = S.grid ? coordOf(S.start) : [0, 0, 0], oldE = S.grid ? coordOf(S.end) : [cfg.n - 1, cfg.n - 1, cfg.n - 1];
    S.cfg = cfg; S.n = cfg.n; S.eps = +el.eps.value;
    S.grid = A.makeGrid(cfg);
    if (sizeChanged && sceneOK) { allocRender(); buildFrame(); placeCamera(); resetSlices(); }
    else if (sizeChanged) { allocRender2(); resetSlices(); }
    var m = S.n - 1, cl = function (v) { return Math.max(0, Math.min(m, v)); };
    if (S.grid && oldE[0] === prevN - 1 && oldE[1] === prevN - 1 && oldE[2] === prevN - 1) oldE = [m, m, m];   // end was the far corner: follow it
    S.start = nearestFree(idxOf(cl(oldS[0]), cl(oldS[1]), cl(oldS[2])));
    S.end = nearestFree(idxOf(cl(oldE[0]), cl(oldE[1]), cl(oldE[2])));
    if (S.start === S.end) { S.start = 0; S.end = S.grid.total - 1; }
    syncCoordInputs(); syncOutputs(); gridInfo();
    invalidate('Grid rebuilt. ' + (el.autorun.checked && autoAllowed() ? 'Running…' : 'Press Run selected.'));
    sendGrid();
    rebuildInstances(); placeMarkers(); applyUniforms();
    maybeAutorun();
  }
  function allocRender2() { /* WebGL unavailable: keep only the arrays needed for the benchmark code paths */
    var total = S.n * S.n * S.n;
    S.rank = new Float32Array(total).fill(-1); S.dirArr = new Uint8Array(total); S.pathMask = new Uint8Array(total);
  }
  function autoAllowed() { return S.n * S.n * S.n <= 70000; }
  var autoTimer = null;
  function maybeAutorun() {
    clearTimeout(autoTimer);
    if (!el.autorun.checked || !autoAllowed()) return;
    autoTimer = setTimeout(function () { requestRun(selectedKeys()); }, 220);
  }

  /* ================================================================== endpoints */

  function setEndpoint(which, idx, silent) {
    if (S.grid.w[idx] === INF) { setStatus('That cell is a wall. Choose an open cell.'); syncCoordInputs(); return false; }
    if ((which === 'start' && idx === S.end) || (which === 'end' && idx === S.start)) { setStatus('Start and end must be different cells.'); syncCoordInputs(); return false; }
    if (which === 'start') S.start = idx; else S.end = idx;
    syncCoordInputs(); placeMarkers();
    invalidate('Endpoints changed.');
    rebuildInstances(); applyUniforms();
    if (!silent) maybeAutorun();
    return true;
  }
  function readCoordInputs(which) {
    var m = S.n - 1, p = which === 'start' ? ['sx', 'sy', 'sz'] : ['ex', 'ey', 'ez'];
    var v = p.map(function (k) { var q = Math.round(+el[k].value); return Math.max(0, Math.min(m, isNaN(q) ? 0 : q)); });
    setEndpoint(which, idxOf(v[0], v[1], v[2]));
  }

  /* ================================================================== algorithms: list, run, results */

  function buildAlgoList() {
    var h = '';
    META.forEach(function (m) {
      h += '<div class="algo" data-key="' + m.key + '">' +
        '<input type="checkbox" class="inc" id="inc_' + m.key + '" checked aria-label="Run ' + m.name + '">' +
        '<input type="radio" name="viewalgo" id="vw_' + m.key + '" value="' + m.key + '"' + (m.key === S.view ? ' checked' : '') + ' aria-label="Show ' + m.name + ' in 3D">' +
        '<label for="vw_' + m.key + '" class="nm"><span class="sw" style="background:' + COLOR[m.key] + '"></span>' + m.name + '</label>' +
        '<span class="tag" id="tag_' + m.key + '">–</span></div>';
    });
    $('algoList').innerHTML = h;
    META.forEach(function (m) {
      $('vw_' + m.key).addEventListener('change', function () { display(m.key, false, false); });
    });
  }
  function selectedKeys() {
    return META.filter(function (m) { return $('inc_' + m.key).checked; }).map(function (m) { return m.key; });
  }
  function setBusy(b) {
    $('runSel').disabled = b; $('runAll').disabled = b; $('runBatch').disabled = b; $('stop').disabled = !b;
    var bz = $('busy'); bz.hidden = !b; if (b) bz.textContent = 'working…';
  }

  function requestRun(keys) {
    if (!keys.length) { setStatus('Tick at least one algorithm.'); return; }
    if (S.running) { S.pending = keys; return; }
    run(keys);
  }
  function run(keys) {
    S.running = true; setBusy(true);
    var gen = S.gen, reps = +el.reps.value, t0 = performance.now();
    var msg = { type: 'run', algos: keys, conn: +el.conn.value, s: S.start, t: S.end, hscale: S.eps, reps: reps, deadline: +el.limit.value };
    setStatus('Running ' + keys.length + ' algorithm' + (keys.length > 1 ? 's' : '') + ' on ' + fmt(S.grid.total) + ' cells…');
    return gridReady.then(function () {
      return call(msg, {
        result: function (r) {
          if (gen !== S.gen) return;
          S.results[r.key] = r;
          var tag = $('tag_' + r.key);
          if (tag) tag.textContent = r.timedOut ? 'timeout' : r.found ? fmt(r.stats.expanded) : 'no path';
          if (r.key === S.pref) display(r.key, false, true);
          else if (!S.results[S.view] || S.view === r.key) display(r.key, true, false);
          renderResults();
          $('busy').textContent = 'finished ' + metaOf(r.key).short;
        }
      });
    }).then(function () {
      if (gen !== S.gen) return;
      setStatus('Done in ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s. Click a table row or pick a radio button to view another search.');
    }).catch(function (e) {
      if (e && e.cancelled) return;
      setStatus('Error: ' + (e && e.message || e));
    }).then(function () {
      if (gen !== S.gen) return;
      S.running = false; setBusy(false);
      if (S.pending) { var k = S.pending; S.pending = null; run(k); }
    });
  }

  function display(key, temp, autoplay) {
    S.view = key; if (!temp) S.pref = key;
    var rb = $('vw_' + key); if (rb) rb.checked = true;
    S.rank.fill(-1); S.dirArr.fill(0); S.pathMask.fill(0); S.maxRank = 0;
    var r = S.results[key];
    if (r && r.order) {
      var cnt = 0, order = r.order, dirs = r.dirs;
      for (var i = 0; i < order.length; i++) { var v = order[i]; if (S.rank[v] < 0) { S.rank[v] = cnt++; S.dirArr[v] = dirs[i]; } }
      S.maxRank = cnt;
      if (r.path) for (var j = 0; j < r.path.length; j++) S.pathMask[r.path[j]] = 1;
    }
    S.step = S.maxRank; S.playing = false; $('play').textContent = 'Play';
    if (autoplay && S.maxRank > 0 && S.n <= 70) { S.step = 0; S.playing = true; $('play').textContent = 'Pause'; lastT = performance.now(); }
    updateScrub(); rebuildInstances(); updatePathLine(); applyUniforms(); markSelectedRow();
  }
  function updateScrub() {
    var sc = $('scrub');
    sc.max = Math.max(1, S.maxRank); sc.value = Math.floor(S.step); sc.disabled = S.maxRank === 0;
    $('play').disabled = S.maxRank === 0;
    $('stepLabel').textContent = S.maxRank ? fmt(Math.floor(S.step)) + ' / ' + fmt(S.maxRank) + ' expanded' : 'no search yet';
  }

  /* ---------- results table, cards, charts ---------- */

  var COLS = [
    ['Algorithm', null], ['Result', null], ['Cost', 'cost'], ['Hops', 'hops'], ['Expanded', 'exp'], ['Distinct', 'dis'], ['Generated', 'gen'],
    ['Edges scanned', 'sc'], ['Improving relax.', 'imp'], ['Reopened', 'reo'], ['Heap push', 'hp'], ['Heap dec-key', 'hd'], ['Heap pop', 'hpop'],
    ['Peak open', 'peak'], ['Explored %', 'expl'], ['Median ms', 'med'], ['Min–max ms', 'mm'], ['ns / expansion', 'nsx'], ['Working set', 'mem']
  ];
  function bestExact() {
    var best = INF;
    META.forEach(function (m) { var r = S.results[m.key]; if (r && r.found && !r.timedOut && A.exactFor(m.key, S.eps) && r.cost < best) best = r.cost; });
    return best === INF ? null : best;
  }
  function renderResults() {
    var tbl = $('resTable'), keys = META.map(function (m) { return m.key; }).filter(function (k) { return S.results[k]; });
    if (!keys.length) {
      tbl.innerHTML = '<tbody><tr><td class="empty">' + (S.running ? 'Running…' : 'Run the algorithms to fill this table.') + '</td></tr></tbody>';
      $('cards').innerHTML = ''; $('charts').innerHTML = ''; $('resNote').textContent = ''; return;
    }
    var ref = bestExact(), free = S.grid.stats.free, h = '<thead><tr>';
    COLS.forEach(function (c) { h += '<th>' + c[0] + '</th>'; });
    h += '</tr></thead><tbody>';
    keys.forEach(function (k) {
      var r = S.results[k], m = metaOf(k), st = r.stats, t = r.timing, status, cls;
      if (r.timedOut) { status = 'timeout'; cls = 'bad'; }
      else if (!r.found) { status = 'no path'; cls = 'bad'; }
      else if (ref != null && r.cost <= ref * (1 + 1e-9)) { status = '✓ optimal'; cls = 'ok'; }
      else if (ref != null) { status = '+' + ((r.cost / ref - 1) * 100).toFixed(2) + '%'; cls = 'sub'; }
      else { status = '–'; cls = ''; }
      var ok = r.found && !r.timedOut;
      h += '<tr data-key="' + k + '"' + (k === S.view ? ' class="sel"' : '') + '><td><span class="sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;background:' + COLOR[k] + '"></span>' + m.name + '</td>' +
        '<td class="' + cls + '">' + status + '</td>' +
        '<td>' + (ok ? r.cost.toFixed(3) : '–') + '</td><td>' + (ok ? fmt(r.hops) : '–') + '</td>' +
        '<td>' + fmt(st.expanded) + '</td><td>' + fmt(st.distinct) + '</td><td>' + fmt(st.generated) + '</td><td>' + fmt(st.scanned) + '</td>' +
        '<td>' + fmt(st.improved) + '</td><td>' + fmt(st.reopened) + '</td><td>' + fmt(st.heapPush) + '</td><td>' + fmt(st.heapDec) + '</td><td>' + fmt(st.heapPop) + '</td>' +
        '<td>' + fmt(st.peakOpen) + '</td><td>' + (st.distinct / free * 100).toFixed(1) + '</td>' +
        '<td>' + fms(t.median) + '</td><td>' + fms(t.min) + '–' + fms(t.max) + '</td>' +
        '<td>' + fmt(t.median * 1e6 / Math.max(1, st.expanded)) + '</td><td>' + (r.mem / 1e6).toFixed(2) + ' MB</td></tr>';
    });
    tbl.innerHTML = h + '</tbody>';
    Array.prototype.forEach.call(tbl.querySelectorAll('tbody tr'), function (tr) {
      tr.addEventListener('click', function () { display(tr.getAttribute('data-key'), false, false); });
    });
    renderCards(keys, ref); renderCharts(keys);
    $('resNote').textContent = 'Timing: median of ' + S.results[keys[0]].timing.reps + ' timed run' + (S.results[keys[0]].timing.reps > 1 ? 's' : '') +
      ' per algorithm (after one recorded warm-up). Heap counters for the bidirectional searches add both directions. ε = ' + S.eps.toFixed(2) +
      (S.eps > 1 ? ' (above 1, A* and Bi-A* may return a costlier path).' : '.') + ' Click a row to view that search in 3D.';
  }
  function markSelectedRow() {
    Array.prototype.forEach.call(document.querySelectorAll('#resTable tbody tr'), function (tr) {
      tr.classList.toggle('sel', tr.getAttribute('data-key') === S.view);
    });
  }
  function renderCards(keys, ref) {
    var found = keys.filter(function (k) { var r = S.results[k]; return r.found && !r.timedOut; });
    var cards = [];
    if (ref != null) {
      var hops = null; found.forEach(function (k) { if (S.results[k].cost <= ref * (1 + 1e-9) && hops == null) hops = S.results[k].hops; });
      cards.push(['Shortest path cost', ref.toFixed(3), hops + ' hops from (' + coordOf(S.start).join(',') + ') to (' + coordOf(S.end).join(',') + ')']);
    } else cards.push(['Shortest path cost', '–', 'No exact algorithm found a path']);
    if (found.length) {
      var fe = found.slice().sort(function (a, b) { return S.results[a].stats.expanded - S.results[b].stats.expanded; })[0];
      var d = S.results.dijkstra;
      cards.push(['Fewest expansions', metaOf(fe).short + ' · ' + fmt(S.results[fe].stats.expanded), d && d.found ? ((S.results[fe].stats.expanded / d.stats.expanded) * 100).toFixed(1) + '% of Dijkstra' : 'cells taken off the open list']);
      var ft = found.slice().sort(function (a, b) { return S.results[a].timing.median - S.results[b].timing.median; })[0];
      cards.push(['Fastest (median)', metaOf(ft).short + ' · ' + fms(S.results[ft].timing.median) + ' ms', 'includes array allocation']);
      var ex = found.filter(function (k) { return A.exactFor(k, S.eps); });
      var agree = ex.every(function (k) { return Math.abs(S.results[k].cost - ref) <= 1e-9 * Math.max(1, ref); });
      cards.push(['Exact algorithms agree', ex.length > 1 ? (agree ? 'yes, all ' + ex.length : 'NO') : '–', ex.length > 1 ? 'costs match to 1e-9 relative' : 'run two or more exact algorithms']);
    }
    $('cards').innerHTML = cards.map(function (c) {
      return '<div class="card"><div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div><div class="s">' + c[2] + '</div></div>';
    }).join('');
  }
  function bar(title, items, unit) {
    var W = 440, lab = 108, pad = 70, rowH = 24, H = items.length * rowH + 30, mx = 0;
    items.forEach(function (i) { if (i.v > mx) mx = i.v; });
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + title + '"><text x="0" y="12" class="dim">' + title + '</text>';
    items.forEach(function (it, i) {
      var y = 24 + i * rowH, bw = mx > 0 ? Math.max(1, (W - lab - pad) * it.v / mx) : 1;
      s += '<text x="0" y="' + (y + 12) + '">' + it.label + '</text><rect x="' + lab + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="16" rx="2" fill="' + it.color + '"/>' +
        '<text x="' + (lab + bw + 6).toFixed(1) + '" y="' + (y + 12) + '" class="dim">' + it.txt + '</text>';
    });
    return '<div class="chart">' + s + '</svg></div>';
  }
  function renderCharts(keys) {
    var ok = keys.filter(function (k) { return S.results[k].found && !S.results[k].timedOut; });
    if (!ok.length) { $('charts').innerHTML = ''; return; }
    var mk = function (fn, tf) { return ok.map(function (k) { var v = fn(S.results[k]); return { label: metaOf(k).short, v: v, color: COLOR[k], txt: tf(v) }; }); };
    $('charts').innerHTML =
      bar('Nodes expanded', mk(function (r) { return r.stats.expanded; }, fmt)) +
      bar('Median time (ms)', mk(function (r) { return r.timing.median; }, fms)) +
      bar('Peak open-list size', mk(function (r) { return r.stats.peakOpen; }, fmt)) +
      bar('Working set (MB)', mk(function (r) { return r.mem / 1e6; }, function (v) { return v.toFixed(1); }));
  }

  function renderTech() {
    var h = '<thead><tr><th>Algorithm</th><th>Optimal</th><th>Open-list structure</th><th>Worst-case time</th><th>Space</th><th>Stop rule</th><th>Heuristic</th></tr></thead><tbody>';
    META.forEach(function (m) {
      h += '<tr style="cursor:default"><td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;background:' + COLOR[m.key] + '"></span>' + m.name + '</td>' +
        '<td>' + (m.exact === true ? 'yes' : m.exact === 'eps' ? 'yes for ε ≤ 1' : 'no') + '</td><td style="white-space:normal;text-align:left;min-width:220px">' + m.structure + '</td><td>' + m.time + '</td><td>' + m.space +
        '</td><td style="white-space:normal;text-align:left;min-width:200px">' + m.stop + '</td><td style="white-space:normal;text-align:left;min-width:200px">' + m.heuristic + '</td></tr>';
    });
    $('techTable').innerHTML = h + '</tbody>';
  }

  /* ---------- batch benchmark ---------- */

  function runBatch() {
    var keys = selectedKeys();
    if (!keys.length) { setStatus('Tick at least one algorithm.'); return; }
    if (S.running) return;
    S.running = true; setBusy(true);
    var gen = S.gen, prog = $('batchProg'); prog.hidden = false; prog.value = 0; prog.max = +el.pairs.value;
    setStatus('Batch benchmark running…');
    gridReady.then(function () {
      return call({ type: 'batch', algos: keys, conn: +el.conn.value, pairs: +el.pairs.value, seed: S.cfg.seed, hscale: S.eps, deadline: +el.limit.value }, {
        progress: function (m) { if (gen === S.gen) { prog.value = m.done; prog.max = m.total; } },
        batch: function (sum) { if (gen === S.gen) { S.batch = sum; renderBatch(sum); } }
      });
    }).then(function () { if (gen === S.gen) setStatus('Batch finished.'); })
      .catch(function (e) { if (!(e && e.cancelled)) setStatus('Error: ' + (e && e.message || e)); })
      .then(function () { prog.hidden = true; if (gen !== S.gen) return; S.running = false; setBusy(false); });
  }
  function renderBatch(sum) {
    $('batch').hidden = false;
    $('batchNote').textContent = sum.pairs + ' random pairs on the current cube (' + S.n + '³, ' + el.conn.value + ' moves, seed ' + S.cfg.seed + '); ' +
      sum.unreachable + ' unreachable; mean ' + sum.hops.mean.toFixed(1) + ' hops on the optimal path (σ ' + sum.hops.std.toFixed(1) + '). One timed run per pair and algorithm, so expect more timing noise than the single-pair table.';
    var h = '<thead><tr><th>Algorithm</th><th>Solved</th><th>Optimal</th><th>Expanded mean</th><th>median</th><th>p95</th><th>σ</th><th>Time mean ms</th><th>median</th><th>p95</th><th>σ</th><th>Gap mean %</th><th>Gap max %</th></tr></thead><tbody>';
    sum.order.forEach(function (k) {
      var a = sum.algos[k], m = metaOf(k);
      h += '<tr style="cursor:default"><td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;background:' + COLOR[k] + '"></span>' + m.name + '</td>' +
        '<td>' + a.found + '/' + (sum.pairs - sum.unreachable) + (a.timeouts ? ' (' + a.timeouts + ' timeouts)' : '') + '</td><td>' + a.optimal + '</td>' +
        '<td>' + fmt(a.expanded.mean) + '</td><td>' + fmt(a.expanded.median) + '</td><td>' + fmt(a.expanded.p95) + '</td><td>' + fmt(a.expanded.std) + '</td>' +
        '<td>' + fms(a.ms.mean) + '</td><td>' + fms(a.ms.median) + '</td><td>' + fms(a.ms.p95) + '</td><td>' + fms(a.ms.std) + '</td>' +
        '<td>' + a.gap.mean.toFixed(2) + '</td><td>' + a.gap.max.toFixed(2) + '</td></tr>';
    });
    $('batchTable').innerHTML = h + '</tbody>';
    $('batch').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- share and export ---------- */

  function copyText(text, note) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { }
      document.body.removeChild(ta);
      $('copyNote').textContent = ok ? note : 'Copy was blocked by the browser. Select the text from the results table instead.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { $('copyNote').textContent = note; }, fallback);
    } else fallback();
  }
  function shareUrl() {
    var a = coordOf(S.start), b = coordOf(S.end), c = S.cfg;
    var q = new URLSearchParams({ n: c.n, min: c.wmin, max: c.wmax, obs: Math.round(c.obst * 100), conn: el.conn.value, seed: c.seed, eps: S.eps,
      s: a.join(','), t: b.join(','), view: S.view, show: el.showMode.value, color: el.colorMode.value });
    var base = ''; try { base = location.origin + location.pathname; } catch (e) { }
    return base + '?' + q.toString() + '&run=all';
  }
  function exportJson() {
    var out = { config: S.cfg, conn: +el.conn.value, epsilon: S.eps, start: coordOf(S.start), end: coordOf(S.end), gridStats: S.grid.stats, results: {} };
    Object.keys(S.results).forEach(function (k) {
      var r = S.results[k];
      out.results[k] = { found: r.found, timedOut: r.timedOut, cost: r.cost, hops: r.hops, stats: r.stats, timing: r.timing, workingSetBytes: r.mem };
    });
    if (S.batch) out.batch = S.batch;
    return JSON.stringify(out, null, 2);
  }
  function exportCsv() {
    var rows = [['algorithm', 'found', 'cost', 'hops', 'expanded', 'distinct', 'generated', 'edges_scanned', 'improving', 'reopened', 'heap_push', 'heap_dec', 'heap_pop', 'peak_open', 'median_ms', 'min_ms', 'max_ms', 'working_set_bytes']];
    META.forEach(function (m) {
      var r = S.results[m.key]; if (!r) return; var s = r.stats, t = r.timing;
      rows.push([m.key, r.found, r.cost == null ? '' : r.cost, r.hops == null ? '' : r.hops, s.expanded, s.distinct, s.generated, s.scanned, s.improved, s.reopened, s.heapPush, s.heapDec, s.heapPop, s.peakOpen, t.median, t.min, t.max, r.mem]);
    });
    return rows.map(function (r) { return r.join(','); }).join('\n');
  }

  /* ================================================================== wiring */

  function bindUi() {
    ['n', 'wmin', 'wmax', 'obst', 'conn', 'seed'].forEach(function (k) {
      el[k].addEventListener('input', function () { scheduleGrid(false); });
      el[k].addEventListener('change', function () { scheduleGrid(true); });
    });
    el.eps.addEventListener('input', function () { S.eps = +el.eps.value; syncOutputs(); });
    el.eps.addEventListener('change', function () { S.eps = +el.eps.value; invalidate('Heuristic scale changed.'); rebuildInstances(); applyUniforms(); maybeAutorun(); });
    $('reshuffle').addEventListener('click', function () { el.seed.value = (Math.random() * 4294967296) >>> 0; scheduleGrid(true); });
    $('reset').addEventListener('click', function () { applyDefaults(); scheduleGrid(true); });

    document.querySelectorAll('input[name="pick"]').forEach(function (r) { r.addEventListener('change', function () { S.pick = r.value; }); });
    ['sx', 'sy', 'sz'].forEach(function (k) { el[k].addEventListener('change', function () { readCoordInputs('start'); }); });
    ['ex', 'ey', 'ez'].forEach(function (k) { el[k].addEventListener('change', function () { readCoordInputs('end'); }); });
    $('corners').addEventListener('click', function () { S.start = 0; S.end = S.grid.total - 1; syncCoordInputs(); placeMarkers(); invalidate('Endpoints changed.'); rebuildInstances(); applyUniforms(); maybeAutorun(); });
    $('swap').addEventListener('click', function () { var t = S.start; S.start = S.end; S.end = t; syncCoordInputs(); placeMarkers(); invalidate('Endpoints swapped.'); rebuildInstances(); applyUniforms(); maybeAutorun(); });
    $('randomPair').addEventListener('click', function () {
      var p = A.randomPairs(S.grid, 1, (Math.random() * 4294967296) >>> 0)[0];
      if (!p) return; S.start = p[0]; S.end = p[1]; syncCoordInputs(); placeMarkers(); invalidate('Endpoints changed.'); rebuildInstances(); applyUniforms(); maybeAutorun();
    });

    $('runSel').addEventListener('click', function () { requestRun(selectedKeys()); });
    $('runAll').addEventListener('click', function () { META.forEach(function (m) { $('inc_' + m.key).checked = true; }); requestRun(selectedKeys()); });
    $('stop').addEventListener('click', function () { restartWorker(); S.running = false; S.pending = null; setBusy(false); setStatus('Stopped. The worker was restarted.'); });
    $('runBatch').addEventListener('click', runBatch);

    ['x0', 'x1', 'y0', 'y1', 'z0', 'z1', 'f0', 'f1'].forEach(function (k) {
      el[k].addEventListener('input', function () {
        var pair = { x0: 'x1', y0: 'y1', z0: 'z1', f0: 'f1' }, lo = k.charAt(1) === '0';
        if (lo) { if (+el[k].value > +el[pair[k]].value) el[pair[k]].value = el[k].value; }
        else { var l = k.charAt(0) + '0'; if (+el[k].value < +el[l].value) el[l].value = el[k].value; }
        syncOutputs(); rebuildInstances();
      });
    });
    el.cellSize.addEventListener('input', function () { syncOutputs(); applyUniforms(); });
    el.showMode.addEventListener('change', function () { rebuildInstances(); applyUniforms(); });
    el.colorMode.addEventListener('change', applyUniforms);
    el.showObst.addEventListener('change', rebuildInstances);
    el.showBox.addEventListener('change', function () { if (sceneOK) frameGroup.visible = el.showBox.checked; });
    el.spin.addEventListener('change', function () { if (sceneOK) controls.autoRotate = el.spin.checked; });
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        resetSlices(); el.f0.value = 0; el.f1.value = 10; var n = S.n, mid = Math.floor((n - 1) / 2), th = Math.max(0, Math.round(n / 14));
        if (b.dataset.view === 'open') el.x1.value = mid;
        else if (b.dataset.view === 'slab') { el.z0.value = Math.max(0, mid - th); el.z1.value = Math.min(n - 1, mid + th); }
        syncOutputs(); rebuildInstances();
      });
    });
    var pb = $('pal');
    Object.keys(PALETTES).forEach(function (name) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.name = name;
      b.innerHTML = '<i style="background:linear-gradient(90deg,' + PALETTES[name].join(',') + ')"></i><span>' + name + '</span>';
      b.addEventListener('click', function () { S.palName = name; buildPalette(name); if (sceneOK) palTex.needsUpdate = true; paintPal(); showPick(lastPick); });
      pb.appendChild(b);
    });
    paintPal();

    $('play').addEventListener('click', function () {
      if (S.maxRank === 0) return;
      if (S.playing) { S.playing = false; $('play').textContent = 'Play'; return; }
      if (S.step >= S.maxRank) S.step = 0;
      S.playing = true; $('play').textContent = 'Pause'; lastT = performance.now();
    });
    $('scrub').addEventListener('input', function () { S.step = +$('scrub').value; S.playing = false; $('play').textContent = 'Play'; updateScrub(); applyUniforms(); });
    $('camReset').addEventListener('click', function () { if (sceneOK) placeCamera(); });

    $('copyLink').addEventListener('click', function () { copyText(shareUrl(), 'Link copied. Open it to restore this exact cube and algorithm.'); });
    $('copyJson').addEventListener('click', function () { copyText(exportJson(), 'Results copied as JSON.'); });
    $('copyCsv').addEventListener('click', function () { copyText(exportCsv(), 'Results copied as CSV.'); });

    if (sceneOK) {
      canvas.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse' || e.buttons) return;
        var idx = pick(e.clientX, e.clientY); if (idx !== lastPick) showPick(idx);
      });
      canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') showPick(-1); });
      var dx = 0, dy = 0;
      canvas.addEventListener('pointerdown', function (e) { dx = e.clientX; dy = e.clientY; });
      canvas.addEventListener('pointerup', function (e) {
        if (Math.abs(e.clientX - dx) + Math.abs(e.clientY - dy) > 5) return;
        var idx = pick(e.clientX, e.clientY);
        if (idx < 0) return;
        showPick(idx);
        if (setEndpoint(S.pick, idx) && S.pick === 'start') {
          S.pick = 'end'; document.querySelector('input[name="pick"][value="end"]').checked = true;
        }
      });
    }
  }
  function paintPal() {
    Array.prototype.forEach.call(document.querySelectorAll('#pal button'), function (b) { b.setAttribute('aria-pressed', b.dataset.name === S.palName ? 'true' : 'false'); });
  }
  function applyDefaults() {
    el.n.value = DEFAULTS.n; el.wmin.value = DEFAULTS.wmin; el.wmax.value = DEFAULTS.wmax; el.obst.value = DEFAULTS.obst;
    el.conn.value = DEFAULTS.conn; el.seed.value = DEFAULTS.seed; el.eps.value = DEFAULTS.eps; S.eps = DEFAULTS.eps;
    el.cellSize.value = 0.9; el.showMode.value = 'explored'; el.colorMode.value = 'search'; el.f0.value = 0; el.f1.value = 10;
    S.pick = 'start'; document.querySelector('input[name="pick"][value="start"]').checked = true;
    S.start = 0; S.end = 0; S.grid = null; off = null;
    syncOutputs();
  }

  /* ---------- animation loop ---------- */
  var lastT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!sceneOK) return;
    if (S.playing) {
      var dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      S.step += dt * S.maxRank / +$('speed').value;
      if (S.step >= S.maxRank) { S.step = S.maxRank; S.playing = false; $('play').textContent = 'Play'; }
      updateScrub(); applyUniforms();
    }
    controls.update();
    renderer.render(scene, camera);
  }

  /* ---------- URL parameters ---------- */
  function readParams() {
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return {}; }
    var P = {};
    function num(k, lo, hi) { if (q.has(k)) { var v = parseFloat(q.get(k)); if (!isNaN(v)) return Math.max(lo, Math.min(hi, v)); } return null; }
    var v;
    if ((v = num('n', 3, 100)) != null) el.n.value = Math.round(v);
    if ((v = num('min', 0, 10)) != null) el.wmin.value = v;
    if ((v = num('max', 0, 10)) != null) el.wmax.value = v;
    if ((v = num('obs', 0, 40)) != null) el.obst.value = Math.round(v);
    if ((v = num('seed', 0, 4294967295)) != null) el.seed.value = Math.round(v);
    if ((v = num('eps', 0, 3)) != null) { el.eps.value = v; S.eps = v; }
    if (q.has('conn') && (q.get('conn') === '6' || q.get('conn') === '26')) el.conn.value = q.get('conn');
    if (q.has('show') && /^(shell|all|explored|path)$/.test(q.get('show'))) el.showMode.value = q.get('show');
    if (q.has('color') && /^(search|cost)$/.test(q.get('color'))) el.colorMode.value = q.get('color');
    if (q.has('view') && metaOf(q.get('view'))) { S.view = q.get('view'); S.pref = S.view; }
    var tri = function (k) { if (!q.has(k)) return null; var p = q.get(k).split(',').map(Number); return p.length === 3 && p.every(function (x) { return isFinite(x); }) ? p : null; };
    P.s = tri('s'); P.t = tri('t'); P.run = q.get('run');
    return P;
  }

  /* ================================================================== boot */

  function boot() {
    buildAlgoList(); renderTech();
    startWorker();
    var okScene = initScene();
    if (okScene) { ray = new THREE.Raycaster(); ndc = new THREE.Vector2(); }
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.spin.checked = false;
    var P = readParams();
    S.n = +el.n.value;
    // first grid
    var cfg = readCfg(); S.cfg = cfg; S.n = cfg.n; S.eps = +el.eps.value; S.grid = A.makeGrid(cfg);
    if (okScene) { allocRender(); buildFrame(); placeCamera(); } else allocRender2();
    resetSlices();
    S.start = 0; S.end = S.grid.total - 1;
    if (P.s) S.start = nearestFree(idxOf.apply(null, P.s.map(function (v) { return Math.max(0, Math.min(S.n - 1, Math.round(v))); })));
    if (P.t) S.end = nearestFree(idxOf.apply(null, P.t.map(function (v) { return Math.max(0, Math.min(S.n - 1, Math.round(v))); })));
    if (S.start === S.end) { S.start = 0; S.end = S.grid.total - 1; }
    off = off || null;
    syncCoordInputs(); syncOutputs(); gridInfo(); bindUi();
    var rb = $('vw_' + S.view); if (rb) rb.checked = true;
    sendGrid();
    if (okScene) { rebuildInstances(); placeMarkers(); applyUniforms(); }
    updateScrub(); renderResults();
    requestAnimationFrame(loop);
    if (P.run === 'all') { META.forEach(function (m) { $('inc_' + m.key).checked = true; }); requestRun(selectedKeys()); }
    else if (el.autorun.checked && autoAllowed()) maybeAutorun();
    else setStatus('Large grid: press Run selected.');
    if (reduce) setStatus($('status').textContent);
  }
  boot();
})();
