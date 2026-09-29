/* Island Pin Beats — Piano Roll editor (window.IPBPianoRoll).
 * Canvas grid + vertical keyboard + velocity lane in one scroll box (sticky keyboard / ruler / lane), so only the grid
 * scrolls sideways on a phone. The editor edits the pattern object returned by api.getPattern() in place (see
 * pianoroll-data.js for the format) and reports every committed change through api.onChange(). Audio, storage and the
 * transport stay in the host app.
 *   api = { getPattern(), onChange(kind), preview(midi, vel), playTick() → tick | -1, isPlaying(), toast(msg) }
 * Mouse: click empty = add (drag right = longer) · drag note = move · drag right edge = length · right-click / double-click = delete
 * Touch: tap = add · drag empty = scroll · drag note = move · drag right edge = length · long-press = delete
 */
(function () {
  "use strict";
  var P = window.IPBPianoData;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  var history = typeof WeakMap === "function" ? new WeakMap() : null;
  function hist(p) {
    if (!history) return (p.__h || (Object.defineProperty(p, "__h", { value: { u: [], r: [] }, enumerable: false }), p.__h));
    var h = history.get(p); if (!h) { h = { u: [], r: [] }; history.set(p, h); } return h;
  }
  function snap(p) { return JSON.stringify({ bars: p.bars, notes: p.notes }); }

  function create(root, api) {
    root.classList.add("proll");
    root.innerHTML = "";
    var scroller = el("div", "prl-scroll", root);
    scroller.tabIndex = 0;
    scroller.setAttribute("aria-label", "Piano roll grid");
    var inner = el("div", "prl-inner", scroller);
    var corner = el("div", "prl-corner", inner);
    var ruler = el("canvas", "prl-ruler", inner);
    var keys = el("div", "prl-keys", inner);
    var gwrap = el("div", "prl-gwrap", inner);
    var grid = el("canvas", "prl-grid", gwrap);
    var head = el("div", "prl-head", gwrap);
    var lcorner = el("div", "prl-lcorner", inner);
    lcorner.textContent = "VEL";
    var lane = el("canvas", "prl-lane", inner);
    grid.setAttribute("role", "application");
    grid.setAttribute("aria-label", "Notes: click to add, drag to move or lengthen, right-click to delete");

    var st = { tool: "draw", snap: true, zoom: 1, vel: 0.8, lastLen: 0, sel: null, rowH: 14, colW: 24, kw: 58, rh: 22, lh: 58, dpr: 1, gw: 0, gh: 0, drag: null, headX: -1, keyEls: {} };
    var ROWS = P.HIGH - P.LOW + 1;

    function pat() { return api.getPattern(); }
    function gridTicks() { return st.snap ? P.GRIDS[pat().grid] || P.STEP : 1; }
    function tickPx() { return st.colW / P.STEP; }
    function yOf(pitch) { return (P.HIGH - pitch) * st.rowH; }
    function pitchAt(y) { return clamp(P.HIGH - Math.floor(y / st.rowH), P.LOW, P.HIGH); }
    function tickAt(x) { return x / tickPx(); }
    function coarse() { return (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || window.innerWidth < 560; }

    function layout() {
      var p = pat(), small = window.innerWidth < 560;
      st.rowH = coarse() ? 20 : 15;
      st.kw = small ? 44 : 58;
      var avail = (root.clientWidth || 0) - st.kw - 2, fit = avail > 0 ? avail / (p.bars * 16) : 0;
      st.colW = Math.round(Math.max((small ? 20 : 24) * st.zoom, fit) * 100) / 100; // short patterns fill the width
      st.gw = Math.round(p.bars * 16 * st.colW);
      st.gh = ROWS * st.rowH;
      st.dpr = Math.min(2, window.devicePixelRatio || 1);
      inner.style.gridTemplateColumns = st.kw + "px " + st.gw + "px";
      inner.style.gridTemplateRows = st.rh + "px " + st.gh + "px " + st.lh + "px";
      size(grid, st.gw, st.gh); size(ruler, st.gw, st.rh); size(lane, st.gw, st.lh);
      buildKeys();
    }
    function size(cv, w, h) {
      cv.style.width = w + "px"; cv.style.height = h + "px";
      var W = Math.round(w * st.dpr), H = Math.round(h * st.dpr);
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;
    }
    function buildKeys() {
      keys.innerHTML = ""; st.keyEls = {};
      keys.style.height = st.gh + "px";
      for (var m = P.HIGH; m >= P.LOW; m--) {
        var pc = m % 12, black = [1, 3, 6, 8, 10].indexOf(pc) !== -1;
        var k = el("div", "prk " + (black ? "bk" : "wk") + (pc === 0 ? " c" : ""), keys);
        k.style.height = st.rowH + "px";
        k.dataset.p = m;
        if (pc === 0 || st.rowH >= 18 && !black) k.textContent = P.noteName(m);
        st.keyEls[m] = k;
      }
      paintKeys();
    }
    function paintKeys() {
      var p = pat(), pcs = P.scalePcs(p.key, p.scale);
      Object.keys(st.keyEls).forEach(function (m) {
        var k = st.keyEls[m], pc = m % 12;
        k.classList.toggle("out", !!pcs && !pcs[pc]);
        k.classList.toggle("root", !!pcs && pc === p.key);
      });
    }
    keys.addEventListener("pointerdown", function (e) {
      var k = e.target.closest(".prk"); if (!k) return;
      e.preventDefault();
      api.preview(+k.dataset.p, st.vel);
      k.classList.add("hit"); setTimeout(function () { k.classList.remove("hit"); }, 180);
    });

    function draw() {
      drawGrid(); drawRuler(); drawLane();
    }
    function drawGrid() {
      var p = pat(), g = grid.getContext("2d"), d = st.dpr, W = st.gw, H = st.gh, rh = st.rowH, tp = tickPx();
      g.setTransform(d, 0, 0, d, 0, 0);
      var pcs = P.scalePcs(p.key, p.scale);
      for (var m = P.HIGH; m >= P.LOW; m--) {
        var y = yOf(m), pc = m % 12, black = [1, 3, 6, 8, 10].indexOf(pc) !== -1;
        var out = pcs && !pcs[pc];
        g.fillStyle = out ? "#10131a" : black ? "#161a24" : "#1b202c";
        g.fillRect(0, y, W, rh);
        if (pcs && pc === p.key) { g.fillStyle = "rgba(167,139,250,.09)"; g.fillRect(0, y, W, rh); }
        g.fillStyle = pc === 0 ? "#303a52" : "#10131a";
        g.fillRect(0, y + rh - 1, W, 1);
      }
      var gt = P.GRIDS[p.grid] || P.STEP, L = P.lenTicks(p);
      for (var t = 0; t <= L; t += gt) {
        var x = Math.round(t * tp);
        var bar = t % P.TPBAR === 0, beat = t % P.TPB === 0;
        g.fillStyle = bar ? "#46506a" : beat ? "#2b3346" : "#1f2432";
        g.fillRect(x - (bar ? 1 : 0), 0, bar ? 2 : 1, H);
      }
      // alternate bar shading
      for (var b = 1; b < p.bars; b += 2) { g.fillStyle = "rgba(255,255,255,.018)"; g.fillRect(b * P.TPBAR * tp, 0, P.TPBAR * tp, H); }
      g.font = "600 9px ui-monospace, Menlo, Consolas, monospace";
      g.textBaseline = "middle";
      p.notes.forEach(function (n) {
        var x = n.s * tp, w = Math.max(3, n.l * tp), y = yOf(n.p), sel = n === st.sel;
        var a = 0.5 + 0.5 * n.v;
        g.fillStyle = sel ? "rgba(255,255,255,.95)" : "rgba(167,139,250," + a.toFixed(3) + ")";
        roundRect(g, x + 0.5, y + 1, w - 1, rh - 2, 3); g.fill();
        g.fillStyle = sel ? "#6d5bd0" : "rgba(11,13,18,.35)";
        g.fillRect(x + 0.5, y + rh - 3, Math.max(2, (w - 1) * n.v), 2);          // velocity bar
        g.fillStyle = sel ? "#6d5bd0" : "rgba(255,255,255,.55)";
        g.fillRect(x + w - 3, y + 3, 1.5, rh - 6);                               // resize grip
        if (w > 30 && rh >= 14) { g.fillStyle = sel ? "#241c4a" : "#140a2e"; g.fillText(P.noteName(n.p), x + 4, y + rh / 2); }
      });
    }
    function roundRect(g, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    }
    function drawRuler() {
      var p = pat(), g = ruler.getContext("2d"), d = st.dpr, tp = tickPx();
      g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = "#12151d"; g.fillRect(0, 0, st.gw, st.rh);
      g.fillStyle = "#262d3d"; g.fillRect(0, st.rh - 1, st.gw, 1);
      g.font = "700 10px ui-monospace, Menlo, Consolas, monospace"; g.textBaseline = "middle";
      for (var t = 0; t < P.lenTicks(p); t += P.TPB) {
        var x = Math.round(t * tp), bar = t % P.TPBAR === 0;
        g.fillStyle = bar ? "#8a93a8" : "#3a4358";
        g.fillRect(x, bar ? 4 : 12, 1, st.rh - (bar ? 4 : 12));
        if (bar) { g.fillStyle = "#e6e9f0"; g.fillText(String(t / P.TPBAR + 1), x + 4, 9); }
        else if (st.colW * 4 > 34) { g.fillStyle = "#5a6275"; g.fillText((t / P.TPBAR + 1 | 0) + "." + ((t % P.TPBAR) / P.TPB + 1), x + 3, 9); }
      }
    }
    function drawLane() {
      var p = pat(), g = lane.getContext("2d"), d = st.dpr, tp = tickPx(), H = st.lh;
      g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = "#0e1118"; g.fillRect(0, 0, st.gw, H);
      g.fillStyle = "#262d3d"; g.fillRect(0, 0, st.gw, 1);
      for (var t = 0; t <= P.lenTicks(p); t += P.TPB) { g.fillStyle = t % P.TPBAR === 0 ? "#2f374a" : "#1a1f2b"; g.fillRect(Math.round(t * tp), 1, 1, H); }
      var bw = clamp(st.colW * 0.3, 3, 8);
      p.notes.forEach(function (n) {
        var x = n.s * tp + 1, h = Math.max(2, n.v * (H - 10));
        g.fillStyle = n === st.sel ? "#ffffff" : "rgba(167,139,250," + (0.45 + 0.55 * n.v).toFixed(3) + ")";
        g.fillRect(x, H - 3 - h, bw, h);
        g.fillRect(x - 1, H - 4 - h, bw + 2, 2);
      });
    }

    /* ---- editing ---- */
    function begin() { st.before = snap(pat()); }
    function commit(kind) {
      var p = pat(), now = snap(p);
      if (st.before != null && st.before !== now) {
        var h = hist(p); h.u.push(st.before); if (h.u.length > 150) h.u.shift(); h.r.length = 0;
        P.sortNotes(p.notes);
        api.onChange(kind || "edit");
      }
      st.before = null;
      draw();
    }
    function edit(fn, kind) { begin(); var r = fn(pat()); commit(kind); return r; }
    function restore(s) {
      var p = pat(), o = JSON.parse(s);
      p.bars = o.bars; p.notes = o.notes;
      st.sel = null; layout(); draw(); api.onChange("undo");
    }
    function undo() { var p = pat(), h = hist(p); if (!h.u.length) return false; h.r.push(snap(p)); restore(h.u.pop()); return true; }
    function redo() { var p = pat(), h = hist(p); if (!h.r.length) return false; h.u.push(snap(p)); restore(h.r.pop()); return true; }
    function canUndo() { return hist(pat()).u.length > 0; }
    function canRedo() { return hist(pat()).r.length > 0; }

    function noteAt(x, y) {
      var p = pat(), m = pitchAt(y), t = tickAt(x);
      for (var i = p.notes.length - 1; i >= 0; i--) { var n = p.notes[i]; if (n.p === m && t >= n.s && t < n.s + n.l) return n; }
      return null;
    }
    function edgeHit(n, x, touch) {
      var tp = tickPx(), right = (n.s + n.l) * tp, w = n.l * tp;
      var zone = touch ? Math.max(12, Math.min(22, w * 0.4)) : Math.max(5, Math.min(9, w * 0.3));
      return x >= right - zone;
    }
    function localXY(e, cv) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function pitchFor(m) { var p = pat(); return p.snapScale ? P.snapPitch(m, p.key, p.scale) : m; }
    function removeNote(n) { var p = pat(), i = p.notes.indexOf(n); if (i !== -1) p.notes.splice(i, 1); if (st.sel === n) st.sel = null; }
    function addNote(m, t) {
      var p = pat(), g = gridTicks(), L = P.lenTicks(p);
      var s = clamp(Math.floor(t / g) * g, 0, L - 1);
      m = pitchFor(m);
      for (var i = 0; i < p.notes.length; i++) if (p.notes[i].p === m && p.notes[i].s === s) return p.notes[i];
      var len = Math.min(st.lastLen || P.GRIDS[p.grid] || P.STEP, L - s);
      var n = { p: m, s: s, l: Math.max(1, len), v: st.vel };
      p.notes.push(n);
      return n;
    }

    grid.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    grid.addEventListener("dblclick", function (e) {
      var q = localXY(e, grid), n = noteAt(q.x, q.y);
      if (n) edit(function () { removeNote(n); }, "delete");
    });
    grid.addEventListener("pointerdown", function (e) {
      if (st.drag) return;
      var q = localXY(e, grid), touch = e.pointerType === "touch", n = noteAt(q.x, q.y);
      scroller.focus({ preventScroll: true });
      if (e.button === 2) { e.preventDefault(); if (n) edit(function () { removeNote(n); }, "delete"); return; }
      if (e.button !== 0 && !touch) return;
      e.preventDefault();
      try { grid.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      var D = { id: e.pointerId, x0: q.x, y0: q.y, cx0: e.clientX, cy0: e.clientY, sl: scroller.scrollLeft, stp: scroller.scrollTop, touch: touch, moved: false };
      st.drag = D;
      if (st.tool === "erase") {
        begin(); D.mode = "erase";
        if (n) { removeNote(n); drawGrid(); drawLane(); }
        return;
      }
      if (n) {
        begin();
        st.sel = n;
        D.note = n; D.s0 = n.s; D.p0 = n.p; D.l0 = n.l; D.t0 = tickAt(q.x);
        D.mode = edgeHit(n, q.x, touch) ? "resize" : "move";
        api.preview(n.p, n.v);
        if (touch) D.lp = setTimeout(function () { // long-press = delete
          if (st.drag === D && !D.moved) { removeNote(n); D.mode = "done"; commit("delete"); if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) { /* ignore */ } }
        }, 450);
        draw();
        return;
      }
      if (touch) { D.mode = "pending"; return; } // tap = add, drag = scroll
      begin();
      var nn = addNote(pitchAt(q.y), tickAt(q.x));
      st.sel = nn; D.note = nn; D.s0 = nn.s; D.l0 = nn.l; D.mode = "create";
      api.preview(nn.p, nn.v);
      draw();
    });
    grid.addEventListener("pointermove", function (e) {
      var D = st.drag;
      if (!D || D.id !== e.pointerId) return;
      var q = localXY(e, grid), p = pat(), g = gridTicks(), L = P.lenTicks(p);
      var dist = Math.abs(e.clientX - D.cx0) + Math.abs(e.clientY - D.cy0);
      if (dist > (D.touch ? 8 : 3)) D.moved = true;
      if (D.mode === "pending" && D.moved) D.mode = "pan";
      if (D.mode === "pan") { scroller.scrollLeft = D.sl - (e.clientX - D.cx0); scroller.scrollTop = D.stp - (e.clientY - D.cy0); return; }
      if (D.lp && D.moved) { clearTimeout(D.lp); D.lp = null; }
      if (D.mode === "erase") { var n = noteAt(q.x, q.y); if (n) { removeNote(n); drawGrid(); drawLane(); } return; }
      var N = D.note;
      if (!N || !D.moved) return;
      if (D.mode === "move") {
        var dt = tickAt(q.x) - D.t0, s = D.s0 + dt;
        s = st.snap ? Math.round(s / g) * g : Math.round(s);
        N.s = clamp(s, 0, L - Math.min(N.l, L));
        if (N.s + N.l > L) N.l = L - N.s;
        var m = pitchFor(pitchAt(q.y));
        if (m !== N.p) { N.p = m; api.preview(m, N.v); }
      } else if (D.mode === "resize" || D.mode === "create") {
        var end = tickAt(q.x);
        end = st.snap ? Math.round(end / g) * g : Math.round(end);
        N.l = clamp(end - N.s, st.snap ? g : 1, L - N.s);
      }
      drawGrid(); drawLane();
    });
    function endDrag(e) {
      var D = st.drag;
      if (!D || (e && D.id !== e.pointerId)) return;
      st.drag = null;
      if (D.lp) clearTimeout(D.lp);
      if (D.mode === "pending") { // touch tap on empty grid = add
        begin();
        var q = localXY(e, grid), nn = addNote(pitchAt(q.y), tickAt(q.x));
        st.sel = nn; api.preview(nn.p, nn.v);
        commit("add");
        return;
      }
      if (D.mode === "pan" || D.mode === "done") return;
      if ((D.mode === "resize" || D.mode === "create") && D.note && D.moved) st.lastLen = D.note.l;
      commit(D.mode === "erase" ? "delete" : D.mode === "create" ? "add" : "edit");
    }
    grid.addEventListener("pointerup", endDrag);
    grid.addEventListener("pointercancel", function (e) { if (st.drag && st.drag.mode === "pending") st.drag.mode = "pan"; endDrag(e); });
    grid.addEventListener("pointermove", function (e) { // cursor feedback (mouse)
      if (st.drag || e.pointerType === "touch") return;
      var q = localXY(e, grid), n = noteAt(q.x, q.y);
      grid.style.cursor = st.tool === "erase" ? "not-allowed" : n ? (edgeHit(n, q.x, false) ? "ew-resize" : "grab") : "crosshair";
    });

    /* velocity lane */
    var laneDrag = null;
    function laneTargets(x) {
      var p = pat(), tp = tickPx(), best = null, bd = Math.max(8, st.colW * 0.6);
      p.notes.forEach(function (n) { var dx = Math.abs(n.s * tp + 3 - x); if (dx < bd) { bd = dx; best = n.s; } });
      if (best == null) return [];
      var at = p.notes.filter(function (n) { return n.s === best; });
      return st.sel && at.indexOf(st.sel) !== -1 ? [st.sel] : at;
    }
    function laneSet(e) {
      var q = localXY(e, lane), v = clamp(Math.round((1 - (q.y - 3) / (st.lh - 10)) * 100) / 100, 0.05, 1);
      var tg = laneDrag.fixed || laneTargets(q.x);
      if (!laneDrag.fixed && tg.length) laneDrag.fixed = null;
      tg.forEach(function (n) { n.v = v; });
      laneDrag.last = tg;
      drawLane(); drawGrid();
      return tg;
    }
    lane.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      try { lane.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      begin(); laneDrag = { id: e.pointerId, fixed: null };
      var tg = laneTargets(localXY(e, lane).x);
      laneDrag.fixed = tg.length ? tg : null;
      if (tg.length) laneSet(e);
    });
    lane.addEventListener("pointermove", function (e) { if (laneDrag && laneDrag.id === e.pointerId && laneDrag.fixed) laneSet(e); });
    function laneEnd(e) {
      if (!laneDrag || laneDrag.id !== e.pointerId) return;
      var tg = laneDrag.fixed; laneDrag = null;
      commit("velocity");
      if (tg && tg[0]) api.preview(tg[0].p, tg[0].v);
    }
    lane.addEventListener("pointerup", laneEnd);
    lane.addEventListener("pointercancel", laneEnd);

    scroller.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX);
    }, { passive: false });

    function zoom(f, clientX) {
      var r = scroller.getBoundingClientRect(), ax = clientX != null ? clientX - r.left - st.kw : (scroller.clientWidth - st.kw) / 2;
      var tAt = (scroller.scrollLeft + ax) / tickPx();
      var small = window.innerWidth < 560, base = small ? 20 : 24;
      if (f > 1 && st.colW > base * st.zoom + 0.5) st.zoom = st.colW / base; // zooming in from a fitted view starts from what you see
      st.zoom = clamp(st.zoom * f, 0.5, 4);
      layout(); draw();
      scroller.scrollLeft = Math.max(0, tAt * tickPx() - ax);
      api.onChange("view");
    }
    function scrollToNotes(force) {
      var p = pat(), mid = 60;
      if (p.notes.length) {
        var lo = 127, hi = 0; p.notes.forEach(function (n) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); });
        var top = scroller.scrollTop, vis = scroller.clientHeight - st.rh - st.lh;
        var yLo = yOf(lo) + st.rowH, yHi = yOf(hi);
        if (!force && yHi >= top && yLo <= top + vis) return;
        mid = Math.round((lo + hi) / 2);
      }
      var vh = scroller.clientHeight - st.rh - st.lh;
      scroller.scrollTop = Math.max(0, yOf(mid) - vh / 2);
    }
    function tick() {
      var t = api.playTick();
      if (t < 0) { if (st.headX !== -1) { head.style.display = "none"; st.headX = -1; } return; }
      var x = Math.round(t * tickPx());
      if (x === st.headX) return;
      st.headX = x;
      head.style.display = "block";
      head.style.transform = "translateX(" + x + "px)";
      if (!st.drag && api.isPlaying()) {
        var vw = scroller.clientWidth - st.kw, sl = scroller.scrollLeft;
        if (x > sl + vw - 16 || x < sl) scroller.scrollLeft = Math.max(0, x - 12);
      }
    }
    function deleteSelected() {
      if (!st.sel) return false;
      var n = st.sel;
      edit(function () { removeNote(n); }, "delete");
      return true;
    }
    function nudgeSelected(dp, dt) {
      var n = st.sel; if (!n) return false;
      var p = pat(), L = P.lenTicks(p), g = gridTicks();
      edit(function () {
        if (dp) n.p = clamp(n.p + dp, P.LOW, P.HIGH);
        if (dt) n.s = clamp(n.s + dt * g, 0, L - n.l);
      }, "edit");
      api.preview(n.p, n.v);
      return true;
    }
    window.addEventListener("resize", function () {
      var rh = st.rowH, kw = st.kw; layout();
      if (rh !== st.rowH || kw !== st.kw) scrollToNotes(true);
      draw();
    });

    var ed = {
      refresh: function (scroll) { st.sel = null; layout(); draw(); if (scroll) scrollToNotes(true); },
      draw: draw, paintKeys: function () { paintKeys(); draw(); },
      tick: tick, edit: edit, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo,
      deleteSelected: deleteSelected, nudgeSelected: nudgeSelected,
      selected: function () { return st.sel; },
      setTool: function (t) { st.tool = t === "erase" ? "erase" : "draw"; root.classList.toggle("erase", st.tool === "erase"); },
      tool: function () { return st.tool; },
      setSnap: function (b) { st.snap = !!b; }, snap: function () { return st.snap; },
      setVelocity: function (v) { st.vel = clamp(+v || 0.8, 0.05, 1); }, velocity: function () { return st.vel; },
      zoom: zoom, zoomLevel: function () { return st.zoom; }, setZoom: function (z) { st.zoom = clamp(+z || 1, 0.5, 4); layout(); draw(); },
      scrollToNotes: scrollToNotes, clearHistory: function () { var h = hist(pat()); h.u.length = 0; h.r.length = 0; },
      resetLength: function () { st.lastLen = 0; },
      /* geometry for tests / automation: page coordinates of a (pitch, tick) cell centre */
      geom: function () {
        var r = grid.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, rowH: st.rowH, colW: st.colW, tickPx: tickPx(), low: P.LOW, high: P.HIGH,
          scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop, viewW: scroller.clientWidth, viewH: scroller.clientHeight, kw: st.kw, rh: st.rh, lh: st.lh,
          lane: (function () { var q = lane.getBoundingClientRect(); return { left: q.left, top: q.top, height: q.height }; })() };
      },
      scroller: scroller
    };
    layout(); draw();
    return ed;
  }
  window.IPBPianoRoll = { create: create };
})();
