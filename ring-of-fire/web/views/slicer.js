/* ===== 03 Slabs: the Slab Slicer ========================================== */
(() => {
  const R = ROF;
  const $ = (id) => document.getElementById(id);
  // Mirrors `slicer::stat` in crates/globe/src/slicer.rs.
  const S = {
    VISIBLE: 0, BAND_TOTAL: 1, DEEP: 2, FIT: 3, DIP: 4, DIP_ERR: 5, DIP_TOP: 6, DIP_BOTTOM: 7,
    TOP_DEPTH: 8, MAX_DEPTH: 9, INTERCEPT: 10, SCATTER: 11, INLIERS: 12, LENGTH: 13, AZIMUTH: 14,
    TOWARD_B: 15, DEEPEST: 16, K: 17, DIP_LABEL_X: 18, DIP_LABEL_Y: 19, END_LABEL_X: 20, END_LABEL_Y: 21,
    DIST_STEP: 22, DEPTH_STEP: 23, DEPTH_MAX: 24, SHALLOW: 25, HALF_WIDTH: 26, DIP_AZIMUTH: 27,
    SELECTED_IN_BAND: 28, SELECTED_ACROSS: 29, HIST_MAX: 30, GRID_STEP: 31, DIP_LABEL_ALIGN: 32,
    FIT_ALONG0: 33, FIT_DEPTH0: 34, FIT_ALONG1: 35, FIT_DEPTH1: 36,
  };
  // Preset fit fields from `slicer_preset_fit`.
  const PF = { DIP: 0, MAX: 1, DEEP: 2, INLIERS: 3, N500: 4, DEEPEST: 5, BAND: 6, GAP_TOP: 7, GAP_BOTTOM: 8, TOP: 9, RUN: 10 };
  const CMB = 2891, D2R = Math.PI / 180;
  const FLAT = { a: [-31.0, -73.6], b: [-31.0, -62.4], hw: 100 };

  // Short notes for the presets. Numbers come from the fit (`f`) at run time.
  const NOTES = {
    tonga: (f) => `The Pacific plate dives steeply under Tonga. ${R.num(f[PF.N500])} of the ${R.num(N500)} quakes below 500 km in this catalogue lie in this one band.`,
    japan: () => `Old, cold Pacific sea floor sinks under Honshu at a shallow angle. Wadati first traced a sloping zone of deep quakes here.`,
    andes: (f) => f[PF.GAP_BOTTOM] - f[PF.GAP_TOP] > 100
      ? `The Nazca plate slides under South America. Its quakes stop near ${round10(f[PF.GAP_TOP])} km, fall silent, then return below ${round10(f[PF.GAP_BOTTOM], -1)} km under the Bolivia–Argentina border.`
      : `The Nazca plate slides under South America at a moderate angle.`,
    kuril: () => `The Pacific plate again, sinking northwest under the Kuril Islands toward the Sea of Okhotsk.`,
    mariana: () => `Old Pacific sea floor drops almost straight down under the Mariana Islands.`,
    hindukush: (f) => `A steep sliver of lithosphere hangs under Afghanistan, far from any ocean, and breaks between ${round10(f[PF.TOP], -1)} and ${round10(f[PF.MAX])} km down.`,
    sumatra: (f) => `The Indian Ocean floor sinks northeast under southern Sumatra. Its quakes stop near ${round10(f[PF.MAX])} km.`,
  };
  const SHORT = { japan: "NE Japan", kuril: "Kurils", sumatra: "Sumatra" };
  const round10 = (v, dir = 0) => (dir < 0 ? Math.floor(v / 10) : dir > 0 ? Math.ceil(v / 10) : Math.round(v / 10)) * 10;
  const STOPS = [[0, 0xffd27a], [70, 0xff8a4c], [300, 0xe8467c], [700, 0x8b6cff]];
  const dpos = (km) => Math.min(1, Math.log(1 + Math.max(0, km) / 20) / Math.log(36));
  function depthHex(km) {
    const u = dpos(km);
    for (let j = 1; j < STOPS.length; j++) {
      const u0 = dpos(STOPS[j - 1][0]), u1 = dpos(STOPS[j][0]);
      if (u <= u1 || j === STOPS.length - 1) {
        const t = Math.max(0, Math.min(1, (u - u0) / (u1 - u0))), a = STOPS[j - 1][1], b = STOPS[j][1];
        return [16, 8, 0].reduce((h, sh) => h | (Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t) << sh), 0);
      }
    }
    return STOPS[3][1];
  }
  const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const compass = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

  let W, G, cv, ctx, gc, gctx, presets = [], N500 = 0, cw = 7;
  const st = {
    a: [0, 0], b: [0, 0], hw: 100, depth: 800, preset: 0, sweep: 0,
    dirty: true, gdirty: true, hover: -1, cursor: -1,
    k: 1, gk: 1, css: 300, scale: 1, perf: 0, box: [1, 1], gbox: [1, 1],
    yaw: 0, pitch: 0, zoom: 2, fly: null, morph: null, drag: null, lastSel: -2, sweepAnim: null, probe: null,
  };
  const stat = (k) => W.slicer_stat(k);

  // ---------- small sphere helpers (lat, lon in degrees) ----------
  const toV = ([lat, lon]) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
  const toLL = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [Math.asin(Math.max(-1, Math.min(1, v[2] / l))) / D2R, Math.atan2(v[1], v[0]) / D2R];
  };
  function slerp(p, q, t) {
    const a = toV(p), b = toV(q);
    const w = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    if (w < 1e-6) return p;
    const s = Math.sin(w), ka = Math.sin((1 - t) * w) / s, kb = Math.sin(t * w) / s;
    return toLL([a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]);
  }
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  R.view({
    id: "slicer",
    init() {
      W = R.W;
      W.slicer_init();
      G = W.globe_new();
      W.globe_gain(G, 0.38);
      W.globe_flags(G, 1 | 2);
      W.globe_bloom(G, 0);
      cv = $("slicer-canvas"); ctx = cv.getContext("2d");
      gc = $("slicer-globe"); gctx = gc.getContext("2d");
      gc.dataset.globe = G;
      measureFont();
      for (let i = 0; i < R.n; i++) if (R.cat[i * 5 + 3] >= 500) N500++;
      let deepest = 0;
      for (let i = 0; i < R.n; i++) deepest = Math.max(deepest, R.cat[i * 5 + 3]);
      $("slicer-deepest").textContent = `${R.num(deepest)} km`;
      buildPresets();
      wireSection();
      wireGlobe();
      wireControls();
      R.sized($("slicer-stage"), resize);
      R.sized($("slicer-gwrap"), resizeGlobe);
      choosePreset(0, true);
      resize();
      resizeGlobe();
      R.on("select", (i) => { st.dirty = st.gdirty = true; if (i < 0) $("slicer-tip").hidden = true; });
      R.on("cursor", () => { st.dirty = st.gdirty = true; });
    },
    frame(dt, now) {
      if (st.morph) {
        const m = st.morph, k = Math.min(1, (now - m.t0) / m.dur), e = ease(k);
        apply(slerp(m.a0, m.a1, e), slerp(m.b0, m.b1, e), m.hw0 + (m.hw1 - m.hw0) * e, false);
        if (k >= 1) st.morph = null;
      }
      if (st.fly) {
        const f = st.fly, k = Math.min(1, (now - f.t0) / f.dur), e = ease(k);
        st.yaw = f.yaw0 + f.dyaw * e;
        st.pitch = f.pitch0 + (f.pitch1 - f.pitch0) * e;
        st.zoom = f.zoom0 + (f.zoom1 - f.zoom0) * e;
        if (k >= 1) st.fly = null;
        st.gdirty = true;
      }
      if (st.sweepAnim) {
        const a = st.sweepAnim, k = Math.min(1, (now - a.t0) / a.dur);
        sweepTo(a.from + (a.to - a.from) * k, true);
        if (k >= 1) stopSweep();
      }
      if (st.lastSel !== R.state.selected) { st.lastSel = R.state.selected; syncSelected(); }
      if (st.dirty) draw();
      if (st.gdirty) drawGlobe();
    },
  });

  function measureFont() {
    const probe = document.createElement("span");
    probe.className = "mark";
    probe.style.visibility = "hidden";
    probe.textContent = "0000000000";
    $("slicer-marks").appendChild(probe);
    cw = probe.offsetWidth / 10 || 7;
    probe.remove();
  }

  // ---------- profile state ----------
  function readBack() {
    st.a = [W.slicer_end(0), W.slicer_end(1)];
    st.b = [W.slicer_end(2), W.slicer_end(3)];
    st.hw = W.slicer_end(4);
  }
  /** Set the profile in wasm; `rebase` resets the sideways slider (a new base line). */
  function apply(a, b, hw, rebase = true) {
    W.slicer_profile(a[0], a[1], b[0], b[1], hw);
    readBack();
    if (rebase) setSweep(0);
    st.dirty = st.gdirty = true;
  }
  function setSweep(v) {
    st.sweep = v;
    $("slicer-sweep").value = v;
    const az = W.slicer_stat(S.AZIMUTH);
    const r = Math.round(v);
    $("slicer-sweep-out").textContent = r === 0 ? "0 km" : `${Math.abs(r)} km ${compass(v > 0 ? az - 90 : az + 90)}`;
  }
  function setWidth(hw) {
    $("slicer-width").value = hw;
    $("slicer-width-out").textContent = `±${Math.round(hw)} km`;
  }
  function midpoint() {
    const L = W.slicer_stat(S.LENGTH);
    return [W.slicer_geo(L / 2, 0, 0), W.slicer_geo(L / 2, 0, 1)];
  }
  /** Turn the globe to the profile, zoomed so the line spans about half the disc. */
  function frameGlobe(instant) {
    const L = W.slicer_stat(S.LENGTH);
    const [lat, lon] = midpoint();
    const zoom = Math.max(1.1, Math.min(5, 0.42 / (0.92 * Math.sin(Math.min(Math.PI / 2, L / 6371 / 2)))));
    let dyaw = lon - st.yaw;
    dyaw = ((dyaw + 540) % 360) - 180;
    if (instant || R.reduceMotion) { st.yaw += dyaw; st.pitch = lat; st.zoom = zoom; st.fly = null; st.gdirty = true; return; }
    st.fly = { t0: performance.now(), dur: 900, yaw0: st.yaw, dyaw, pitch0: st.pitch, pitch1: Math.max(-85, Math.min(85, lat)), zoom0: st.zoom, zoom1: zoom };
  }

  // ---------- presets ----------
  function buildPresets() {
    const dec = new TextDecoder();
    const str = (p, n) => dec.decode(new Uint8Array(W.memory.buffer, p, n));
    const n = W.slicer_presets();
    for (let k = 0; k < n; k++) {
      const name = str(W.slicer_preset_name_ptr(k), W.slicer_preset_name_len(k));
      const id = str(W.slicer_preset_id_ptr(k), W.slicer_preset_id_len(k));
      const f = Array.from({ length: 11 }, (_, j) => W.slicer_preset_fit(k, j));
      presets.push({ k, id, name, f, a: [W.slicer_preset(k, 0), W.slicer_preset(k, 1)], b: [W.slicer_preset(k, 2), W.slicer_preset(k, 3)], hw: W.slicer_preset(k, 4) });
    }
    const steepest = presets.reduce((m, p) => (p.f[PF.DIP] > m.f[PF.DIP] ? p : m), presets[0]);
    for (const p of presets) {
      p.note = (NOTES[p.id] ? NOTES[p.id](p.f) : "") + (p === steepest ? " The steepest slab in this list." : "");
    }
    // One chip per slab; the dot takes the colour of the slab's deepest quake.
    $("slicer-presets").innerHTML = presets.map((p) => {
      const dip = Number.isFinite(p.f[PF.DIP]) ? `<em>${Math.round(p.f[PF.DIP])}°</em>` : "";
      return `<button type="button" class="chip" id="slicer-p-${p.id}" data-k="${p.k}" aria-pressed="false" style="--chip: ${R.depthCss(p.f[PF.MAX])}" title="${R.esc(p.name)}">${R.esc(SHORT[p.id] || p.name)} ${dip}</button>`;
    }).join("");
    $("slicer-presets").addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]");
      if (b) choosePreset(+b.dataset.k);
    });
    // Contrast paragraph with the fitted numbers.
    const by = (id) => presets.find((p) => p.id === id);
    const mar = by("mariana"), jap = by("japan");
    if (mar && jap && Number.isFinite(mar.f[PF.DIP]) && Number.isFinite(jap.f[PF.DIP])) {
      $("slicer-contrast").innerHTML = `Steep slabs like the <button type="button" class="linkish" data-k="${mar.k}">Mariana</button> (${Math.round(mar.f[PF.DIP])}° here) sink under their own weight and pull the sea floor behind them apart. Shallow slabs like <button type="button" class="linkish" data-k="${jap.k}">Japan's</button> (${Math.round(jap.f[PF.DIP])}°) grind against the plate above, and that tight contact is where the largest megathrust earthquakes happen.`;
    }
    const flat = Array.from({ length: 11 }, (_, j) => W.slicer_profile_fit(FLAT.a[0], FLAT.a[1], FLAT.b[0], FLAT.b[1], FLAT.hw, j));
    $("slicer-flat").innerHTML = Number.isFinite(flat[PF.DIP])
      ? `Under central Argentina the slab turns almost flat. At 31°S its quakes run ${R.num(round10(flat[PF.RUN], -1))} km inland at a dip of ${Math.round(flat[PF.DIP])}°, never deeper than ${R.num(round10(flat[PF.MAX], 1))} km. <button type="button" class="linkish" id="slicer-flatlink">Slice it</button>.`
      : `Under central Argentina the slab turns almost flat. <button type="button" class="linkish" id="slicer-flatlink">Slice it at 31°S</button>.`;
    $("slicer-contrast").addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]");
      if (b) choosePreset(+b.dataset.k);
    });
    $("slicer-flatlink").addEventListener("click", () => {
      stopSweep();
      markPreset(-1, "Pampean flat slab");
      morphTo(FLAT.a, FLAT.b, FLAT.hw);
    });
  }
  function markPreset(k, title) {
    st.preset = k;
    document.querySelectorAll("#slicer-presets button").forEach((b) => {
      b.setAttribute("aria-pressed", String(+b.dataset.k === k));
      // Keep the chosen chip in view where the bar scrolls (narrow screens).
      if (+b.dataset.k === k && b.parentElement.scrollWidth > b.parentElement.clientWidth) {
        const bar = b.parentElement;
        bar.scrollTo({ left: b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2, behavior: R.reduceMotion ? "auto" : "smooth" });
      }
    });
    st.title = title || (k >= 0 ? presets[k].name : "Your slice");
    const note = $("slicer-pnote");
    note.hidden = k < 0;
    if (k >= 0) note.textContent = presets[k].note;
  }
  function choosePreset(k, instant) {
    stopSweep();
    const p = presets[k];
    markPreset(k);
    morphTo(p.a, p.b, p.hw, instant);
  }
  function morphTo(a, b, hw, instant) {
    setWidth(hw);
    setSweep(0);
    if (instant || R.reduceMotion) {
      apply(a, b, hw);
      frameGlobe(true);
      return;
    }
    st.morph = { t0: performance.now(), dur: 850, a0: st.a, b0: st.b, a1: a, b1: b, hw0: st.hw, hw1: hw };
    // Fly the globe to where the line will end up.
    const L = (Math.acos(Math.max(-1, Math.min(1, toV(a).reduce((s, v, i) => s + v * toV(b)[i], 0)))) * 6371);
    const mid = slerp(a, b, 0.5);
    const zoom = Math.max(1.1, Math.min(5, 0.42 / (0.92 * Math.sin(Math.min(Math.PI / 2, L / 6371 / 2)))));
    let dyaw = mid[1] - st.yaw;
    dyaw = ((dyaw + 540) % 360) - 180;
    st.fly = { t0: performance.now(), dur: 900, yaw0: st.yaw, dyaw, pitch0: st.pitch, pitch1: mid[0], zoom0: st.zoom, zoom1: zoom };
  }

  // ---------- section ----------
  function resize() {
    const f = R.fit(cv, 1.2e6, st.scale);
    st.k = f.k;
    st.box = [f.cw, f.ch];
    if (f.changed) { W.slicer_resize(f.pw, f.ph, f.k); st.skipPerf = true; }
    st.dirty = true;
  }
  function draw() {
    st.dirty = false;
    if (st.cursor !== R.state.cursor) { W.slicer_cursor(R.state.cursor); st.cursor = R.state.cursor; }
    W.slicer_marks(R.state.selected, st.hover);
    const t0 = performance.now();
    W.slicer_render();
    const ms = performance.now() - t0;
    if (st.skipPerf) st.skipPerf = false;
    else { st.perf = st.perf ? st.perf * 0.85 + ms * 0.15 : ms; R.perf("03 Slabs section", ms, cv.width, cv.height); }
    R.blit(ctx, W.slicer_pixels(), cv.width, cv.height);
    layoutMarks();
    readout();
    adapt();
  }
  // Keep frames short on slow machines: drop resolution, recover with headroom.
  let adaptAt = 0;
  function adapt() {
    const now = performance.now();
    if (now - adaptAt < 1500 || !st.perf) return;
    adaptAt = now;
    const old = st.scale;
    if (st.perf > 16 && st.scale > 0.5) st.scale = Math.max(0.5, st.scale * 0.85);
    else if (st.perf < 6 && st.scale < 1) st.scale = Math.min(1, st.scale / 0.85);
    if (st.scale !== old) resize();
  }

  // Labels over the canvas: a pool of .mark divs, placed by priority, skipping overlaps.
  function placeMarks(host, items, [bw, bh]) {
    const placed = [];
    let used = 0;
    for (const it of items) {
      if (!Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
      const w = it.w ?? (it.text.length * (it.big ? 11 : cw) + 2), h = it.h ?? (it.big ? 20 : 14);
      const x0 = it.x - w * (it.ax ?? 0.5), y0 = it.y - h * (it.ay ?? 0.5);
      if (x0 < 1 || y0 < 1 || x0 + w > bw - 1 || y0 + h > bh - 1) continue;
      const pad = it.pad ?? 3;
      if (placed.some((r) => x0 < r[2] + pad && x0 + w + pad > r[0] && y0 < r[3] + pad && y0 + h + pad > r[1])) continue;
      placed.push([x0, y0, x0 + w, y0 + h]);
      let el = host.children[used];
      if (!el) { el = document.createElement("div"); host.appendChild(el); }
      used++;
      const cls = `mark ${it.cls || ""}`;
      if (el.className !== cls) el.className = cls;
      if (el.dataset.t !== it.html) { el.innerHTML = it.html; el.dataset.t = it.html; }
      el.hidden = false;
      el.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
    }
    for (let i = used; i < host.children.length; i++) host.children[i].hidden = true;
  }

  function layoutMarks() {
    const k = st.k;
    const xy = (al, d) => [W.slicer_xy(al, d, 0) / k, W.slicer_xy(al, d, 1) / k];
    const L = stat(S.LENGTH), dmax = stat(S.DEPTH_MAX), fit = stat(S.FIT);
    const items = [];
    const text = (cls, s, x, y, ax = 0.5, ay = 0.5, extra = {}) => items.push({ cls, text: s, html: R.esc(s), x, y, ax, ay, ...extra });
    // Up vector at a surface point, for placing labels radially above the arc.
    const up = (al) => {
      const p = xy(al, 0), q = xy(al, -100);
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [(q[0] - p[0]) / l, (q[1] - p[1]) / l, p];
    };
    for (const [al, s] of [[0, "A"], [L, "B"]]) {
      const [ux, uy, p] = up(al);
      text("end", s, p[0] + ux * 38, p[1] + uy * 38, 0.5, 0.5, { big: true, w: 14, h: 20 });
    }
    if (fit >= 2) {
      const dip = stat(S.DIP), top = stat(S.DIP_TOP), bot = stat(S.DIP_BOTTOM);
      const sub = fit === 3 ? `${Math.round(top)}° at top, ${Math.round(bot)}° at depth` : `±${R.num(Math.max(0.1, stat(S.DIP_ERR)), 1)}°`;
      items.push({ cls: stat(S.DIP_LABEL_ALIGN) > 0 ? "dip r" : "dip", html: `dip ${Math.round(dip)}°<small>${sub}</small>`, x: stat(S.DIP_LABEL_X) / k, y: stat(S.DIP_LABEL_Y) / k, ax: stat(S.DIP_LABEL_ALIGN), ay: 1, w: Math.max(70, sub.length * 6.4), h: 34, pad: 6 });
      text("bottom", `${R.num(Math.round(stat(S.MAX_DEPTH)))} km`, stat(S.END_LABEL_X) / k, stat(S.END_LABEL_Y) / k, 0.5, 0.5);
    }
    const nx = W.slicer_crossings();
    for (let j = 0; j < nx; j++) {
      const al = W.slicer_crossing(j);
      const [ux, uy, p] = up(al);
      text("plate", "plate boundary", p[0] + ux * 42, p[1] + uy * 42);
    }
    // The 410 and 660 km labels go on the side away from the slab's deep end.
    const left = fit < 2 || stat(S.TOWARD_B) > 0;
    for (const d of [410, 660]) {
      if (d >= dmax) continue;
      const p = xy(left ? 0 : L, d);
      text("disc", `${d} km`, p[0] + (left ? 12 : -12), p[1] - 8, left ? 0 : 1, 0.5);
    }
    if (dmax > CMB) {
      const p = xy(L / 2, CMB), q = xy(L / 2, CMB + (dmax - CMB) * 0.55);
      text("cmb", `core–mantle boundary, ${R.num(CMB)} km`, p[0], p[1] - 10);
      text("cmb", "liquid outer core", q[0], q[1]);
    }
    // Depth labels down the left edge; distance labels above the surface.
    const dstep = stat(S.DEPTH_STEP);
    for (let d = dstep; d < dmax - dstep * 0.3; d += dstep) {
      const p = xy(0, d);
      text("depth", d + dstep >= dmax - dstep * 0.3 ? `${R.num(d)} km` : R.num(d), p[0] - 9, p[1], 1, 0.5);
    }
    const xstep = stat(S.DIST_STEP);
    const last = Math.floor((L - xstep * 0.35) / xstep) * xstep;
    for (let x = xstep; x <= last + 1; x += xstep) {
      const [ux, uy, p] = up(x);
      text("dist", x === last ? `${R.num(x)} km` : R.num(x), p[0] + ux * 19, p[1] + uy * 19);
    }
    placeMarks($("slicer-marks"), items, st.box);
  }

  function readout() {
    const fit = stat(S.FIT), n = stat(S.VISIBLE), deep = stat(S.DEEP);
    const L = stat(S.LENGTH), az = stat(S.AZIMUTH);
    $("slicer-title").textContent = st.title || "Your slice";
    $("slicer-n").textContent = R.num(n);
    const empty = $("slicer-empty");
    if (fit >= 2) {
      const dip = stat(S.DIP), maxd = stat(S.MAX_DEPTH), inl = stat(S.INLIERS), sc = stat(S.SCATTER), x0 = stat(S.INTERCEPT);
      $("slicer-dip").innerHTML = `${Math.round(dip)}<small>°</small>`;
      $("slicer-maxd").innerHTML = `${R.num(Math.round(maxd))}<small>km</small>`;
      const toward = stat(S.TOWARD_B) > 0 ? "B" : "A";
      const parts = [
        `<b>${R.num(inl)}</b> of ${R.num(deep)} quakes below 70 km fit, scatter <b>±${Math.round(sc)} km</b>`,
        `dips ${compass(stat(S.DIP_AZIMUTH))}, toward ${toward}` + (fit === 3 ? `, from ${Math.round(stat(S.DIP_TOP))}° to ${Math.round(stat(S.DIP_BOTTOM))}°` : ""),
      ];
      if (Number.isFinite(x0) && x0 >= 0 && x0 <= L) parts.push(`extended upward, meets the surface ${R.num(Math.round(x0))} km from A`);
      else if (Number.isFinite(x0) && x0 > -L && x0 < 2 * L) parts.push(`extended upward, meets the surface ${R.num(Math.round(x0 < 0 ? -x0 : x0 - L))} km beyond ${x0 < 0 ? "A" : "B"}`);
      $("slicer-fitnote").innerHTML = parts.join("<br>");
      empty.hidden = true;
    } else {
      $("slicer-dip").textContent = "—";
      $("slicer-maxd").textContent = "—";
      let msg;
      if (n === 0) msg = R.state.cursor < R.tEnd ? "No quakes in this band yet at this point in the replay." : "No quakes in this band.";
      else if (deep === 0) msg = `No slab here: <b>${R.num(n)}</b> quake${n === 1 ? "" : "s"}, all shallower than 70 km.`;
      else if (fit === 0) msg = `No slab here: <b>${R.num(n)}</b> quakes, only ${R.num(deep)} deeper than 70 km.`;
      else msg = `No slab here: <b>${R.num(deep)}</b> quakes deeper than 70 km, but they do not line up along a dipping zone.`;
      empty.innerHTML = msg;
      empty.hidden = false;
      $("slicer-fitnote").innerHTML = deep > 0 ? `${R.num(deep)} of ${R.num(n)} quakes are deeper than 70 km` : `${R.num(n)} quakes, none deeper than 70 km`;
    }
    const narrow = cv.clientWidth < 560;
    $("slicer-cap-l").textContent = narrow
      ? `A → B ${R.num(Math.round(L))} km · ${Math.round(az)}° ${compass(az)} · ±${Math.round(stat(S.HALF_WIDTH))} km · true scale`
      : `A → B ${R.num(Math.round(L))} km, heading ${Math.round(az)}° ${compass(az)} · band ±${Math.round(stat(S.HALF_WIDTH))} km · true scale, no vertical exaggeration`;
    capRight();
    syncSelectedNote();
  }

  function capRight() {
    const p = st.probe;
    $("slicer-cap-r").textContent = p
      ? `${R.num(Math.round(p[0]))} km from A, ${R.num(Math.round(p[1]))} km deep`
      : stat(S.HIST_MAX) > 0 ? `bars: quakes per ${stat(S.DEPTH_MAX) > 1000 ? 50 : 25} km of depth` : "";
  }

  function syncSelected() {
    const i = R.state.selected, btn = $("slicer-through");
    btn.disabled = i < 0;
    if (i >= 0) {
      const q = R.q(i);
      $("slicer-through-label").textContent = `Slice through M${q.mag.toFixed(1)}, ${R.shortPlace(R.place(i))}`;
    } else $("slicer-through-label").textContent = "Select a quake to slice through it";
    syncSelectedNote();
  }
  function syncSelectedNote() {
    const i = R.state.selected, el = $("slicer-sel");
    if (i < 0) { el.hidden = true; return; }
    el.hidden = false;
    const c = stat(S.SELECTED_ACROSS), hw = stat(S.HALF_WIDTH);
    if (stat(S.SELECTED_IN_BAND) > 0) el.textContent = "The selected quake is in this band, ringed in white.";
    else if (R.q(i).t > R.state.cursor) el.textContent = "The selected quake comes later in the replay.";
    else if (!Number.isFinite(c)) el.textContent = "The selected quake is beyond the ends of this line.";
    else el.textContent = `The selected quake is ${R.num(Math.round(Math.abs(c)))} km off this line, outside the ±${Math.round(hw)} km band.`;
  }

  function wireSection() {
    const tip = $("slicer-tip");
    const showTip = (i, e) => {
      const sb = $("slicer-stage").getBoundingClientRect();
      const along = W.slicer_locate(i, 0), across = W.slicer_locate(i, 1);
      const extra = `<div class="meta">${R.num(Math.round(along))} km from A · ${R.num(Math.round(Math.abs(across)))} km off the line</div>`;
      R.placeTip(tip, e.clientX - sb.left, e.clientY - sb.top, R.tipHTML(i) + extra);
    };
    const reach = (e) => (e.pointerType === "mouse" ? 8 : 18) * st.k;
    R.pointer(cv, {
      hover(e) {
        const [x, y] = R.local(cv, e);
        const i = W.slicer_pick(x, y, reach(e));
        if (i !== st.hover) { st.hover = i; st.dirty = st.gdirty = true; }
        if (i >= 0) showTip(i, e); else tip.hidden = true;
        const al = W.slicer_at(x, y, 0), d = W.slicer_at(x, y, 1);
        st.probe = al >= 0 && al <= stat(S.LENGTH) && d >= 0 && d <= stat(S.DEPTH_MAX) ? [al, d] : null;
        capRight();
      },
      leave() {
        if (st.hover >= 0) { st.hover = -1; st.dirty = st.gdirty = true; }
        tip.hidden = true;
        st.probe = null;
        capRight();
      },
      tap(e) {
        const [x, y] = R.local(cv, e);
        const i = W.slicer_pick(x, y, reach(e));
        R.select(i >= 0 && i !== R.state.selected ? i : -1, "slicer");
        if (i >= 0) showTip(i, e); else tip.hidden = true;
      },
    });
    cv.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const v = Math.max(-600, Math.min(600, st.sweep + (e.key === "ArrowRight" ? 20 : -20)));
        sweepTo(v);
      } else if (e.key === "Escape") R.select(-1, "slicer");
      else return;
      e.preventDefault();
    });
  }

  // ---------- globe ----------
  function resizeGlobe() {
    const f = R.fit(gc, 2.6e5, 1);
    st.gk = f.k;
    st.gbox = [f.cw, f.ch];
    st.css = Math.min(f.cw, f.ch);
    if (f.changed) { W.globe_resize(G, f.pw, f.ph); st.gskip = true; }
    st.gdirty = true;
  }
  function drawGlobe() {
    st.gdirty = false;
    const gk = st.gk;
    st.yaw = ((st.yaw + 540) % 360) - 180;
    W.globe_view(G, st.yaw, st.pitch, st.zoom);
    W.globe_cursor(G, R.state.cursor);
    W.globe_highlight(G, R.state.selected >= 0 ? R.state.selected : st.hover);
    W.globe_overlay_clear(G);
    const L = stat(S.LENGTH), hw = st.hw;
    const pt = (al, ac) => [W.slicer_geo(al, ac, 0), W.slicer_geo(al, ac, 1)];
    const n = Math.max(6, Math.min(40, Math.round(L / 80)));
    const edge = 0xa5adbf;
    for (const side of [1, -1]) {
      let prev = pt(0, side * hw);
      for (let j = 1; j <= n; j++) {
        const p = pt((L * j) / n, side * hw);
        W.globe_overlay_arc(G, prev[0], prev[1], p[0], p[1], edge, 0.45, 1);
        prev = p;
      }
    }
    for (const al of [0, L]) {
      const p = pt(al, hw), q = pt(al, -hw);
      W.globe_overlay_arc(G, p[0], p[1], q[0], q[1], edge, 0.45, 1);
    }
    W.globe_overlay_arc(G, st.a[0], st.a[1], st.b[0], st.b[1], R.colors.ember, 0.9, 2.4 * gk);
    // Where the fitted slab lies under the line, coloured by its depth there.
    if (stat(S.FIT) >= 2) {
      const a0 = stat(S.FIT_ALONG0), a1 = stat(S.FIT_ALONG1), d0 = stat(S.FIT_DEPTH0), d1 = stat(S.FIT_DEPTH1);
      const segs = 10;
      for (let j = 0; j < segs; j++) {
        const u = (j + 0.5) / segs;
        const p = pt(Math.max(0, Math.min(L, a0 + (a1 - a0) * (j / segs))), 0), q = pt(Math.max(0, Math.min(L, a0 + (a1 - a0) * ((j + 1) / segs))), 0);
        W.globe_overlay_arc(G, p[0], p[1], q[0], q[1], depthHex(d0 + (d1 - d0) * u), 0.6, 4.5 * gk);
      }
    }
    const xstep = stat(S.DIST_STEP);
    for (let x = xstep; x < L - 1; x += xstep) { const p = pt(x, 0); W.globe_overlay_point(G, p[0], p[1], 1.1 * gk, R.colors.ink, 0.9); }
    const m = pt(L / 2, 0);
    for (const p of [st.a, st.b]) {
      W.globe_overlay_point(G, p[0], p[1], 4.2 * gk, R.colors.ember, 0.9);
      W.globe_overlay_point(G, p[0], p[1], 1.5 * gk, 0xfff4e0, 2.5);
    }
    W.globe_overlay_point(G, m[0], m[1], 2.6 * gk, R.colors.ink, 0.8);
    const t0 = performance.now();
    W.globe_render(G);
    if (st.gskip) st.gskip = false;
    else R.perf("03 Slabs globe", performance.now() - t0, gc.width, gc.height);
    R.blit(gctx, W.globe_pixels(G), gc.width, gc.height);
    // A and B labels beside their handles, pushed away from the line.
    const items = [];
    const sa = handleXY(st.a), sb = handleXY(st.b);
    for (const [s, o, t] of [[sa, sb, "A"], [sb, sa, "B"]]) {
      if (!s) continue;
      let dx = s[0] - (o ? o[0] : s[0] - 1), dy = s[1] - (o ? o[1] : s[1]);
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      items.push({ cls: "gend", text: t, html: t, x: s[0] / gk + dx * 15, y: s[1] / gk + dy * 15, w: 12, h: 16, big: true });
    }
    placeMarks($("slicer-gmarks"), items, st.gbox);
  }
  /** Canvas position of a lat/lon on the globe's near side, or null. */
  function handleXY(p) {
    const z = W.globe_project(G, p[0], p[1], 2);
    return z > 0.02 ? [W.globe_project(G, p[0], p[1], 0), W.globe_project(G, p[0], p[1], 1)] : null;
  }
  function handleAt(x, y, coarse) {
    const r = (coarse ? 22 : 13) * st.gk;
    const L = stat(S.LENGTH);
    const cand = [["a", st.a], ["b", st.b], ["m", [W.slicer_geo(L / 2, 0, 0), W.slicer_geo(L / 2, 0, 1)]]];
    let best = null, bd = r;
    for (const [kind, p] of cand) {
      const s = handleXY(p);
      if (!s) continue;
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d < bd) { bd = d; best = { kind, p }; }
    }
    return best;
  }
  /** Lat/lon under a canvas point; clamps to the limb when off the disc. */
  function unproject(x, y) {
    let lat = W.globe_unproject(G, x, y, 0), lon = W.globe_unproject(G, x, y, 1);
    if (Number.isFinite(lat)) return [lat, lon];
    const cx = gc.width / 2, cy = gc.height / 2, r = 0.46 * Math.min(gc.width, gc.height) * st.zoom * 0.995;
    const d = Math.hypot(x - cx, y - cy) || 1;
    x = cx + ((x - cx) * r) / d; y = cy + ((y - cy) * r) / d;
    lat = W.globe_unproject(G, x, y, 0); lon = W.globe_unproject(G, x, y, 1);
    return Number.isFinite(lat) ? [lat, lon] : null;
  }
  function wireGlobe() {
    const clampZoom = (z) => Math.max(0.9, Math.min(12, z));
    R.pointer(gc, {
      down(e) {
        const [x, y] = R.local(gc, e);
        const h = handleAt(x, y, e.pointerType !== "mouse");
        st.morph = null; st.fly = null;
        if (h) stopSweep();
        st.drag = h ? { kind: h.kind, last: h.p } : { kind: "rotate" };
        gc.classList.add("dragging");
      },
      up() { st.drag = null; gc.classList.remove("dragging"); },
      drag(dx, dy, e) {
        const d = st.drag;
        if (!d) return;
        if (d.kind === "rotate") {
          const k = 180 / Math.PI / (st.css * 0.46 * st.zoom);
          st.yaw -= dx * k;
          st.pitch = Math.max(-85, Math.min(85, st.pitch + dy * k));
          st.gdirty = true;
          return;
        }
        const p = unproject(...R.local(gc, e));
        if (!p) return;
        if (d.kind === "a") apply(p, st.b, st.hw);
        else if (d.kind === "b") apply(st.a, p, st.hw);
        else { W.slicer_carry(d.last[0], d.last[1], p[0], p[1]); readBack(); setSweep(0); st.dirty = st.gdirty = true; }
        d.last = p;
        markPreset(-1);
      },
      pinch(ratio) { st.zoom = clampZoom(st.zoom * ratio); st.gdirty = true; },
      tap(e) {
        const [x, y] = R.local(gc, e);
        const i = W.globe_pick(G, x, y, (e.pointerType === "mouse" ? 8 : 16) * st.gk);
        R.select(i >= 0 && i !== R.state.selected ? i : -1, "slicer");
      },
      hover(e) {
        const [x, y] = R.local(gc, e);
        gc.classList.toggle("handle", !!handleAt(x, y, false));
      },
    });
    R.wheel(gc, (f) => { st.zoom = clampZoom(st.zoom * f); st.fly = null; st.gdirty = true; }, $("slicer-gwrap"));
    gc.addEventListener("keydown", (e) => {
      const step = 6 / st.zoom;
      const keys = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (keys[e.key]) { st.yaw -= keys[e.key][0]; st.pitch = Math.max(-85, Math.min(85, st.pitch - keys[e.key][1])); }
      else if (e.key === "+" || e.key === "=") st.zoom = clampZoom(st.zoom * 1.2);
      else if (e.key === "-") st.zoom = clampZoom(st.zoom / 1.2);
      else return;
      e.preventDefault();
      st.fly = null;
      st.gdirty = true;
    });
  }

  // ---------- controls ----------
  function sweepTo(v, animating) {
    if (!animating) stopSweep();
    // The azimuth for the readout is the base line's, before this slide.
    W.slicer_shift(v - st.sweep);
    readBack();
    st.morph = null;
    setSweep(v);
    st.dirty = st.gdirty = true;
  }
  /** Glide the profile sideways across the whole slider range, about 9 s. */
  function startSweep() {
    const from = st.sweep >= 590 ? -600 : st.sweep;
    if (from !== st.sweep) sweepTo(from, true);
    st.sweepAnim = { t0: performance.now(), from, to: 600, dur: (600 - from) / 1200 * 9000 };
    $("slicer-sweep-play").setAttribute("aria-pressed", "true");
    $("slicer-sweep-play").textContent = "stop";
  }
  function stopSweep() {
    if (!st.sweepAnim) return;
    st.sweepAnim = null;
    $("slicer-sweep-play").setAttribute("aria-pressed", "false");
    $("slicer-sweep-play").textContent = "sweep";
  }
  function wireControls() {
    $("slicer-width").addEventListener("input", (e) => {
      const hw = +e.target.value;
      setWidth(hw);
      st.morph = null;
      W.slicer_profile(st.a[0], st.a[1], st.b[0], st.b[1], hw);
      readBack();
      st.dirty = st.gdirty = true;
    });
    $("slicer-sweep").addEventListener("input", (e) => sweepTo(+e.target.value));
    $("slicer-sweep-play").addEventListener("click", () => (st.sweepAnim ? stopSweep() : startSweep()));
    document.querySelectorAll("#slabs .seg [data-depth]").forEach((b) => b.addEventListener("click", () => {
      st.depth = +b.dataset.depth;
      W.slicer_depth(st.depth);
      document.querySelectorAll("#slabs .seg [data-depth]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      st.dirty = true;
    }));
    $("slicer-through").addEventListener("click", () => {
      const i = R.state.selected;
      if (i < 0) return;
      st.morph = null;
      stopSweep();
      W.slicer_auto(i);
      readBack();
      setSweep(0);
      markPreset(-1, `Through M${R.q(i).mag.toFixed(1)}, ${R.shortPlace(R.place(i))}`);
      frameGlobe(false);
      st.dirty = st.gdirty = true;
    });
  }
})();
