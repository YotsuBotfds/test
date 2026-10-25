/* ===== 04 Waves ===== */
(() => {
  const R = ROF;
  const $ = (id) => document.getElementById(id);
  const T_MAX = 1500;
  const STAGES = 8;
  const KM_PER_DEG = 6371 * Math.PI / 180;
  // Field indices in the Rust solution.
  const F = { P: 0, S: 1, PKIKP: 4, PKP: 5 };
  const PHASES = ["P", "Pdiff, faint", "PKIKP, faint", "PKP", ""];
  // Listeners: city centres, WGS84 degrees.
  const CITIES = [
    { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
    { name: "Anchorage", lat: 61.2181, lon: -149.9003 },
    { name: "Honolulu", lat: 21.3069, lon: -157.8583 },
    { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
    { name: "Moscow", lat: 55.7558, lon: 37.6173 },
    { name: "Mumbai", lat: 19.0760, lon: 72.8777 },
    { name: "London", lat: 51.5074, lon: -0.1278 },
    { name: "Sydney", lat: -33.8688, lon: 151.2093 },
    { name: "Nairobi", lat: -1.2921, lon: 36.8219 },
    { name: "Lima", lat: -12.0464, lon: -77.0428 },
    { name: "São Paulo", lat: -23.5505, lon: -46.6333 },
    { name: "Cape Town", lat: -33.9249, lon: 18.4241 },
  ];

  const st = {
    t: 0, playing: false, speed: 60, started: false,
    src: -1, q: null, def: -1,
    solving: false, solveMs: 0, solveWall: 0, solveTimes: {},
    ready: false, info: null, surf: null,
    listeners: [], hot: -1, hoverDelta: -1,
    yaw: 0, pitch: 0, zoom: 1, follow: true, dragging: false,
    dirty: true, scale: 1, perf: 0, skipPerf: true, k: 1, gk: 1, ck: 1,
    rowsBuilt: false,
  };
  let W, canvas, ctx, gcanvas, gctx, ccanvas, cctx, G = -1;

  const fmt = (s) => {
    if (!isFinite(s)) return "—";
    s = Math.max(0, Math.round(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  /** Great-circle distance (deg) and initial bearing (deg) from a to b. */
  function distAz(lat1, lon1, lat2, lon2) {
    const [p1, p2, dl] = [toRad(lat1), toRad(lat2), toRad(lon2 - lon1)];
    const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
    const d = toDeg(Math.acos(Math.max(-1, Math.min(1, c))));
    const az = (toDeg(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl))) + 360) % 360;
    return [d, az];
  }
  /** Point `d` degrees from (lat, lon) along bearing `az`. */
  function travel(lat, lon, az, d) {
    const [p, l, a, r] = [toRad(lat), toRad(lon), toRad(az), toRad(d)];
    const p2 = Math.asin(Math.sin(p) * Math.cos(r) + Math.cos(p) * Math.sin(r) * Math.cos(a));
    const l2 = l + Math.atan2(Math.sin(a) * Math.sin(r) * Math.cos(p), Math.cos(r) - Math.sin(p) * Math.sin(p2));
    return [toDeg(p2), ((toDeg(l2) + 540) % 360) - 180];
  }
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  /** Display brightness of a surface amplitude, the same log scale the Rust side uses. */
  const disp = (a, ref) => Math.max(0, Math.min(1, 1 + Math.log10(Math.max(a, 1e-12) / ref) / 2.3));

  R.view({
    id: "waves",
    init() {
      W = R.W;
      canvas = $("waves-canvas"); ctx = canvas.getContext("2d");
      gcanvas = $("waves-globe"); gctx = gcanvas.getContext("2d");
      ccanvas = $("waves-chart"); cctx = ccanvas.getContext("2d");
      G = W.globe_new();
      W.globe_flags(G, 1);
      W.globe_gain(G, 0.22);
      W.globe_bloom(G, 0.2);
      W.waves_opts(7);
      st.def = R.largest(1)[0];
      buildPicks();
      wireControls();
      wireSection();
      wireGlobe();
      wireChart();
      R.sized($("waves-view"), () => { st.resized = true; st.dirty = true; });
      R.sized($("waves-globe-wrap"), () => { st.gresized = true; st.dirty = true; });
      R.sized($("waves-chart-wrap"), () => { st.cresized = true; st.dirty = true; });
      st.resized = st.gresized = st.cresized = true;
      R.on("select", (i) => setSource(i >= 0 ? i : st.def));
      setSource(R.state.selected >= 0 ? R.state.selected : st.def);
      // Start playing the first time the chapter is properly in view.
      const io = new IntersectionObserver((en) => {
        if (en.some((e) => e.isIntersecting) && !st.started) {
          st.started = true;
          if (R.reduceMotion) { st.t = 540; st.dirty = true; } else play(true);
          io.disconnect();
        }
      }, { threshold: 0.35 });
      io.observe($("waves-view"));
    },
    frame(dt) {
      if (st.solving) { solveStep(); return; }
      if (!st.ready) return;
      if (st.playing) {
        st.t = Math.min(T_MAX, st.t + dt * st.speed);
        if (st.t >= T_MAX) play(false);
        st.dirty = true;
      }
      if (st.dirty) draw();
    },
  });

  // ----- source -----
  function buildPicks() {
    const picks = R.largest(5, 30);
    // Add the largest deep-focus quake: a source 600 km down shows the depth effect.
    let deep = -1;
    for (let i = 0; i < R.n; i++) {
      const k = i * 5;
      if (R.cat[k + 3] > 300 && (deep < 0 || R.cat[k + 4] > R.cat[deep * 5 + 4])) deep = i;
    }
    if (deep >= 0 && !picks.includes(deep)) picks.push(deep);
    $("waves-picks").innerHTML = picks.map((i) => {
      const q = R.q(i);
      return `<li><button type="button" data-q="${i}"><span class="m">${q.mag.toFixed(1)}</span><span class="p">${R.esc(R.shortPlace(R.place(i)))}</span><span class="w">${R.fmtDate(q.t)} · ${Math.round(q.depth)} km deep</span></button></li>`;
    }).join("");
    $("waves-picks").addEventListener("click", (e) => {
      const b = e.target.closest("[data-q]");
      if (!b) return;
      const i = +b.dataset.q;
      if (i === R.state.selected || (R.state.selected < 0 && i === st.def)) { restart(); return; }
      R.select(i === st.def ? -1 : i, "waves");
    });
  }

  function setSource(i) {
    if (i == null || i < 0 || i >= R.n) i = st.def;
    st.src = i;
    const q = st.q = R.q(i);
    // Listener geometry: distance, and which half of the cross-section (east or west).
    st.listeners = CITIES.map((c) => {
      const [d, az] = distAz(q.lat, q.lon, c.lat, c.lon);
      return { ...c, delta: d, az, side: az < 180 ? 1 : -1, p: Infinity, s: Infinity, phase: 4 };
    }).sort((a, b) => a.delta - b.delta);
    W.waves_listeners_clear();
    st.listeners.forEach((l) => { l.k = W.waves_listener_add(l.delta, l.side); });
    st.hot = -1;
    // Follow the waves towards the farthest city.
    const far = st.listeners[st.listeners.length - 1];
    st.followAz = far.az;
    st.follow = true;
    $("waves-follow").hidden = true;
    renderSource();
    document.querySelectorAll("#waves-picks [data-q]").forEach((b) => b.setAttribute("aria-current", String(+b.dataset.q === i)));
    st.depthKey = Math.round(Math.max(0, Math.min(700, q.depth)));
    if (W.waves_source(q.depth)) {
      // Cached: any solve still running for another depth was dropped.
      st.solving = false;
      $("waves-busy").hidden = true;
      onSolved();
    } else {
      st.solving = true;
      st.solveMs = 0;
      st.solveWall = performance.now();
      st.ready = false;
    }
    restart();
  }

  function restart() {
    st.t = 0;
    st.dirty = true;
    if (st.started && !R.reduceMotion) play(true);
  }

  function renderSource() {
    const q = st.q, i = st.src;
    const following = R.state.selected >= 0;
    $("waves-src").innerHTML = `<div class="m">M ${q.mag.toFixed(1)}</div>
      <div class="pl">${R.esc(R.place(i))}</div>
      <div class="meta">${R.fmtDate(q.t, true)}<br>${R.coord(q.lat, q.lon)} · ${q.depth.toFixed(q.depth < 10 ? 1 : 0)} km deep</div>
      <div class="note">${following ? "The quake selected in the observatory. Clear it to return to the largest." : "The largest quake in the catalogue. Pick another below, or select one on the globe above."}</div>`;
  }

  function solveStep() {
    const t0 = performance.now();
    const left = W.waves_solve_step();
    st.solveMs += performance.now() - t0;
    const wall = performance.now() - st.solveWall;
    const busy = $("waves-busy");
    if (left > 0) {
      if (wall > 120) {
        busy.hidden = false;
        $("waves-busy-text").textContent = `Solving travel times for a source ${Math.round(st.q.depth)} km deep · stage ${STAGES - left + 1} of ${STAGES}`;
      }
      return;
    }
    st.solving = false;
    st.solveTimes[st.depthKey] = st.solveMs;
    // The first frame after a solve also resamples the fields; keep the notice up
    // until it has been drawn.
    if (!busy.hidden) $("waves-busy-text").textContent = "Drawing the wavefronts";
    st.hideBusy = true;
    onSolved();
  }

  function onSolved() {
    st.ready = true;
    st.info = {
      pShadow: W.waves_info(0), sShadow: W.waves_info(1), pkpMin: W.waves_info(2), pkikpMin: W.waves_info(3),
      depth: W.waves_info(6), nt: W.waves_info(7), rings: W.waves_info(8),
    };
    // Surface arrivals of each field: times then amplitudes at every angular node.
    const n = W.waves_surface_n();
    st.surf = {};
    for (const [name, f] of Object.entries(F)) {
      const ptr = W.waves_surface(f);
      const a = new Float32Array(R.W.memory.buffer, ptr, 2 * n).slice();
      st.surf[name] = { t: a.subarray(0, n), a: a.subarray(n), n };
    }
    for (const l of st.listeners) {
      l.p = W.waves_listener_p(l.k);
      l.phase = W.waves_listener_phase(l.k);
      l.s = W.waves_listener_s(l.k);
    }
    buildRows();
    buildStats();
    st.marksDirty = true;
    st.skipPerf = true;
    st.dirty = true;
  }

  // ----- playback -----
  function play(on) {
    if (on && st.t >= T_MAX) st.t = 0;
    st.playing = on;
    $("waves-play-label").textContent = on ? "Pause" : st.t >= T_MAX ? "Replay" : "Play";
    $("waves-play-icon").setAttribute("d", on ? "M2 1h3v10H2zM7 1h3v10H7z" : "M2 1l9 5-9 5z");
    st.dirty = true;
  }

  function wireControls() {
    $("waves-play").addEventListener("click", () => { st.started = true; play(!st.playing); });
    $("waves-speed").addEventListener("click", (e) => {
      const b = e.target.closest("[data-speed]");
      if (!b) return;
      st.speed = +b.dataset.speed;
      $("waves-speed").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    });
    const scrub = $("waves-scrub");
    scrub.addEventListener("input", () => {
      st.started = true;
      if (st.playing) play(false);
      st.t = +scrub.value;
      st.dirty = true;
    });
    st.opts = 7;
    $("waves-key").addEventListener("click", (e) => {
      const b = e.target.closest("[data-bit]");
      if (!b) return;
      st.opts ^= +b.dataset.bit;
      b.setAttribute("aria-pressed", String(!!(st.opts & +b.dataset.bit)));
      W.waves_opts(st.opts);
      st.dirty = true;
    });
    $("waves-follow").addEventListener("click", () => {
      st.follow = true;
      $("waves-follow").hidden = true;
      st.dirty = true;
    });
  }

  // ----- drawing -----
  function draw() {
    st.dirty = false;
    if (st.resized) {
      st.resized = false;
      const f = R.fit(canvas, 1.15e6, st.scale);
      const disc = f.cw < 520 ? 0.375 : 0.41;
      if (f.changed || !st.sized || disc !== st.disc) { W.waves_resize(f.pw, f.ph, disc); st.disc = disc; st.skipPerf = true; st.marksDirty = true; st.sized = true; }
      st.k = f.k;
    }
    let t0 = performance.now();
    if (W.waves_render(st.t)) {
      const ms = performance.now() - t0;
      if (st.skipPerf) st.skipPerf = false;
      else { st.perf = st.perf ? st.perf * 0.9 + ms * 0.1 : ms; R.perf("04 Waves cross-section", ms, canvas.width, canvas.height); }
      R.blit(ctx, W.waves_pixels(), canvas.width, canvas.height);
      adapt();
    }
    if (st.marksDirty) { st.marksDirty = false; layoutMarks(); }
    placeFronts();
    if (st.hideBusy) { st.hideBusy = false; $("waves-busy").hidden = true; }
    drawGlobe();
    drawChart();
    updateLive();
  }

  // Keep the cross-section under ~16 ms: step resolution down if needed, back up with headroom.
  let adaptAt = 0;
  function adapt() {
    const now = performance.now();
    if (now - adaptAt < 1500 || !st.perf || !st.playing) return;
    adaptAt = now;
    const old = st.scale;
    if (st.perf > 16 && st.scale > 0.5) st.scale = Math.max(0.5, st.scale * 0.85);
    else if (st.perf < 7 && st.scale < 1) st.scale = Math.min(1, st.scale / 0.85);
    if (st.scale !== old) { st.resized = true; st.perf = 0; }
  }

  function updateLive() {
    const t = st.t;
    $("waves-time").textContent = fmt(t);
    $("waves-scrub-out").textContent = `${fmt(t)} of ${fmt(T_MAX)}`;
    const scrub = $("waves-scrub");
    if (+scrub.value !== Math.round(t)) scrub.value = Math.round(t);
    // Table and labels light up as each wave arrives.
    for (const l of st.listeners) {
      const p = t >= l.p, s = t >= l.s;
      const state = (p ? 1 : 0) | (s ? 2 : 0);
      if (state === l.state) continue;
      l.state = state;
      if (l.row) {
        l.row.classList.toggle("p", p && !s);
        l.row.classList.toggle("s", s);
        l.row.querySelector(".pc").classList.toggle("on-p", p);
        l.row.querySelector(".sc").classList.toggle("on-s", s);
      }
      if (l.mark) { l.mark.classList.toggle("p", p && !s); l.mark.classList.toggle("s", s); }
      if (l.gmark) { l.gmark.classList.toggle("p", p && !s); l.gmark.classList.toggle("s", s); }
    }
  }

  // ----- cross-section labels -----
  function layoutMarks() {
    if (!st.info) return;
    const host = $("waves-marks");
    const k = st.k || 1;
    const cx = W.waves_layout(0) / k, cy = W.waves_layout(1) / k, rad = W.waves_layout(2) / k;
    const at = (r, th, side) => [cx + side * rad * r * Math.sin(th), cy - rad * r * Math.cos(th)];
    const html = [];
    // Layers, down the far side of the axis.
    const layer = (r, name, sub) => {
      const [x, y] = at(r, Math.PI, 1);
      html.push(`<div class="mark layer" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"><b>${name}</b>${sub ? `<br>${sub}` : ""}</div>`);
    };
    layer(0, "Inner core", "solid iron");
    layer((1217.5 + 3479.5) / 2 / 6371, "Outer core", "liquid iron, no S waves");
    layer((3479.5 + 5711) / 2 / 6371, "Lower mantle", "");
    if (rad > 220) layer((6371 - 535) / 6371, "transition zone", "");
    // Distances from the source, inside the rim.
    for (const d of [30, 60, 90, 120, 150]) {
      for (const side of [-1, 1]) {
        const [x, y] = at(0.93, toRad(d), side);
        html.push(`<div class="mark deg" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${d}°</div>`);
      }
    }
    const i = st.info;
    // Cities, at their distance, east on the right and west on the left.
    for (const l of st.listeners) {
      const th = toRad(l.delta);
      const [x, y] = at(1.085, th, l.side);
      const tx = -50 + 50 * l.side * Math.sin(th), ty = -50 - 50 * Math.cos(th);
      html.push(`<div class="mark city" data-k="${l.k}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;transform:translate(${tx.toFixed(0)}%,${ty.toFixed(0)}%)"><b>${R.esc(l.name)}</b></div>`);
    }
    // Phase names that ride on the fronts.
    for (const f of FRONTS) html.push(`<div class="mark front ${f.cls}" data-front="${f.name}" hidden>${f.name}</div>`);
    host.innerHTML = html.join("");
    for (const f of FRONTS) f.el = host.querySelector(`[data-front="${f.name}"]`);
    st.layerEls = [...host.querySelectorAll(".layer")];
    st.geo = { cx, cy, rad };
    for (const l of st.listeners) { l.mark = host.querySelector(`.city[data-k="${l.k}"]`); l.state = -1; }
    markHot();
    // Keep city labels inside the view, then drop any that would sit on an earlier
    // one or on the clock and key.
    const view = host.getBoundingClientRect();
    const boxes = [...document.querySelectorAll("#waves .wv-clock, #waves .wv-key, #waves .wv-marks .layer")]
      .filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
    const hit = (b) => boxes.some((o) => b.left < o.right + 3 && b.right > o.left - 3 && b.top < o.bottom + 2 && b.bottom > o.top - 2);
    for (const l of st.listeners) {
      let b = l.mark.getBoundingClientRect();
      const shift = b.left < view.left + 2 ? view.left + 2 - b.left : b.right > view.right - 2 ? view.right - 2 - b.right : 0;
      if (shift) {
        l.mark.style.left = (parseFloat(l.mark.style.left) + shift).toFixed(1) + "px";
        b = l.mark.getBoundingClientRect();
      }
      if (hit(b)) l.mark.hidden = true;
      else boxes.push(b);
    }
    // Shadow-zone labels go wherever along their arc they fit.
    const shadow = (from, to, side, cls, text, sub) => {
      const el = document.createElement("div");
      el.className = `mark shadow ${cls}`;
      el.innerHTML = `${text}<span>${sub}</span>`;
      host.appendChild(el);
      const tries = [];
      for (const r of [1.12, 1.2, 1.3, 0.86]) for (const u of [0.5, 0.3, 0.7, 0.15, 0.85]) tries.push([r, from + (to - from) * u]);
      for (const [r, deg] of tries) {
        const th = toRad(deg);
        const [x, y] = at(r, th, side);
        const sg = r < 1 ? -1 : 1;
        const tx = -50 + 50 * sg * side * Math.sin(th), ty = -50 - 50 * sg * Math.cos(th);
        el.style.left = x.toFixed(1) + "px";
        el.style.top = y.toFixed(1) + "px";
        el.style.transform = `translate(${tx.toFixed(0)}%,${ty.toFixed(0)}%)`;
        const b = el.getBoundingClientRect();
        if (!hit(b) && b.left >= view.left && b.right <= view.right && b.top >= view.top && b.bottom <= view.bottom) { boxes.push(b); return; }
      }
      el.remove();
    };
    shadow(i.pShadow, i.pkpMin, 1, "p", "P shadow", `${i.pShadow.toFixed(0)}° to ${i.pkpMin.toFixed(0)}°`);
    shadow(i.sShadow, 178, -1, "s", "S shadow", `beyond ${i.sShadow.toFixed(0)}°`);
  }

  // Where to name each wave: (field, radius of the ring it is found on, scan from and
  // to, side). The first that is present wins, so a name follows its wave from the
  // core out into the mantle. Found a few seconds ahead of the crest, in the dark.
  const FRONTS = [
    { name: "P", cls: "p", at: [[0, 4970, 0, 180, 1]], amin: 2e-5 },
    { name: "S", cls: "s", at: [[1, 4970, 0, 180, -1]], amin: 8e-6 },
    { name: "PKP", cls: "p", at: [[5, 5600, 180, 95, 1], [3, 2700, 180, 0, 1]], amin: 4e-6 },
    { name: "PKIKP", cls: "p", at: [[4, 5600, 180, 95, -1], [2, 800, 180, 0, -1]], amin: 4e-6 },
  ];
  function placeFronts() {
    if (!st.geo) return;
    const { cx, cy, rad } = st.geo;
    for (const f of FRONTS) {
      if (!f.el) continue;
      let shown = false;
      if (st.opts & (f.name === "S" ? 4 : 2)) {
        for (const [field, r, from, to, side] of f.at) {
          const deg = W.waves_front_th(field, r, st.t + (f.name === "S" ? 22 : 14), f.amin, from, to);
          if (!isFinite(deg)) continue;
          const th = toRad(deg), k = r / 6371;
          f.el.style.left = (cx + side * rad * k * Math.sin(th)).toFixed(1) + "px";
          f.el.style.top = (cy - rad * k * Math.cos(th)).toFixed(1) + "px";
          shown = true;
          break;
        }
      }
      f.el.hidden = !shown;
    }
    // A layer name fades while a wave's name passes over it.
    const tags = FRONTS.filter((f) => f.el && !f.el.hidden).map((f) => f.el.getBoundingClientRect());
    for (const el of st.layerEls || []) {
      const b = el.getBoundingClientRect();
      el.classList.toggle("dim", tags.some((o) => b.left < o.right && b.right > o.left && b.top < o.bottom && b.bottom > o.top));
    }
  }

  // ----- hover on the cross-section -----
  function wireSection() {
    const tip = $("waves-tip");
    const LAYERS = [[35, "Crust"], [410, "Upper mantle"], [660, "Transition zone"], [2891.5, "Lower mantle"], [5153.5, "Outer core"], [6371, "Inner core"]];
    const show = (e) => {
      if (!st.ready) return;
      const [x, y] = R.local(canvas, e);
      const cx = W.waves_layout(0), cy = W.waves_layout(1), rad = W.waves_layout(2);
      const r = Math.hypot(x - cx, y - cy) / rad * 6371;
      if (r > 6371) { tip.hidden = true; return; }
      const depth = 6371 - r;
      const delta = toDeg(Math.atan2(Math.abs(x - cx), cy - y));
      const name = LAYERS.find((l) => depth < l[0])?.[1] ?? "Inner core";
      const vp = W.waves_speed(0, depth), vs = W.waves_speed(1, depth);
      let tp = Infinity;
      for (const f of [0, 2, 3, 4, 5]) { const v = W.waves_probe(f, x, y); if (isFinite(v) && v < tp) tp = v; }
      const ts = W.waves_probe(1, x, y);
      const sLine = vs > 0
        ? `S speed <b>${vs.toFixed(1)} km/s</b>`
        : `S speed <b>0</b>, no S waves in liquid`;
      const arr = `<span class="ember">P</span> passes at <b>${isFinite(tp) ? fmt(tp) : "—"}</b> · <span class="teal">S</span> at <b>${isFinite(ts) ? fmt(ts) : vs > 0 ? "never (shadow)" : "never"}</b>`;
      const box = $("waves-view").getBoundingClientRect(), cb = canvas.getBoundingClientRect();
      R.placeTip(tip, cb.left - box.left + x / st.k, cb.top - box.top + y / st.k,
        `<div class="h">${name}</div><div class="meta">${R.num(Math.round(depth))} km deep · ${delta.toFixed(0)}° from the quake<br>P speed <b>${vp.toFixed(1)} km/s</b> · ${sLine}<br>${arr}</div>`);
    };
    canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") show(e); });
    canvas.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") show(e); });
    canvas.addEventListener("pointerleave", () => { tip.hidden = true; });
    canvas.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "k") { st.started = true; play(!st.playing); }
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (st.playing) play(false);
        st.t = Math.max(0, Math.min(T_MAX, st.t + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 60 : 10)));
        st.dirty = true;
      } else return;
      e.preventDefault();
    });
  }

  // ----- globe -----
  function wireGlobe() {
    R.pointer(gcanvas, {
      down() { st.dragging = true; gcanvas.classList.add("dragging"); },
      up() { st.dragging = false; gcanvas.classList.remove("dragging"); },
      drag(dx, dy) {
        const b = gcanvas.getBoundingClientRect();
        const kk = 180 / Math.PI / (Math.min(b.width, b.height) * 0.46 * st.zoom);
        st.yaw -= dx * kk;
        st.pitch = Math.max(-85, Math.min(85, st.pitch + dy * kk));
        st.follow = false;
        $("waves-follow").hidden = false;
        st.dirty = true;
      },
      pinch(ratio) { st.zoom = Math.max(0.8, Math.min(4, st.zoom * ratio)); st.dirty = true; },
    });
    R.wheel(gcanvas, (f) => { st.zoom = Math.max(0.8, Math.min(4, st.zoom * f)); st.dirty = true; }, $("waves-globe-wrap"));
  }

  /** Distances (deg) where a field's surface arrival time crosses `t`, with brightness. */
  function crossings(sf, t, ref, from = 0) {
    const out = [], n = sf.n, step = 180 / (n - 1);
    for (let i = Math.max(1, Math.ceil(from / step)); i < n; i++) {
      const a = sf.t[i - 1], b = sf.t[i];
      if (!isFinite(a) || !isFinite(b)) continue;
      if ((a - t) * (b - t) <= 0 && a !== b) {
        const u = (t - a) / (b - a);
        const amp = sf.a[i - 1] + (sf.a[i] - sf.a[i - 1]) * u;
        out.push([(i - 1 + u) * step, disp(amp * 6, ref)]);
      }
    }
    return out;
  }

  function drawGlobe() {
    if (st.gresized) {
      st.gresized = false;
      const f = R.fit(gcanvas, 3.2e5);
      if (f.changed || !st.gsized) { W.globe_resize(G, f.pw, f.ph); st.gsized = true; }
      st.gk = f.k;
    }
    const q = st.q, t = st.t, i = st.info;
    if (st.follow) {
      const c = 150 * smooth(110, 1300, t);
      [st.pitch, st.yaw] = travel(q.lat, q.lon, st.followAz, c);
      st.zoom = 1;
    }
    W.globe_view(G, st.yaw, st.pitch, st.zoom);
    W.globe_cursor(G, q.t + 1);
    W.globe_overlay_clear(G);
    // The P shadow: a dim band of rings between where direct P stops and PKP returns.
    for (let d = i.pShadow; d <= i.pkpMin; d += 2.5) W.globe_overlay_circle(G, q.lat, q.lon, d, R.colors.ember, 0.07, 1);
    W.globe_overlay_circle(G, q.lat, q.lon, i.sShadow, R.colors.teal, 0.28, 1);
    // Fronts at the surface now, with two fading echoes behind.
    const fronts = [["P", R.colors.ember, 3e-4, 0], ["S", R.colors.teal, 1.2e-4, 0], ["PKIKP", R.colors.ember, 3e-4, i.pkikpMin - 1], ["PKP", R.colors.ember, 3e-4, i.pkpMin - 6]];
    for (const [name, col, ref, from] of fronts) {
      if (!(st.opts & (name === "S" ? 4 : 2))) continue;
      for (const [lag, a, w] of [[24, 0.18, 1], [12, 0.38, 1.4], [0, 1, 2.4]]) {
        if (t - lag <= 0) continue;
        for (const [d, b] of crossings(st.surf[name], t - lag, ref, from)) {
          if (b > 0.04) W.globe_overlay_circle(G, q.lat, q.lon, d, col, a * (0.25 + 0.75 * b), w);
        }
      }
    }
    // Cities.
    for (const l of st.listeners) {
      const c = t >= l.s ? R.colors.teal : t >= l.p ? R.colors.ember : R.colors.ink2;
      const flash = Math.max(t >= l.p ? Math.exp(-(t - l.p) / 30) : 0, t >= l.s ? Math.exp(-(t - l.s) / 30) : 0);
      W.globe_overlay_point(G, l.lat, l.lon, (l.k === st.hot ? 3.4 : 2.2) + 5 * flash, c, (t >= l.p ? 1.1 : 0.7) + flash);
    }
    W.globe_overlay_point(G, q.lat, q.lon, 2.6, 0xfff4e0, 1.6);
    W.globe_overlay_point(G, q.lat, q.lon, 7, R.colors.ember, 0.35 + 0.8 * Math.exp(-t / 25));
    const t0 = performance.now();
    W.globe_render(G);
    R.perf("04 Waves globe", performance.now() - t0, gcanvas.width, gcanvas.height);
    R.blit(gctx, W.globe_pixels(G), gcanvas.width, gcanvas.height);
    // City labels on the near side.
    const host = $("waves-gmarks");
    if (!st.gmarksBuilt || st.gmarksFor !== st.src) {
      host.innerHTML = st.listeners.map((l) => `<div class="mark" data-k="${l.k}">${R.esc(l.name)}</div>`).join("");
      for (const l of st.listeners) { l.gmark = host.querySelector(`[data-k="${l.k}"]`); l.state = -1; }
      st.gmarksBuilt = true;
      st.gmarksFor = st.src;
      markHot();
    }
    const gk = st.gk || 1, gw = gcanvas.width / gk;
    for (const l of st.listeners) {
      const z = W.globe_project(G, l.lat, l.lon, 2);
      l.gmark.hidden = z < 0.08;
      if (z >= 0.08) {
        const x = W.globe_project(G, l.lat, l.lon, 0) / gk;
        l.gmark.style.left = x.toFixed(1) + "px";
        l.gmark.style.top = (W.globe_project(G, l.lat, l.lon, 1) / gk).toFixed(1) + "px";
        l.gmark.classList.toggle("l", x > gw * 0.6);
      }
    }
  }

  // ----- chart -----
  function wireChart() {
    const at = (e) => {
      const b = ccanvas.getBoundingClientRect();
      const k = ccanvas.width / b.width;
      const [x0, y0, x1, y1] = [0, 1, 2, 3].map((j) => W.waves_chart_rect(j) / k);
      const x = e.clientX - b.left, y = e.clientY - b.top;
      return [Math.max(0, Math.min(180, (x - x0) / (x1 - x0) * 180)), Math.max(0, Math.min(T_MAX, (y1 - y) / (y1 - y0) * T_MAX))];
    };
    let down = false;
    ccanvas.addEventListener("pointerdown", (e) => {
      down = true;
      ccanvas.setPointerCapture(e.pointerId);
      st.started = true;
      if (st.playing) play(false);
      st.t = at(e)[1];
      st.dirty = true;
    });
    ccanvas.addEventListener("pointermove", (e) => {
      const [d, t] = at(e);
      st.hoverDelta = e.pointerType === "mouse" ? d : -1;
      if (down) st.t = t;
      st.dirty = true;
    });
    const up = () => { down = false; };
    ccanvas.addEventListener("pointerup", up);
    ccanvas.addEventListener("pointercancel", up);
    ccanvas.addEventListener("pointerleave", () => { st.hoverDelta = -1; st.dirty = true; });
  }

  function drawChart() {
    if (st.cresized) {
      st.cresized = false;
      const f = R.fit(ccanvas, 4.5e5);
      if (f.changed || !st.csized) { W.waves_chart_resize(f.pw, f.ph, f.k); st.csized = true; st.axesDirty = true; }
      st.ck = f.k;
    }
    const t0 = performance.now();
    if (!W.waves_chart_render(st.t, st.hoverDelta)) return;
    R.perf("04 Waves chart", performance.now() - t0, ccanvas.width, ccanvas.height);
    R.blit(cctx, W.waves_chart_pixels(), ccanvas.width, ccanvas.height);
    if (st.axesDirty || st.axesFor !== st.info) layoutAxes();
  }

  function layoutAxes() {
    st.axesDirty = false;
    st.axesFor = st.info;
    const k = st.ck || 1;
    const [x0, y0, x1, y1] = [0, 1, 2, 3].map((j) => W.waves_chart_rect(j) / k);
    const X = (d) => x0 + (x1 - x0) * d / 180, Y = (s) => y1 - (y1 - y0) * s / T_MAX;
    const html = [];
    for (let d = 0; d <= 180; d += 30) html.push(`<span class="x" style="left:${X(d).toFixed(1)}px;top:${y1.toFixed(1)}px">${d}°</span>`);
    for (let m = 0; m <= 25; m += 5) html.push(`<span class="y" style="left:${x0.toFixed(1)}px;top:${Y(m * 60).toFixed(1)}px">${m} min</span>`);
    const i = st.info;
    html.push(`<span class="zone p" style="left:${X((i.pShadow + i.pkpMin) / 2).toFixed(1)}px;top:${(y0 + 4).toFixed(1)}px">P shadow</span>`);
    html.push(`<span class="zone s" style="left:${X(Math.min(170, (i.sShadow + 180) / 2)).toFixed(1)}px;top:${(Y(T_MAX * 0.18)).toFixed(1)}px">S shadow</span>`);
    // Curve names where they are clearly separated.
    const lab = (name, cls, d, field, dy = -18) => {
      const sf = st.surf[field], idx = Math.round(d / 180 * (sf.n - 1));
      const t = sf.t[idx];
      if (isFinite(t) && t < T_MAX * 0.95) html.push(`<span class="zone ${cls}" style="left:${X(d).toFixed(1)}px;top:${(Y(t) + dy).toFixed(1)}px">${name}</span>`);
    };
    lab("P", "p", 55, "P");
    lab("S", "s", 50, "S");
    lab("PKP", "p", 168, "PKP");
    lab("PKIKP", "p", 127, "PKIKP", 6);
    $("waves-axes").innerHTML = html.join("");
  }

  // ----- table, stats -----
  function buildRows() {
    const rows = st.listeners.map((l) => {
      const pTxt = isFinite(l.p) ? fmt(l.p) : "—";
      const sTxt = isFinite(l.s) ? `${fmt(l.s)}<small>S</small>` : `—<small>in the S shadow</small>`;
      return `<tr data-k="${l.k}" tabindex="0"><td class="name">${R.esc(l.name)}<small>${l.delta.toFixed(1)}° · ${R.num(Math.round(l.delta * KM_PER_DEG / 10) * 10)} km</small></td><td class="num pc">${pTxt}<small>${PHASES[l.phase]}</small></td><td class="num sc${isFinite(l.s) ? "" : " none"}">${sTxt}</td></tr>`;
    });
    const body = $("waves-rows");
    body.innerHTML = rows.join("");
    for (const l of st.listeners) { l.row = body.querySelector(`tr[data-k="${l.k}"]`); l.state = -1; }
    if (!st.rowsBuilt) {
      st.rowsBuilt = true;
      const hot = (e) => { const tr = e.target.closest("tr[data-k]"); setHot(tr ? +tr.dataset.k : -1); };
      body.addEventListener("pointerover", hot);
      body.addEventListener("focusin", hot);
      body.addEventListener("pointerleave", () => setHot(-1));
      body.addEventListener("focusout", () => setHot(-1));
    }
  }

  function setHot(k) {
    if (k === st.hot) return;
    st.hot = k;
    W.waves_listener_hot(k);
    markHot();
    st.dirty = true;
  }
  function markHot() {
    for (const l of st.listeners) {
      const h = l.k === st.hot;
      l.row?.classList.toggle("hot", h);
      l.mark?.classList.toggle("hot", h);
      l.gmark?.classList.toggle("hot", h);
    }
  }

  function buildStats() {
    const i = st.info;
    const ms = st.solveTimes[st.depthKey];
    const solved = ms ? `${Math.round(ms)} ms` : "cached";
    $("waves-stats").innerHTML = `
      <div class="stat"><b class="ember">${i.pShadow.toFixed(1)}°</b><span>direct P grazes the core and stops</span></div>
      <div class="stat"><b class="ember">${i.pkpMin.toFixed(1)}°</b><span>P returns through the core (PKP)</span></div>
      <div class="stat"><b class="ember">${i.pkikpMin.toFixed(1)}°</b><span>nearest PKIKP, Lehmann's faint waves</span></div>
      <div class="stat"><b class="teal">${i.sShadow.toFixed(1)}°</b><span>direct S stops; beyond, S shadow</span></div>
      <div class="stat"><b>${solved}</b><span>to solve travel times for this ${Math.round(i.depth)} km source</span></div>
      <div class="stat"><b>${R.num(i.nt * i.rings)}</b><span>grid nodes in the half-plane</span></div>`;
    $("waves-story").innerHTML = `For this quake, ${Math.round(i.depth)} km deep, direct P waves reach only ${i.pShadow.toFixed(0)}° from the source before the core blocks them. They return beyond ${i.pkpMin.toFixed(0)}°, after crossing the core. Direct S waves stop at ${i.sShadow.toFixed(0)}° and never return, because the outer core is liquid.`;
    $("waves-foot").innerHTML = `Method: travel times solve the eikonal equation |∇T| = 1/v by fast marching (Sethian 1996) on a ${i.nt} × ${i.rings} polar grid in the plane through the quake and the centre, second order where the grid allows, in seven stages: P and S in the mantle, P in the whole core and in the liquid outer core, then the core waves back up (where they leave the core comes from ray theory). Brightness is the ray density carried with the solution, times attenuation. Speeds simplified from ak135 (Kennett, Engdahl &amp; Buland 1995), outer core from iasp91 (Kennett &amp; Engdahl 1991). For a surface source the solver matches ray theory through the same model to within 1 s, and the iasp91 tables to within 1.5%. Rays: P on the right, S on the left. Cities sit at their true distance, east of the quake on the right.`;
  }
})();
