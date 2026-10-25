/* ===== 02 Interior: Glass Earth ============================================ */
(() => {
  const R = ROF;
  const $ = (id) => document.getElementById(id);
  // Same order as REGIONS in crates/globe/src/glass.rs; preset k is SLABS[k - 1].
  const SLABS = ["Tonga–Kermadec", "Japan–Kuril–Kamchatka", "Central Andes", "Izu–Bonin–Mariana", "Hindu Kush"];
  const HOME_LON = 172; // the whole-planet wedge faces this longitude (HOME_LON in glass.rs)
  const R_KM = 6371;
  const FLY_S = 2.4;
  const COMPASS_SHORT = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

  const st = {
    exag: 4, cut: true, flags: 4, auto: !R.reduceMotion, preset: 0,
    hover: -1, dirty: true, scale: 1, k: 1, css: 1, perf: 0, skipPerf: true,
    dragging: false, lastInput: -1e9, lastMove: 0, vel: [0, 0], statsAt: 0, flying: false,
  };
  let canvas, ctx, stage, tip, slabs = [], maxDepth = 0;

  R.view({
    id: "glass",
    init() {
      canvas = $("glass-canvas");
      ctx = canvas.getContext("2d");
      stage = $("glass-stage");
      tip = $("glass-tip");
      buildPanel();
      wireControls();
      wireCanvas();
      R.sized(stage, resize);
      resize();
      R.on("select", (i) => {
        st.dirty = true;
        if (i < 0) tip.hidden = true;
        else if (R.q(i).t > R.state.cursor) R.setCursor(R.tEnd, "glass");
      });
      R.on("cursor", () => { st.dirty = true; });
    },
    frame(dt, now) {
      const W = R.W;
      const idle = !st.dragging && now - st.lastInput > 4000;
      const auto = st.auto && !R.reduceMotion && idle && R.state.selected < 0;
      const flying = W.glass_flying() === 1;
      // The core churns while anything moves; a still view costs nothing.
      const animate = !R.reduceMotion && (auto || flying || st.dragging);
      const moved = W.glass_tick(dt, auto ? 1 : 0, animate ? 1 : 0) === 1;
      if (flying !== st.flying) {
        st.flying = flying;
        document.querySelectorAll("#glass-presets [aria-busy]").forEach((b) => b.removeAttribute("aria-busy"));
      }
      if (moved || animate || st.dirty) draw(now);
    },
  });

  // ----- panel -----
  function buildPanel() {
    const W = R.W;
    let deep = 0;
    for (let i = 0; i < R.n; i++) {
      const d = R.cat[i * 5 + 3];
      if (d >= 300) deep++;
      if (d > maxDepth) maxDepth = d;
    }
    $("glass-lede-deep").textContent = `up to ${R.num(Math.round(maxDepth))} km deep`;
    slabs = SLABS.map((name, j) => {
      const deepest = W.glass_slab(j, 2);
      return {
        name, n: W.glass_slab(j, 0), deep: W.glass_slab(j, 1), dip: W.glass_slab(j, 3),
        dipAz: W.glass_slab(j, 5), maxDepth: R.q(deepest).depth,
      };
    });
    const rows = [{
      name: "Whole planet", tag: "quarter cut away",
      d: `${R.num(R.n)} quakes · ${R.num(deep)} at 300 km or deeper`,
    }].concat(slabs.map((s) => {
      const dir = COMPASS_SHORT[Math.round(s.dipAz / 22.5) % 16];
      return {
        name: s.name, tag: Number.isFinite(s.dip) ? `dips ${Math.round(s.dip)}° ${dir}` : "",
        d: `${R.num(s.n)} quakes · ${s.deep ? `${R.num(s.deep)} at 300 km or deeper` : "none at 300 km"} · down to ${R.num(Math.round(s.maxDepth))} km`,
      };
    }));
    $("glass-presets").innerHTML = rows.map((r, k) =>
      `<li><button type="button" data-preset="${k}" id="glass-preset-${k}"${k === 0 ? ' aria-current="true"' : ""}><span class="t">${R.esc(r.name)}<em>${R.esc(r.tag)}</em></span><span class="d">${R.esc(r.d)}</span></button></li>`).join("");
    const top = slabs[0];
    $("glass-why-2").textContent += ` ${top.name} alone holds ${R.num(top.deep)} of the ${R.num(deep)} quakes 300 km or deeper in this catalogue, and none anywhere is deeper than ${R.num(Math.round(maxDepth))} km.`;
    if (R.coarse) $("glass-hint").textContent = "drag to turn · pinch to zoom · tap a quake";
    syncExag();
    syncSweep();
  }

  function goPreset(k) {
    const W = R.W;
    st.preset = k;
    W.glass_preset(k, R.reduceMotion ? 0 : FLY_S);
    st.lastInput = performance.now() + FLY_S * 1000;
    document.querySelectorAll("#glass-presets button").forEach((b) => {
      const on = +b.dataset.preset === k;
      b.toggleAttribute("aria-current", on);
      if (on) b.setAttribute("aria-current", "true");
      if (on && !R.reduceMotion) b.setAttribute("aria-busy", "true");
    });
    $("glass-where").textContent = k ? SLABS[k - 1] : "Whole planet";
    syncSweep(true);
    st.statsAt = 0;
    st.dirty = true;
  }

  function syncExag() {
    const v = st.exag;
    const txt = v === 1 ? "×1" : `×${R.num(v, v % 1 ? 1 : 0)}`;
    $("glass-exag-out").textContent = txt;
    $("glass-scale").textContent = v === 1 ? "depths at true scale" : `depths stretched ${txt}`;
    $("glass-exag-note").textContent = v === 1
      ? "True scale. Even the deepest quakes sit in the outer tenth of the radius."
      : `${txt} near the surface, less with depth, so the core keeps its true size. The deepest quake, ${R.num(Math.round(maxDepth))} km down, is drawn at ${R.num(Math.round(R.W.glass_stretch(maxDepth)))} km.`;
  }

  /** Slider meaning: whole planet turns the wedge (degrees), a slab slides the slice along the trench (km). */
  function syncSweep(reset) {
    const el = $("glass-sweep");
    if (reset) {
      if (st.preset === 0) { el.min = -180; el.max = 180; el.step = 1; } else { el.min = -800; el.max = 800; el.step = 10; }
      el.value = 0;
      R.W.glass_sweep(0);
    }
    const v = +el.value;
    el.disabled = !st.cut;
    if (st.preset === 0) {
      $("glass-sweep-label").textContent = "Turn the cut";
      let lon = ((HOME_LON + v + 540) % 360) - 180;
      $("glass-sweep-out").textContent = lon === 0 || Math.abs(lon) === 180 ? `${Math.abs(lon)}°` : `faces ${Math.abs(lon)}°${lon > 0 ? "E" : "W"}`;
    } else {
      $("glass-sweep-label").textContent = "Slide the slice along the trench";
      $("glass-sweep-out").textContent = v === 0 ? "centre" : `${v > 0 ? "+" : "−"}${R.num(Math.abs(v))} km`;
    }
  }

  function wireControls() {
    const W = R.W;
    $("glass-presets").addEventListener("click", (e) => {
      const b = e.target.closest("[data-preset]");
      if (b) goPreset(+b.dataset.preset);
    });
    $("glass-exag").addEventListener("input", (e) => {
      st.exag = +e.target.value;
      W.glass_exag(st.exag);
      syncExag();
      st.dirty = true;
    });
    $("glass-sweep").addEventListener("input", (e) => {
      const v = +e.target.value;
      W.glass_sweep(st.preset === 0 ? v * Math.PI / 180 : v / R_KM);
      syncSweep();
      st.statsAt = 0;
      st.dirty = true;
    });
    $("glass-cut").addEventListener("click", (e) => {
      st.cut = !st.cut;
      e.currentTarget.setAttribute("aria-pressed", String(st.cut));
      W.glass_cut(st.cut ? 1 : 0);
      syncSweep();
      st.statsAt = 0;
      st.dirty = true;
    });
    document.querySelectorAll("#interior .chip[data-flag]").forEach((b) => b.addEventListener("click", () => {
      st.flags ^= +b.dataset.flag;
      b.setAttribute("aria-pressed", String(!!(st.flags & +b.dataset.flag)));
      W.glass_flags(st.flags);
      st.dirty = true;
    }));
    const auto = $("glass-auto");
    auto.setAttribute("aria-pressed", String(st.auto));
    if (R.reduceMotion) auto.disabled = true;
    auto.addEventListener("click", () => {
      st.auto = !st.auto;
      auto.setAttribute("aria-pressed", String(st.auto));
      st.lastInput = -1e9;
    });
    $("glass-deepest").addEventListener("click", (e) => {
      const i = +e.currentTarget.dataset.q;
      if (i >= 0) R.select(i, "glass");
    });
  }

  // ----- canvas -----
  function resize() {
    const f = R.fit(canvas, 1.1e6, st.scale);
    if (f.changed) { R.W.glass_resize(f.pw, f.ph); st.skipPerf = true; }
    st.k = f.k;
    st.css = Math.min(f.cw, f.ch);
    st.dirty = true;
  }

  function draw(now) {
    const W = R.W;
    st.dirty = false;
    W.glass_cursor(R.state.cursor);
    W.glass_highlight(R.state.selected, st.hover);
    const t0 = performance.now();
    W.glass_render();
    const ms = performance.now() - t0;
    if (st.skipPerf) st.skipPerf = false;
    else { st.perf = st.perf ? st.perf * 0.9 + ms * 0.1 : ms; R.perf("02 Interior", ms, canvas.width, canvas.height); }
    R.blit(ctx, W.glass_pixels(), canvas.width, canvas.height);
    adapt();
    placeLabels();
    const i = R.state.selected >= 0 ? R.state.selected : st.hover;
    if (i >= 0) placeTip(i); else tip.hidden = true;
    if (now - st.statsAt > 300) { st.statsAt = now; updateStats(); }
  }

  // Keep frames under ~20 ms: step resolution down on slow machines, back up with headroom.
  let adaptAt = 0;
  function adapt() {
    const now = performance.now();
    if (now - adaptAt < 1500 || !st.perf) return;
    adaptAt = now;
    const old = st.scale;
    if (st.perf > 20 && st.scale > 0.45) st.scale = Math.max(0.45, st.scale * 0.85);
    else if (st.perf < 11 && st.scale < 1) st.scale = Math.min(1, st.scale / 0.85);
    if (st.scale !== old) resize();
  }

  // Depth labels, deepest first so the named layers win when labels crowd.
  const LABEL_ORDER = [6, 5, 4, 3, 2, 1, 0];
  function placeLabels() {
    const W = R.W;
    const placed = [];
    for (const s of LABEL_ORDER) {
      const el = $(`glass-ring-${s}`);
      const on = st.cut && W.glass_label(s, 2) > 0;
      const x = W.glass_label(s, 0) / st.k, y = W.glass_label(s, 1) / st.k;
      // Drop a label that would sit on top of one already placed.
      const show = on && placed.every(([px, py]) => Math.abs(y - py) > 15 || Math.abs(x - px) > 110);
      el.classList.toggle("on", show);
      if (show) {
        el.style.left = `${x.toFixed(1)}px`;
        el.style.top = `${y.toFixed(1)}px`;
        placed.push([x, y]);
      }
    }
  }

  function placeTip(i) {
    const W = R.W;
    if (W.glass_screen(i, 2) <= 0) { tip.hidden = true; return; }
    R.placeTip(tip, W.glass_screen(i, 0) / st.k, W.glass_screen(i, 1) / st.k, R.tipHTML(i));
  }

  function updateStats() {
    const W = R.W;
    const shown = W.glass_stat(0), deep = W.glass_stat(1), di = W.glass_stat(2);
    $("glass-shown").textContent = R.num(shown);
    $("glass-deep").textContent = shown ? `${R.num(100 * deep / shown, deep && deep / shown < 0.1 ? 1 : 0)}%` : "—";
    const slab = st.preset > 0 && st.cut;
    const dip = slab ? W.glass_slice_dip(150) : NaN;
    $("glass-dip").textContent = Number.isFinite(dip) ? `${Math.round(dip)}°` : "—";
    $("glass-dip-label").textContent = slab ? "dip of the quakes below 70 km in this slice" : "dip in a slab's slice (pick one above)";
    const btn = $("glass-deepest");
    btn.hidden = di < 0;
    if (di >= 0) {
      const q = R.q(di);
      btn.dataset.q = String(di);
      const html = `<span>Deepest in view</span><b>${R.num(q.depth, 1)} km · M${q.mag.toFixed(1)} · ${R.esc(R.shortPlace(R.place(di)))}</b><span>${R.fmtDate(q.t)}</span>`;
      if (btn.dataset.html !== html) { btn.innerHTML = html; btn.dataset.html = html; }
    }
  }

  function wireCanvas() {
    const W = R.W;
    const touch = () => { st.lastInput = performance.now(); st.dirty = true; };
    R.pointer(canvas, {
      down() { st.dragging = true; canvas.classList.add("dragging"); st.vel = [0, 0]; st.lastMove = performance.now(); touch(); },
      up() {
        st.dragging = false;
        canvas.classList.remove("dragging");
        if (performance.now() - st.lastMove < 90 && !R.reduceMotion) W.glass_fling(st.vel[0], st.vel[1]);
        touch();
      },
      drag(dx, dy) {
        const k = 2.8 / st.css;
        const now = performance.now();
        const dt = Math.max(0.008, (now - st.lastMove) / 1000);
        st.lastMove = now;
        const a = -dx * k, b = dy * k;
        W.glass_orbit(a, b);
        st.vel = [st.vel[0] * 0.5 + (a / dt) * 0.5, st.vel[1] * 0.5 + (b / dt) * 0.5];
        if (st.hover >= 0) st.hover = -1;
        touch();
      },
      pinch(ratio) { W.glass_zoom(ratio); touch(); },
      tap(e) {
        const [x, y] = R.local(canvas, e);
        const i = W.glass_pick(x, y, (e.pointerType === "mouse" ? 9 : 16) * st.k);
        R.select(i >= 0 && i !== R.state.selected ? i : -1, "glass");
        touch();
      },
      hover(e) {
        if (R.state.selected >= 0) return;
        const [x, y] = R.local(canvas, e);
        const i = W.glass_pick(x, y, 9 * st.k);
        if (i !== st.hover) { st.hover = i; st.dirty = true; }
      },
      leave() { if (st.hover >= 0) { st.hover = -1; st.dirty = true; } },
    });
    R.wheel(canvas, (f) => { W.glass_zoom(f); touch(); }, stage);
    canvas.addEventListener("keydown", (e) => {
      const step = 0.09;
      const keys = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (keys[e.key]) W.glass_orbit(keys[e.key][0], keys[e.key][1]);
      else if (e.key === "+" || e.key === "=") W.glass_zoom(1.2);
      else if (e.key === "-") W.glass_zoom(1 / 1.2);
      else if (e.key === "Escape") R.select(-1, "glass");
      else return;
      e.preventDefault();
      touch();
    });
  }
})();
