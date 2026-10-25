/* ===== 05 Records: The Drum ================================================ */
(() => {
  const R = ROF, DAY = R.DAY;
  const $ = (id) => document.getElementById(id);
  const STATIONS = [
    { code: "ANMO", name: "Albuquerque, New Mexico, USA" },
    { code: "KONO", name: "Kongsberg, Norway" },
    { code: "CTAO", name: "Charters Towers, Queensland, Australia" },
    { code: "COLA", name: "College, near Fairbanks, Alaska, USA" },
    { code: "HRV", name: "Harvard, Massachusetts, USA" },
  ];
  // Time on one line, and how much faster than real time the sound plays.
  // Gains mirror the pen magnification in drum.rs.
  const ZOOMS = [
    { name: "Hour", line: "2 minutes", speed: 600, gain: 1 },
    { name: "Day", line: "1 hour", speed: 2400, gain: 1 },
    { name: "Week", line: "6 hours", speed: 14400, gain: 0.7 },
    { name: "Month", line: "1 day", speed: 86400, gain: 0.5 },
    { name: "3 years", line: "1 month", speed: 0, gain: 0.3 },
  ];
  const RATE = 22050;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const PHASE = { P: ["", "P", "PKP", "Pdiff"], S: ["", "S", "SKS", "Sdiff"] };
  const p2 = (v) => String(v).padStart(2, "0");
  const utc = (t) => new Date((R.epoch + t) * 1000);
  const hm = (d) => `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  const dm = (d) => `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
  const compass = (deg) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  const st = {
    station: 0, zoom: 1, center: 0, half: 12, sp: 1, k: 1, cw: 1, ch: 1, x0: 60, ncol: 1,
    dirty: true, ovDirty: true, statsDirty: true, scale: 1, perf: 0,
    hover: -1, focus: -1, fly: null, vel: 0, dragging: false, lastMove: 0,
    follow: true, wheelAcc: 1, pinchAcc: 1,
    audio: null, actx: null, vol: 0.7,
  };
  let W, canvas, ctx, ov, octx, refc, rctx, view;
  const pools = { rows: [], notes: [] };

  view = {
    id: "helicorder",
    debug: null,
    init() {
      W = R.W;
      canvas = $("helicorder-canvas"); ctx = canvas.getContext("2d");
      ov = $("helicorder-ov"); octx = ov.getContext("2d");
      refc = $("helicorder-ref"); rctx = refc.getContext("2d");
      W.helicorder_init(0);
      W.helicorder_cursor(R.state.cursor);
      buildStations();
      wireControls();
      wireDrum();
      wireOverview();
      buildOvAxis();
      R.sized($("helicorder-drum"), resize);
      R.sized($("helicorder-ov-wrap"), resizeOv);
      R.sized($("helicorder-ref-wrap"), renderRef);
      resize();
      resizeOv();
      setStation(0, true);
      const sel = R.state.selected;
      if (sel >= 0) { st.focus = sel; W.helicorder_select(sel); updateSel(); jumpToQuake(sel, false); }
      else { st.focus = R.largest(1)[0]; W.helicorder_select(st.focus); updateSel(); jumpToQuake(st.focus, false); }
      R.on("select", onSelect);
      R.on("cursor", (t) => { W.helicorder_cursor(t); st.dirty = st.ovDirty = st.statsDirty = true; });
      R.on("play", () => { st.dirty = true; });
      if (R.coarse) $("helicorder-hint").textContent = "drag to turn the drum · pinch to zoom · tap a burst";
    },
    frame(dt, now) {
      if (st.fly) {
        const f = st.fly, k = Math.min(1, (now - f.t0) / f.dur);
        setCenter(f.c0 + (f.c1 - f.c0) * ease(k));
        if (k >= 1) st.fly = null;
      } else if (!st.dragging && st.vel) {
        setCenter(st.center + st.vel * dt);
        st.vel *= Math.exp(-dt / 0.35);
        if (Math.abs(st.vel) < 0.08) st.vel = 0;
      }
      if (R.state.playing && st.follow && !st.dragging && !st.fly) {
        const c = W.helicorder_pos_of(R.state.cursor) - st.half * 0.45;
        if (Math.abs(c - st.center) > 0.02) setCenter(c);
      }
      if (st.audio) {
        const el = st.actx.currentTime - st.audio.start;
        if (el >= 0) { W.helicorder_playhead(st.audio.t0 + el * st.audio.speed); st.dirty = true; }
      }
      if (st.dirty) draw();
      if (st.ovDirty) drawOv();
      if (st.statsDirty && !st.dragging && !st.fly && !st.vel) updateStats();
    },
  };
  R.view(view);

  // ---------------------------------------------------------------- stations
  function buildStations() {
    $("helicorder-stations").innerHTML = STATIONS.map((s, i) =>
      `<button type="button" data-st="${i}" aria-pressed="${i === 0}" title="${R.esc(s.name)}">${s.code}</button>`).join("");
  }
  function setStation(i, first) {
    st.station = i;
    stopAudio();
    W.helicorder_station(i);
    document.querySelectorAll("#helicorder-stations button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.st === i)));
    const s = STATIONS[i], lat = W.helicorder_station_coord(i, 0), lon = W.helicorder_station_coord(i, 1);
    $("helicorder-station").innerHTML = `<b>${s.code}</b>, ${R.esc(s.name)}<br><span>${R.coord(lat, lon)} · IU network · vertical sensor</span>`;
    $("helicorder-code").textContent = s.code;
    buildJumps();
    renderRef();
    if (!first) updateSel();
    st.dirty = st.ovDirty = st.statsDirty = true;
  }

  // ---------------------------------------------------------------- jumps
  function buildJumps() {
    const items = [];
    const big = R.largest(1)[0];
    const add = (i, title, tag, d) => items.push(`<li><button type="button" data-q="${i}"><span class="t">${title}<em>${tag}</em></span><span class="d">${d}</span></button></li>`);
    const code = STATIONS[st.station].code;
    {
      const q = R.q(big), clip = W.helicorder_event(big, 11);
      add(big, `M${q.mag.toFixed(1)} ${R.esc(R.shortPlace(R.place(big)))}`, "largest",
        `${R.fmtDate(q.t)}, ${W.helicorder_event(big, 0).toFixed(1)}° from ${code}.` + (clip > 60 ? ` The pen is on its stops for ${R.fmtDuration(clip)} in all.` : ""));
    }
    const deep = W.helicorder_notable(1);
    if (deep >= 0 && deep !== big) {
      const q = R.q(deep);
      add(deep, `M${q.mag.toFixed(1)} ${R.esc(R.shortPlace(R.place(deep)))}`, "deep",
        `${Math.round(q.depth)} km down. Sharp P and S, and almost no surface waves.`);
    }
    const near = W.helicorder_notable(2);
    if (near >= 0 && near !== big && near !== deep) {
      const q = R.q(near), sp = W.helicorder_event(near, 3) - W.helicorder_event(near, 2);
      add(near, `M${q.mag.toFixed(1)} ${R.esc(R.shortPlace(R.place(near)))}`, "close",
        `${W.helicorder_event(near, 0).toFixed(1)}° away, so S follows P by only ${R.fmtDuration(sp)}.`);
    }
    const qd = W.helicorder_quiet_day();
    items.push(`<li><button type="button" data-day="${qd}"><span class="t">${R.fmtDate(qd * DAY)}<em>quietest day</em></span><span class="d">The loudest signal all day was ${R.num(W.helicorder_day_peak(qd), 1)} times the background.</span></button></li>`);
    $("helicorder-jumps").innerHTML = items.join("");
  }

  // ---------------------------------------------------------------- view control
  function setCenter(c) {
    const lo = W.helicorder_pos_of(0) - st.half + 1.5;
    const hi = W.helicorder_pos_of(R.tEnd) + st.half - 1.5;
    c = Math.max(lo, Math.min(hi, c));
    if (c === st.center) return;
    if (Math.abs(c - st.center) > 0.3) $("helicorder-tip").hidden = true;
    st.center = c;
    W.helicorder_set_center(c);
    st.dirty = st.ovDirty = st.statsDirty = true;
  }
  function flyTo(c, animate = true) {
    st.vel = 0;
    const dist = Math.abs(c - st.center);
    if (!animate || R.reduceMotion || dist > 80) { st.fly = null; setCenter(c); return; }
    st.fly = { t0: performance.now(), dur: 350 + Math.min(500, dist * 12), c0: st.center, c1: c };
  }
  /** Line coordinate that puts time t on the third line from the top of the face. */
  function centerFor(t, top = 3) {
    return Math.floor(W.helicorder_pos_of(t)) + st.half - top;
  }
  function jumpToQuake(i, animate = true, maxZoom = 1) {
    const q = R.q(i);
    if (q.t > R.state.cursor) { R.play(false); R.setCursor(R.tEnd, "helicorder"); }
    if (st.zoom > maxZoom) setZoom(maxZoom, null, false);
    flyTo(centerFor(q.t), animate);
  }
  function setZoom(z, anchor, keep = true) {
    z = Math.max(0, Math.min(ZOOMS.length - 1, z));
    if (z === st.zoom) return;
    stopAudio();
    // Keep the time under the pointer (or at the front) on the same line of the face.
    let t, off = 0;
    if (anchor) {
      t = W.helicorder_time_at(anchor[0], anchor[1]);
      off = W.helicorder_line_at(anchor[1]) - st.center;
    }
    if (!Number.isFinite(t)) { t = W.helicorder_line_start(Math.round(st.center)); off = 0; }
    st.zoom = z;
    W.helicorder_zoom(z);
    readLayout();
    document.querySelectorAll("#helicorder-zooms button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.z === z)));
    st.center = NaN;
    setCenter(keep ? Math.floor(W.helicorder_pos_of(t)) + 0.5 - (Number.isFinite(off) ? off : 0) : W.helicorder_center());
    buildAxis();
    syncListen();
  }

  function onSelect(i, from) {
    if (i < 0) {
      st.focus = -1;
      W.helicorder_select(-1);
      $("helicorder-tip").hidden = true;
    } else {
      st.focus = i;
      W.helicorder_select(i);
      if (from !== "helicorder") jumpToQuake(i, true, Math.min(st.zoom, 1));
    }
    updateSel();
    st.dirty = st.ovDirty = true;
  }

  // ---------------------------------------------------------------- sizing
  function readLayout() {
    st.x0 = W.helicorder_layout(0);
    st.ncol = W.helicorder_layout(1);
    st.sp = W.helicorder_layout(2);
    st.half = W.helicorder_layout(3) * 0.9 / st.sp;
  }
  function resize() {
    const f = R.fit(canvas, 1.3e6, st.scale);
    st.k = f.k; st.cw = f.cw; st.ch = f.ch;
    if (f.changed) { W.helicorder_resize(f.pw, f.ph, f.k); st.skipPerf = 2; }
    readLayout();
    W.helicorder_set_center(st.center);
    buildAxis();
    st.dirty = st.ovDirty = st.statsDirty = true;
  }
  function resizeOv() {
    const f = R.fit(ov, 2.5e5);
    if (f.changed) W.helicorder_ov_resize(f.pw, f.ph);
    buildOvAxis();
    st.ovDirty = true;
  }

  // Keep frames under ~16 ms: lower the resolution on slow machines, raise it with headroom.
  let adaptAt = 0;
  function adapt() {
    const now = performance.now();
    if (now - adaptAt < 1500 || !st.perf) return;
    adaptAt = now;
    const old = st.scale;
    if (st.perf > 18 && st.scale > 0.5) st.scale = Math.max(0.5, st.scale * 0.85);
    else if (st.perf < 8 && st.scale < 1) st.scale = Math.min(1, st.scale / 0.85);
    if (st.scale !== old) resize();
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    st.dirty = false;
    // New lines first (a few per frame, nearest the front), then the drawing itself.
    const t0 = performance.now();
    const pending = W.helicorder_prepare(st.dragging || st.vel || st.fly ? 6 : 14);
    const t1 = performance.now();
    W.helicorder_render();
    const ms = performance.now() - t1;
    if (pending > 0) st.dirty = true;
    R.blit(ctx, W.helicorder_pixels(), canvas.width, canvas.height);
    if (t1 - t0 > 0.5) R.perf("05 Records new lines", t1 - t0, canvas.width, canvas.height);
    if (st.skipPerf) st.skipPerf--;
    else { st.perf = st.perf ? st.perf * 0.9 + ms * 0.1 : ms; R.perf("05 Records drum", ms, canvas.width, canvas.height); }
    layoutRows();
    layoutNotes();
    updateHead();
    adapt();
  }

  function pool(name, host, n) {
    const p = pools[name];
    while (p.length < n) { const el = document.createElement("div"); el.className = "mark"; host.appendChild(el); p.push(el); }
    return p;
  }
  function setMark(el, html, x, y, cls) {
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
    if (el.className !== cls) el.className = cls;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.hidden = false;
  }

  function rowText(t) {
    const d = utc(t), z = st.zoom;
    const midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
    if (z === 4) return [`${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`, d.getUTCMonth() === 0];
    if (z === 3) return [dm(d), d.getUTCDate() === 1];
    if (midnight) return [dm(d), true];
    return [hm(d), false];
  }
  function layoutRows() {
    const host = $("helicorder-rows");
    const a = W.helicorder_face(0) - 1, b = W.helicorder_face(1) + 1;
    const els = pool("rows", host, b - a + 1);
    let n = 0, last = -1e9;
    for (let k = a; k <= b; k++) {
      const y = W.helicorder_line_y(k, 0) / st.k;
      if (y < 7 || y > st.ch - 8 || y - last < 11) continue;
      const t = W.helicorder_line_start(k);
      if (t < 0 || t > R.tEnd + 40 * DAY) continue;
      const [txt, strong] = rowText(t);
      setMark(els[n++], txt, 0, y - 7, strong ? "mark day" : "mark");
      last = y;
    }
    for (; n < els.length; n++) els[n].hidden = true;
  }

  function layoutNotes() {
    const host = $("helicorder-notes");
    // Call the export first: it may grow memory and detach older views.
    const mp = W.helicorder_marks(), mn = W.helicorder_buf_len();
    const marks = Array.from(new Float32Array(W.memory.buffer, mp, mn));
    const ap = W.helicorder_arrivals(), an = W.helicorder_buf_len();
    const arr = Array.from(new Float32Array(W.memory.buffer, ap, an));
    const els = pool("notes", host, 16);
    if (!st.charW) {
      // The label font is monospaced: measure one character once.
      const probe = els[els.length - 1];
      probe.hidden = false;
      probe.textContent = "M".repeat(20);
      st.charW = probe.offsetWidth > 0 ? (probe.offsetWidth - 8) / 20 : 7;
      probe.dataset.h = "";
    }
    const cw = st.charW, pad = 8;
    const boxes = [];
    const free = (x0, y0, x1, y1) => boxes.every((b) => x1 < b[0] || x0 > b[2] || y1 < b[1] || y0 > b[3]);
    let n = 0;
    // Arrival letters of the focused quake first: they matter most.
    const names = ["P", "PP", "S", "R1", "R2"];
    const cls = ["p", "p", "s", "r", "r"];
    for (let j = 0; j + 2 < arr.length && st.zoom <= 2; j += 3) {
      const kind = arr[j + 2];
      if (kind > 4) continue;
      const x = arr[j] / st.k, y = arr[j + 1] / st.k;
      const w = names[kind].length * cw + pad;
      if (y < 4 || y > st.ch - 12 || !free(x - 3, y, x - 3 + w, y + 12)) continue;
      boxes.push([x - 3, y, x - 3 + w, y + 12]);
      setMark(els[n++], names[kind], x - 3, y + 1, `mark arr ${cls[kind]}`);
    }
    // Then the largest quakes' origins, biggest first, where they fit.
    let labelled = 0;
    for (let j = 0; j + 3 < marks.length && n < els.length - 1 && labelled < 7; j += 4) {
      const q = marks[j], x = marks[j + 1] / st.k + 5, y = marks[j + 2] / st.k - 9, mag = marks[j + 3];
      if (y < 2 || y > st.ch - 14) continue;
      const name = R.shortPlace(R.place(q));
      const html = `<b>M${mag.toFixed(1)}</b> ${R.esc(name)}`;
      const w = cw * (5 + name.length) + pad;
      const ws = cw * 4 + pad;
      if (x + w > st.cw - 4 || !free(x, y, x + w, y + 12)) {
        if (!free(x, y, x + ws, y + 12) || x + ws > st.cw - 2) continue;
        boxes.push([x, y, x + ws, y + 12]);
        setMark(els[n++], `<b>M${mag.toFixed(1)}</b>`, x, y, "mark");
      } else {
        boxes.push([x, y, x + w, y + 12]);
        setMark(els[n++], html, x, y, "mark");
      }
      labelled++;
    }
    // Where the record is being written, if the replay has not reached the end.
    const sx = W.helicorder_stylus(0), sy = W.helicorder_stylus(1);
    if (Number.isFinite(sx) && R.state.cursor < R.tEnd - 60) {
      const x = sx / st.k, y = sy / st.k;
      const txt = `recording · ${R.fmtDate(R.state.cursor, true)}`;
      const left = Math.max(2, Math.min(x + 10, st.cw - cw * txt.length - pad - 4));
      setMark(els[n++], txt, left, y - 20, "mark now");
    }
    for (; n < els.length; n++) els[n].hidden = true;
  }

  function windowT() {
    const p = W.helicorder_stats();
    const s = new Float64Array(W.memory.buffer, p, 8);
    return [s[0], s[1]];
  }
  function updateHead() {
    const a = W.helicorder_line_start(W.helicorder_face(0));
    const b = Math.min(W.helicorder_line_end(W.helicorder_face(1)), R.tEnd);
    const da = utc(a), db = utc(b);
    const day = (d, year) => `${dm(d)}${year ? ` ${d.getUTCFullYear()}` : ""}`;
    const sameYear = da.getUTCFullYear() === db.getUTCFullYear();
    const txt = st.zoom === 4 ? `${MON[da.getUTCMonth()]} ${da.getUTCFullYear()} to ${MON[db.getUTCMonth()]} ${db.getUTCFullYear()}`
      : st.zoom === 3 ? `${day(da, !sameYear)} to ${day(db, true)}`
      : `${day(da, true)} ${hm(da)} to ${day(db, !sameYear)} ${hm(db)} UTC`;
    $("helicorder-span").textContent = b > a ? txt : "";
  }

  function updateStats() {
    st.statsDirty = false;
    const p = W.helicorder_stats();
    const s = Array.from(new Float64Array(W.memory.buffer, p, 8));
    const [t0, t1, cat, rec, clip, loud, snr] = s;
    $("helicorder-n-cat").textContent = R.num(cat);
    $("helicorder-n-rec").textContent = R.num(rec);
    $("helicorder-n-clip").textContent = R.num(clip);
    const code = STATIONS[st.station].code;
    if (loud >= 0 && snr >= 2) {
      const q = R.q(loud);
      $("helicorder-loudest").innerHTML = `Loudest: <b>M${q.mag.toFixed(1)} ${R.esc(R.shortPlace(R.place(loud)))}</b>, ${W.helicorder_event(loud, 0).toFixed(1)}° from ${code}, at ${R.num(snr, snr < 10 ? 1 : 0)} times the background.`;
    } else {
      $("helicorder-loudest").textContent = t1 > t0 ? "Nothing here stood out from the background." : "The drum has not recorded this stretch yet.";
    }
    const z = ZOOMS[st.zoom];
    const lines = W.helicorder_face(1) - W.helicorder_face(0) + 1;
    $("helicorder-zoom-read").innerHTML = `One line is <b>${z.line}</b>; ${lines} lines face you.` + (z.gain < 1 ? ` Pen magnification ×${z.gain} so busy lines stay readable.` : "");
    syncListen();
  }

  // ---------------------------------------------------------------- overview
  function drawOv() {
    st.ovDirty = false;
    const sel = st.focus >= 0 ? R.q(st.focus).t : -1;
    W.helicorder_ov_render(sel);
    R.blit(octx, W.helicorder_ov_pixels(), ov.width, ov.height);
  }
  function buildOvAxis() {
    const x = [];
    const start = utc(0);
    const total = R.nDays * DAY;
    for (let y = start.getUTCFullYear(); y <= start.getUTCFullYear() + 4; y++) {
      for (const m of [0, 6]) {
        const t = Date.UTC(y, m, 1) / 1000 - R.epoch;
        if (t > 20 * DAY && t < total - 20 * DAY) x.push(`<span style="left:${(t / total * 100).toFixed(2)}%">${m === 0 ? y : "Jul"}</span>`);
      }
    }
    $("helicorder-ov-x").innerHTML = x.join("");
  }
  function wireOverview() {
    let on = false;
    const go = (e) => {
      const b = ov.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) * R.nDays * DAY;
      st.fly = null; st.vel = 0;
      setCenter(Math.floor(W.helicorder_pos_of(Math.min(t, R.tEnd))) + 0.5);
    };
    ov.addEventListener("pointerdown", (e) => { on = true; ov.setPointerCapture(e.pointerId); go(e); });
    ov.addEventListener("pointermove", (e) => { if (on) go(e); });
    const end = () => { on = false; };
    ov.addEventListener("pointerup", end);
    ov.addEventListener("pointercancel", end);
  }

  // ---------------------------------------------------------------- axis
  function buildAxis() {
    const z = st.zoom;
    const ticks = [
      [0, 30, 60, 90, 120].map((s) => [s, String(s)]),
      [0, 10, 20, 30, 40, 50, 60].map((m) => [m * 60, String(m)]),
      [0, 1, 2, 3, 4, 5, 6].map((h) => [h * 3600, String(h)]),
      [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => [h * 3600, p2(h)]),
      [1, 5, 10, 15, 20, 25, 31].map((d) => [(d - 1) * DAY, String(d)]),
    ][z];
    const span = [120, 3600, 21600, DAY, 31 * DAY][z];
    const left = st.x0 / st.k, width = st.ncol / st.k;
    $("helicorder-axis").innerHTML = ticks.map(([s, txt], i) =>
      `<span class="${i === 0 ? "first" : i === ticks.length - 1 ? "last" : ""}" style="left:${(left + s / span * width).toFixed(1)}px">${txt}</span>`).join("") +
      `<em>${["s", "min", "h", "UTC", "day"][z]}</em>`;
  }

  // ---------------------------------------------------------------- legend
  function renderRef() {
    const host = $("helicorder-ref-wrap");
    if (!W || !host.clientWidth) return;
    const f = R.fit(refc, 1.6e5);
    W.helicorder_ref_render(f.pw, f.ph, f.k);
    R.blit(rctx, W.helicorder_ref_pixels(), f.pw, f.ph);
    const span = W.helicorder_ref_arrival(3);
    const origin = 120 / span;
    const fx = [W.helicorder_ref_arrival(0), W.helicorder_ref_arrival(1), W.helicorder_ref_arrival(2)];
    const lab = [["P", "p"], ["S", "s"], ["surface waves", "r"]];
    const w = f.cw;
    $("helicorder-ref-marks").innerHTML = fx.map((u, i) => Number.isFinite(u)
      ? `<span class="mark ${lab[i][1]}" style="left:${(u * w).toFixed(1)}px">${lab[i][0]}</span>` : "").join("") +
      `<span class="mark o" style="left:${(origin * w + 2).toFixed(1)}px">quake</span>`;
    const secs = fx.map((u) => u * span - 120);
    const code = STATIONS[st.station].code;
    $("helicorder-ref-note").innerHTML = `An M6.0 quake 60° (${R.num(60 * 111.19)} km) from ${code}, 20 km deep. P waves, which squeeze the rock, arrive first, after ${R.fmtDuration(secs[0])}. S waves, which shear it, follow after ${R.fmtDuration(secs[1])}. Surface waves run along the crust and arrive after ${R.fmtDuration(secs[2])}, long periods first, so the wiggles quicken as the train passes.`;
  }

  // ---------------------------------------------------------------- selection
  function updateSel() {
    const i = st.focus;
    const box = $("helicorder-sel");
    if (i < 0) { box.hidden = true; return; }
    box.hidden = false;
    const q = R.q(i), f = (k) => W.helicorder_event(i, k);
    const code = STATIONS[st.station].code;
    const dist = f(0), baz = f(1), tp = f(2), ts = f(3), tr = f(4), tr2 = f(5), tpp = f(6), snr = f(7), clip = f(11);
    const pn = PHASE.P[f(8)] || "P", sn = PHASE.S[f(9)] || "S";
    const line = (cls, name, t) => Number.isFinite(t) ? `<span class="${cls}">${name}</span> after ${R.fmtDuration(t)}<br>` : "";
    $("helicorder-sel-body").innerHTML =
      `<p class="name"><b>M${q.mag.toFixed(1)}</b>${R.esc(R.place(i))}</p>
      <p class="meta">${R.fmtDate(q.t, true)} · ${Math.round(q.depth)} km deep<br>
      <b>${dist.toFixed(1)}°</b> (${R.num(dist * 111.19)} km) from ${code}, to the ${compass(baz)}<br>
      ${line("p", pn, tp)}${dist >= 30 ? line("p", "PP", tpp) : ""}${line("s", sn, ts)}${line("r", "Surface waves", tr)}${line("r", "R2, the long way round,", tr2)}
      Strongest signal <b>${R.num(snr, snr < 10 ? 1 : 0)}×</b> the background${clip > 30 ? `; the pen is on its stops for ${R.fmtDuration(clip)} in all` : ""}.</p>`;
  }

  // ---------------------------------------------------------------- input
  function wireControls() {
    $("helicorder-stations").addEventListener("click", (e) => {
      const b = e.target.closest("[data-st]");
      if (b && +b.dataset.st !== st.station) setStation(+b.dataset.st);
    });
    $("helicorder-zooms").addEventListener("click", (e) => {
      const b = e.target.closest("[data-z]");
      if (b) setZoom(+b.dataset.z, null);
    });
    $("helicorder-follow").addEventListener("click", () => {
      st.follow = !st.follow;
      $("helicorder-follow").setAttribute("aria-pressed", String(st.follow));
    });
    $("helicorder-jumps").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.q != null) {
        const i = +b.dataset.q;
        R.select(i, "helicorder");
        jumpToQuake(i, true, 1);
      } else if (b.dataset.day != null) {
        const t = +b.dataset.day * DAY;
        if (t > R.state.cursor) { R.play(false); R.setCursor(R.tEnd, "helicorder"); }
        if (st.zoom !== 1) setZoom(1, null, false);
        flyTo(Math.floor(W.helicorder_pos_of(t)) + st.half - 0.5);
      }
    });
    $("helicorder-listen").addEventListener("click", listen);
    $("helicorder-vol").addEventListener("input", (e) => {
      st.vol = +e.target.value / 100;
      $("helicorder-vol-out").textContent = `${e.target.value}%`;
      if (st.audio) st.audio.gain.gain.setTargetAtTime(st.vol * st.vol, st.actx.currentTime, 0.03);
    });
  }

  function wireDrum() {
    const tip = $("helicorder-tip");
    const local = (e) => R.local(canvas, e);
    let lastT = 0;
    R.pointer(canvas, {
      down() { st.dragging = true; st.fly = null; st.vel = 0; lastT = performance.now(); canvas.classList.add("dragging"); },
      up() {
        st.dragging = false;
        canvas.classList.remove("dragging");
        if (performance.now() - lastT > 80 || R.reduceMotion) st.vel = 0;
        st.statsDirty = true;
      },
      drag(dx, dy) {
        const now = performance.now();
        const d = -dy * st.k / st.sp;
        setCenter(st.center + d);
        const dt = Math.max(1, now - lastT) / 1000;
        st.vel = 0.6 * st.vel + 0.4 * (d / dt);
        lastT = now;
        if (st.hover >= 0) { st.hover = -1; W.helicorder_hover(-1); tip.hidden = true; }
      },
      pinch(ratio) {
        st.pinchAcc *= ratio;
        if (st.pinchAcc > 1.35) { st.pinchAcc = 1; setZoom(st.zoom - 1, null); }
        else if (st.pinchAcc < 1 / 1.35) { st.pinchAcc = 1; setZoom(st.zoom + 1, null); }
      },
      tap(e) {
        const [x, y] = local(e);
        const i = W.helicorder_pick(x, y);
        R.select(i >= 0 && i !== R.state.selected ? i : -1, "helicorder");
        if (i >= 0) showTip(i, e);
      },
      hover(e) {
        const [x, y] = local(e);
        const i = W.helicorder_pick(x, y);
        canvas.classList.toggle("over", i >= 0);
        if (i !== st.hover) { st.hover = i; W.helicorder_hover(i); st.dirty = true; }
        if (i >= 0) showTip(i, e); else tip.hidden = true;
      },
      leave() {
        canvas.classList.remove("over");
        if (st.hover >= 0) { st.hover = -1; W.helicorder_hover(-1); st.dirty = true; }
        tip.hidden = true;
      },
    });
    R.wheel(canvas, (f, e) => {
      st.wheelAcc *= f;
      const at = local(e);
      if (st.wheelAcc > 1.4) { st.wheelAcc = 1; setZoom(st.zoom - 1, at); }
      else if (st.wheelAcc < 1 / 1.4) { st.wheelAcc = 1; setZoom(st.zoom + 1, at); }
    }, $("helicorder-drum"));
    canvas.addEventListener("keydown", (e) => {
      const page = Math.max(1, Math.floor(st.half * 2 - 2));
      const moves = { ArrowUp: -1, ArrowDown: 1, PageUp: -page, PageDown: page };
      if (moves[e.key] != null) flyTo(Math.round(st.center - 0.5) + 0.5 + moves[e.key]);
      else if (e.key === "Home") flyTo(W.helicorder_pos_of(0) + st.half - 1, false);
      else if (e.key === "End") flyTo(W.helicorder_pos_of(R.state.cursor) - st.half * 0.45, false);
      else if (e.key === "+" || e.key === "=") setZoom(st.zoom - 1, null);
      else if (e.key === "-") setZoom(st.zoom + 1, null);
      else if (e.key === "Escape") R.select(-1, "helicorder");
      else return;
      e.preventDefault();
    });
  }
  function showTip(i, e) {
    const wrap = $("helicorder-drum").getBoundingClientRect();
    const dist = W.helicorder_event(i, 0), tp = W.helicorder_event(i, 2);
    const extra = `<div class="meta">${dist.toFixed(1)}° from ${STATIONS[st.station].code} · ${PHASE.P[W.helicorder_event(i, 8)] || "P"} after ${R.fmtDuration(tp)}</div>`;
    R.placeTip($("helicorder-tip"), e.clientX - wrap.left, e.clientY - wrap.top, R.tipHTML(i) + extra);
  }

  // ---------------------------------------------------------------- sound
  function syncListen() {
    const z = ZOOMS[st.zoom];
    const btn = $("helicorder-listen");
    const on = !!st.audio;
    btn.classList.toggle("on", on);
    $("helicorder-listen-icon").setAttribute("d", on ? "M2 2h8v8H2z" : "M2 1l9 5-9 5z");
    $("helicorder-listen-label").textContent = on ? "Stop" : "Listen to the drum";
    btn.disabled = !z.speed && !on;
    const read = $("helicorder-listen-read");
    if (!z.speed) { read.textContent = "Zoom to a month or closer to listen."; return; }
    if (on) return;
    const [t0, t1] = windowT();
    const secs = Math.min(60, (t1 - t0) / z.speed);
    const hz = (f) => (f >= 1000 ? `${R.num(f / 1000, 1)} kHz` : `${R.num(f)} Hz`);
    read.innerHTML = secs < 0.5 ? "Nothing on the drum here yet." :
      `<b>${R.num(secs)} s</b> of sound for ${R.fmtDuration(Math.min(t1 - t0, secs * z.speed)).replace(/ 00 min$/, "")} of record, ${R.num(z.speed)}× faster than life. A 1 s ground wave plays at ${hz(z.speed)}, a 20 s surface wave at ${hz(z.speed / 20)}.`;
  }

  function listen() {
    if (st.audio) { stopAudio(); return; }
    const z = ZOOMS[st.zoom];
    if (!z.speed) return;
    const [t0, t1] = windowT();
    if ((t1 - t0) / z.speed < 0.5) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const read = $("helicorder-listen-read");
    if (!AC) { read.textContent = "This browser cannot play sound."; return; }
    if (!st.actx) st.actx = new AC();
    const actx = st.actx;
    if (actx.state === "suspended") actx.resume();
    const tc = performance.now();
    const n = W.helicorder_audio(t0, t1, z.speed, RATE);
    const ms = performance.now() - tc;
    const ptr = W.helicorder_audio_ptr();
    const buf = actx.createBuffer(2, n, RATE);
    const mem = W.memory.buffer;
    for (let c = 0; c < 2; c++) buf.getChannelData(c).set(new Float32Array(mem, ptr + c * n * 4, n));
    const peak = W.helicorder_audio_level(0), rms = W.helicorder_audio_level(1);
    W.helicorder_audio_free();
    const src = actx.createBufferSource();
    src.buffer = buf;
    const gain = actx.createGain();
    gain.gain.value = st.vol * st.vol;
    src.connect(gain).connect(actx.destination);
    const start = actx.currentTime + 0.06;
    src.start(start);
    st.audio = { src, gain, t0, speed: z.speed, start };
    src.onended = () => { if (st.audio && st.audio.src === src) endAudio(); };
    view.debug = { frames: n, seconds: n / RATE, peak, rms, ms, speed: z.speed, t0, t1 };
    syncListen();
    read.innerHTML = `Playing ${R.num(n / RATE)} s, synthesised in ${R.num(ms)} ms. Sound pans left for quakes to the west, right for the east.`;
  }
  function stopAudio() {
    const a = st.audio;
    if (!a) return;
    const now = st.actx.currentTime;
    a.gain.gain.cancelScheduledValues(now);
    a.gain.gain.setValueAtTime(a.gain.gain.value, now);
    a.gain.gain.linearRampToValueAtTime(0, now + 0.06);
    try { a.src.stop(now + 0.08); } catch (err) { /* already stopped */ }
    endAudio();
  }
  function endAudio() {
    st.audio = null;
    W.helicorder_playhead(-1);
    st.dirty = true;
    syncListen();
  }
})();
