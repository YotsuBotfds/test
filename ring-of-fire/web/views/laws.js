/* ===== 06 Laws ============================================================= */
(() => {
  const R = ROF, DAY = R.DAY;
  const $ = (id) => document.getElementById(id);
  const GR = 0, OM = 1, EN = 2;
  // Share of magnitude types, counted from the USGS magType field of this catalogue's
  // source CSVs (23,320 events): mb below M5, Mww from M5.5 up.
  const MB_BELOW5 = 92, MWW_RANGE = "86–97";
  let W;
  const charts = [];
  const st = { subset: 0, bAll: 1, main: -1, def: -1, byRank: null, rank: -1 };

  // ----- formatting -----
  const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
  const pct = (x) => {
    const p = x * 100;
    if (p >= 9.95) return p.toFixed(1);
    if (p >= 0.995) return p.toFixed(1);
    if (p >= 0.0995) return p.toFixed(2);
    return p.toPrecision(2);
  };
  const sci = (v) => {
    const e = Math.floor(Math.log10(v)), m = v / 10 ** e;
    return `${m.toFixed(1)} × 10<sup>${e}</sup>`;
  };
  const every = (days) => days < 1 ? `${R.num(days * 24, days < 0.4 ? 1 : 0)} hours` : days < 9.95 ? `${f1(days)} days` : days < 400 ? `${R.num(days, 0)} days` : `${f1(days / 365.25)} years`;
  const span = (d) => {
    const m = d * 1440;
    if (m < 60) return `${Math.round(m)} min`;
    if (d < 1) return `${(m / 60).toFixed(m < 600 ? 1 : 0)} h`;
    return `${d < 10 ? f1(d) : Math.round(d)} day${d >= 0.95 && d < 1.05 ? "" : "s"}`;
  };
  const rate = (r) => r >= 9.95 ? R.num(r, 0) : r >= 0.995 ? f1(r) : r.toPrecision(2);
  const sig = (v) => (v >= 100 ? R.num(v, 0) : v >= 0.01 ? String(+v.toPrecision(3)) : v.toPrecision(2));
  const pval = (p) => p < 0.001 ? "< 0.001" : `= ${p.toFixed(p < 0.01 ? 3 : 2)}`;
  const quakeName = (i) => `M${f1(R.q(i).mag)} ${R.esc(R.shortPlace(R.place(i)))}`;

  // ----- charts -----
  function chart(ch, prefix, perfName, maxPx) {
    const c = {
      ch, perfName, maxPx, k: 1, dirty: true, info: null, hover: -1,
      canvas: $(`laws-${prefix}-canvas`), plot: $(`laws-${prefix}-plot`), marks: $(`laws-${prefix}-marks`),
      read: $(`laws-${prefix}-read`), tip: $(`laws-${prefix}-tip`),
    };
    c.ctx = c.canvas.getContext("2d");
    charts[ch] = c;
    return c;
  }
  function readInfo(ch) {
    const p = W.laws_info(ch), n = W.laws_info_len();
    return JSON.parse(new TextDecoder().decode(new Uint8Array(W.memory.buffer, p, n)));
  }
  function resize(c) {
    const f = R.fit(c.canvas, c.maxPx);
    if (!f.changed && c.info) return;
    W.laws_resize(c.ch, f.pw, f.ph, f.k);
    c.k = f.k;
    c.relayout = true;
    refresh(c);
  }
  function refresh(c) {
    c.info = readInfo(c.ch);
    LAYOUT[c.ch](c);
    c.dirty = true;
  }
  function draw(c) {
    c.dirty = false;
    const t0 = performance.now();
    W.laws_render(c.ch);
    const ms = performance.now() - t0;
    R.blit(c.ctx, W.laws_pixels(c.ch), c.canvas.width, c.canvas.height);
    if (c.relayout) {
      // The first frame after a resize also paints the one-off layout (kept here for
      // inspection); like the surface view, the budget table gets the next frame.
      c.relayout = false;
      c.canvas.dataset.layoutMs = ms.toFixed(1);
      c.dirty = true;
    } else {
      R.perf(c.perfName, ms, c.canvas.width, c.canvas.height);
    }
  }
  function mark(host, cls, x, y, html) {
    const s = document.createElement("span");
    s.className = `mark ${cls}`;
    s.style.left = `${x.toFixed(1)}px`;
    s.style.top = `${y.toFixed(1)}px`;
    s.innerHTML = html;
    host.appendChild(s);
    return s;
  }
  const css = (c, v) => v / c.k;

  // ----- A: Gutenberg–Richter -----
  function layoutGR(c) {
    const I = c.info, m = c.marks;
    m.textContent = "";
    const [mx0, my0, mx1] = I.main.map((v) => css(c, v)), [sx0, sy0, , sy1] = I.strip.map((v) => css(c, v));
    I.x.forEach(([px, lab], k) => mark(m, k === I.x.length - 1 && css(c, px) > mx1 - 14 ? "xt end" : "xt", css(c, px), sy1 + 7, `M${lab}`));
    for (const [py, lab] of I.y) mark(m, "yt", mx0 - 7, css(c, py), lab);
    for (const [py, lab] of I.yb) mark(m, "yt", sx0 - 7, css(c, py), lab);
    mark(m, "ttl", mx0, my0 - 18, "number of quakes, log scale");
    mark(m, "ttl", sx0, sy0 - 19, "b-value if Mc were here, ±1σ");
    mark(m, "lab em", css(c, I.mcx) + 5, my0 + 3, `Mc ${f1(I.mc)}`);
    if (I.fitlab) {
      const [fx, fy, mode] = I.fitlab;
      if (mode === 0) mark(m, "lab up", css(c, fx) + 8, css(c, fy) - 6, `<b>b = ${f2(I.b)}</b>`);
      else mark(m, "lab r", css(c, fx) - 8, css(c, fy) + 8, `<b>b = ${f2(I.b)}</b>`);
    }
    if (I.b1y != null) mark(m, "lab r up", mx1 - 4, css(c, I.b1y) - 2, "b = 1");
    st.selMark = null;
    layoutSelGR();
    textGR(I);
    readGR(c, -1);
  }
  function layoutSelGR() {
    const c = charts[GR], I = c.info;
    if (st.selMark) st.selMark.remove();
    st.selMark = null;
    const i = R.state.selected;
    if (i < 0 || !I) return;
    const mg = Math.round(R.q(i).mag * 10) / 10;
    const x = css(c, I.xpx[0] + I.xpx[1] * mg);
    const right = x > css(c, I.main[2]) - 120;
    const [cls, lx] = right ? ["lab r", x - 6] : ["lab", x + 6];
    const [top, bottom] = [css(c, I.main[1]) + 18, css(c, I.main[3]) - 16];
    st.selMark = mark(c.marks, cls, lx, bottom, `selected M${f1(mg)}`);
    place(st.selMark, [[lx, bottom], [lx, top], [lx, (top + bottom) / 2]]);
  }
  // Moves a label to the first candidate position where it overlaps no other label.
  function place(el, spots) {
    const others = [...el.parentElement.querySelectorAll(".lab, .ttl")].filter((o) => o !== el).map((o) => o.getBoundingClientRect());
    const host = el.parentElement.getBoundingClientRect();
    for (const [x, y] of spots) {
      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;
      const b = el.getBoundingClientRect();
      const inside = b.left >= host.left && b.right <= host.right && b.top >= host.top && b.bottom <= host.bottom;
      if (inside && others.every((o) => b.right + 4 < o.left || b.left > o.right + 4 || b.bottom + 2 < o.top || b.top > o.bottom + 2)) return true;
    }
    const [x, y] = spots[0];
    el.style.left = `${x.toFixed(1)}px`;
    el.style.top = `${y.toFixed(1)}px`;
    return false;
  }
  function binsGR(I, k) { return I.bins.find((b) => b[0] === k); }
  function readGR(c, id) {
    const I = c.info, days = R.tEnd / DAY;
    if (id >= 1000) {
      const cv = I.curve.find((v) => v[0] === id - 1000);
      if (cv) {
        c.read.innerHTML = `Cut at <b>M${f1(cv[0] / 10)}</b>: b = <b>${f2(cv[1])} ± ${f2(cv[2])}</b> from ${R.num(cv[3])} quakes. <em>Click to fit from here.</em>`;
        return;
      }
    }
    const b = id >= 0 ? binsGR(I, id) : null;
    if (b) {
      const [k, n, N, fit] = b;
      c.read.innerHTML = `<b>M${f1(k / 10)} or more</b>: ${R.num(N)} quake${N === 1 ? "" : "s"}, about one every <b>${every(days / N)}</b>. ${k >= I.kc ? `Fit ${R.num(fit, fit < 10 ? 1 : 0)}.` : `Below Mc, fit not applied.`} <em>${R.num(n)} in the M${f1(k / 10)} step.</em>`;
      return;
    }
    const i = R.state.selected;
    if (i >= 0) {
      const mg = Math.round(R.q(i).mag * 10);
      const sb = binsGR(I, mg) || I.bins.filter((x) => x[0] <= mg).pop();
      if (sb) {
        c.read.innerHTML = `Selected <b>${quakeName(i)}</b>: ${R.num(sb[2])} quake${sb[2] === 1 ? "" : "s"} were at least M${f1(mg / 10)}, about one every <b>${every(days / sb[2])}</b>.`;
        return;
      }
    }
    c.read.innerHTML = `Fit: log<sub>10</sub> N(≥M) = ${f2(I.a)} − ${f2(I.b)} M, from M${f1(I.mc)}. <em>Hover or tap to read a magnitude; click the lower strip to move Mc.</em>`;
  }
  function textGR(I) {
    const days = R.tEnd / DAY, ratio = 10 ** I.b;
    const who = ["the whole catalogue", "quakes shallower than 70 km", "quakes between 70 and 300 km deep", "quakes 300 km deep or more"][st.subset];
    $("laws-gr-ratio").textContent = ratio >= 9.5 ? Math.round(ratio) : f1(ratio);
    $("laws-gr-b").innerHTML = `${f2(I.b)}<small>±${f2(I.sb)}</small>`;
    $("laws-gr-mc").textContent = f1(I.mc);
    $("laws-gr-n").textContent = R.num(I.nfit);
    const n7 = binsGR(I, 70)?.[2] ?? I.bins.filter((b) => b[0] >= 70)[0]?.[2], n6 = binsGR(I, 60)?.[2];
    const rec = [n7 ? `M7 or more about once every ${every(days / n7)}` : "", n6 ? `M6 or more once every ${every(days / n6)}` : ""].filter(Boolean).join(", ");
    $("laws-gr-p1").innerHTML = `Count the quakes at least as large as each magnitude, put the counts on a log scale, and they fall on a straight line. Its slope is the <em>b</em>-value. For ${who}, <em>b</em> = ${f2(I.b)} ± ${f2(I.sb)}, so each whole magnitude is ${ratio >= 9.5 ? Math.round(ratio) : f1(ratio)} times rarer than the one below it.${rec ? ` Over these three years that meant ${rec}.` : ""}`;
    const floor = Math.abs(I.maxc - 4.5) < 0.01;
    const gft = I.gft_mc != null
      ? `The fitted line explains ${f1(I.gft_r)}% of the cumulative counts from M${f1(I.gft_mc)} up (goodness of fit)`
      : `The fitted line never explains 90% of the cumulative counts (best ${f1(I.gft_best_r)}% from M${f1(I.gft_best_mc)})`;
    const mbs = I.mbs != null ? `, and the b-value steadies from M${f1(I.mbs)}` : `, and the b-value never steadies within its error`;
    const manual = I.auto ? "" : ` You moved Mc by hand; the automatic choice is M${f1(I.chosen)}.`;
    $("laws-gr-p2").innerHTML = `Below the completeness magnitude Mc the network starts to miss quakes, so the fit starts there. ${floor ? `This catalogue stops at M4.5 by design, so maximum curvature only finds that floor` : `Maximum curvature puts the peak of the histogram at M${f1(I.maxc)}`}, plus the customary 0.2. ${gft}${mbs}. The fit takes the most cautious of the three, <em>Mc = ${f1(I.chosen)}</em>.${manual}`;
    const c0 = I.curve[0], c6 = I.curve.find((v) => v[0] === 60) || I.curve[I.curve.length - 1];
    const b55 = I.b55 && I.b55[2] >= 50 ? ` Fitted from M5.5 up (${R.num(I.b55[2])} quakes), b = ${f2(I.b55[0])} ± ${f2(I.b55[1])}, ${Math.abs(I.b55[0] - 1) <= 2 * I.b55[1] ? "consistent with" : "compared with"} the usual global value of 1.` : "";
    // How far the drift is beyond the two estimates' combined standard error.
    const z = c0 && c6 ? Math.abs(c0[1] - c6[1]) / Math.hypot(c0[2], c6[2]) : 0;
    const drift = z > 3 ? `${f1(z)} standard errors apart, so the change is real` : z > 2 ? `${f1(z)} standard errors apart, a marginal change` : `within ${f1(z)} standard errors, so the data cannot tell them apart`;
    $("laws-gr-p3").innerHTML = c0 && c6 ? `The lower strip shows the <em>b</em>-value each cutoff would give. It moves from ${f2(c0[1])} at M${f1(c0[0] / 10)} to ${f2(c6[1])} at M${f1(c6[0] / 10)}, ${drift}. In the whole catalogue ${MB_BELOW5}% of magnitudes below M5 are body-wave mb, which saturate for big quakes, while ${MWW_RANGE}% from M5.5 up are moment magnitudes Mww.${b55}` : "";
    const slider = $("laws-mc");
    slider.min = I.curve[0]?.[0] ?? 45;
    slider.max = I.curve[I.curve.length - 1]?.[0] ?? 65;
    slider.value = I.kc;
    $("laws-mc-out").textContent = `M${f1(I.mc)} · ${I.auto ? "auto" : "by hand"}`;
    $("laws-mc-auto").disabled = I.auto;
    $("laws-gr-kdot").style.background = ["var(--ink)", "var(--d0)", "var(--d300)", "var(--d700)"][st.subset];
    if (st.subset === 0 && I.auto) st.bAll = I.b;
  }
  function setGR(subset, mc10) {
    st.subset = subset;
    W.laws_gr_set(subset, mc10);
    document.querySelectorAll("#laws-gr-seg button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.subset === subset)));
    refresh(charts[GR]);
  }

  // ----- B: Omori–Utsu -----
  function layoutOM(c) {
    const I = c.info, m = c.marks;
    m.textContent = "";
    const [mx0, my0, mx1, my1] = I.main.map((v) => css(c, v)), [sx0, sy0, , sy1] = I.strip.map((v) => css(c, v));
    I.x.forEach(([px, lab], k) => mark(m, k === I.x.length - 1 && css(c, px) > mx1 - 24 ? "xt end" : "xt", css(c, px), sy1 + 7, lab));
    for (const [py, lab] of I.y) mark(m, "yt", mx0 - 7, css(c, py), lab);
    for (const [py, lab] of I.ym) mark(m, "yt", sx0 - 7, css(c, py), `M${lab}`);
    mark(m, "ttl", mx0, my0 - 18, "aftershocks per day, log scale");
    mark(m, "ttl", sx0, sy0 - 19, "magnitude of each quake in the zone");
    const fit = I.fit;
    if (fit && I.c_at) mark(m, "lab", css(c, I.c_at[0]) + 5, my1 - 15, `c = ${span(fit.c)}`);
    // Secondary sequences: one label per cluster of nearby lines.
    let last = -1e9, el = null;
    for (const [, mg, t, px] of I.sec) {
      const x = css(c, px);
      if (el && x - last < 70) el.innerHTML += `, M${f1(mg)}`;
      else el = mark(m, "lab r", x - 5, my0 + 3, `day ${Math.round(t)}: M${f1(mg)}`);
      last = x;
    }
    if (I.mu_at) {
      const y = css(c, I.mu_at[1]);
      const bg = mark(m, "lab up", mx0 + 5, y - 2, `background rate, ${rate(I.mu)}/day`);
      const w = bg.offsetWidth, h = bg.offsetHeight;
      place(bg, [[mx0 + 5, y - 2], [mx0 + 5, y + 3 + h], [mx1 - 5 - w, y - 2], [(mx0 + mx1) / 2 - w / 2, y - 2]]);
    }
    mark(m, "lab up", sx0 + 5, css(c, I.m0_at[1]) - 2, `mainshock M${f1(I.m0)}`);
    if (I.bath_at) mark(m, "lab", sx0 + 5, css(c, I.bath_at[1]) + 2, `Båth's law expects M${f1(I.m0 - 1.2)}`);
    if (I.largest && I.largest_at) {
      const [lx, ly] = [css(c, I.largest_at[0]), css(c, I.largest_at[1])];
      const lg = mark(m, "lab up", lx, ly, `largest M${f1(I.largest[1])}`);
      const w = lg.offsetWidth, h = lg.offsetHeight;
      place(lg, [[lx - 9 - w, ly - 4], [lx + 9, ly - 4], [lx - 9 - w, ly + 4 + h], [lx + 9, ly + 4 + h]]);
    }
    const empty = $("laws-om-empty");
    if (!fit) {
      empty.hidden = false;
      empty.innerHTML = `Not enough aftershocks to fit: <b>${I.n}</b> of M${f1(I.mc)} or more in ${span(I.window)} within ${Math.round(I.radius)} km. A stable fit needs at least ${I.min_fit}.`;
    } else empty.hidden = true;
    textOM(I);
    readOM(c, -1);
    syncChips();
  }
  function readOM(c, id, aux) {
    const I = c.info;
    if (id >= 1000 && aux >= 0) {
      const q = R.q(aux), t = (q.t - R.q(I.q0).t) / DAY;
      c.read.innerHTML = `<b>M${f1(q.mag)}</b> ${span(t)} after the mainshock, ${Math.round(q.depth)} km deep. <em>${R.esc(R.place(aux))}. Click to select.</em>`;
      return;
    }
    const b = id >= 0 ? I.bins[id] : null;
    if (b) {
      const [t0, t1, n, r, , , model] = b;
      c.read.innerHTML = `<b>${span(t0)} to ${span(t1)}</b> after: ${n} aftershock${n === 1 ? "" : "s"}, <b>${rate(r)} a day</b>${model != null ? `. The model expects ${rate(model)} a day.` : "."}`;
      return;
    }
    const f = I.fit;
    c.read.innerHTML = f
      ? `Fit: n(t) = ${sig(f.k)} / (${sig(f.c)} + t)<sup>${f2(f.p)}</sup> per day, t in days${I.sec.length ? `, plus ${I.sec.length === 1 ? "a restart" : `${I.sec.length} restarts`}` : ""}. <em>Hover or tap to read a time bin.</em>`
      : `<em>Too few aftershocks for a fit. The points and the lower strip still show the sequence.</em>`;
  }
  function textOM(I) {
    const f = I.fit, s = I.single, main = I.q0;
    const q0 = R.q(main);
    $("laws-om-name").textContent = `M${f1(I.m0)} ${R.shortPlace(R.place(main))}, ${R.fmtDate(q0.t)}`;
    $("laws-om-ksingle").hidden = !(s && I.sec.length);
    $("laws-om-kfit").hidden = !f;
    $("laws-om-h").innerHTML = f
      ? `Ten times later, <b>${f1(10 ** f.p)}</b> times fewer aftershocks a day`
      : `Too few aftershocks above M${f1(I.mc)} to fit this sequence`;
    $("laws-om-p").innerHTML = f ? `${f2(f.p)}<small>±${f2(f.sp)}</small>` : "—";
    $("laws-om-c").innerHTML = f ? `${span(f.c)}<small>±${span(f.sc)}</small>` : "—";
    $("laws-om-n").textContent = R.num(I.n);
    $("laws-om-n-lab").textContent = `aftershocks of M${f1(I.mc)}+ within ${R.num(I.radius, 0)} km`;
    $("laws-om-bath").textContent = I.largest ? f1(I.m0 - I.largest[1]) : "—";
    const place = R.place(main), named = /^\d{4} .+ Earthquake$/.test(place);
    const where = named
      ? `the M${f1(I.m0)} ${R.esc(R.shortPlace(place))} quake of ${R.fmtDate(q0.t)}`
      : `the M${f1(I.m0)} quake ${R.esc(place)}, on ${R.fmtDate(q0.t)}`;
    const rates = f ? [[1, I.r1, "one day after the mainshock"], [10, I.r10, "after ten days"], [100, I.r100, "after a hundred days"]]
      .filter(([t]) => t <= I.window).map(([, r, w], k) => `${rate(r)}${k ? "" : " aftershocks"} a day ${w}`) : [];
    const list = rates.length > 1 ? `${rates.slice(0, -1).join(", ")} and ${rates[rates.length - 1]}` : rates[0];
    $("laws-om-p1").innerHTML = `After ${where}, ${R.num(I.n)} quakes of M${f1(I.mc)} or more struck within ${R.num(I.radius, 0)} km over the next ${span(I.window)}.` +
      (rates.length ? ` The main decay ran at about ${list}.` : "") +
      (I.largest ? ` Båth's law says the largest aftershock is typically 1.2 magnitudes below the mainshock; here it was M${f1(I.largest[1])}, ${span(I.largest[2])} later, a gap of ${f1(I.m0 - I.largest[1])}.` : "");
    const r = I.radius_check;
    let p2 = `The search radius is one rupture length for an M${f1(I.m0)} (${R.num(I.rupture, 0)} km by Wells &amp; Coppersmith 1994${I.radius > I.rupture + 1 ? `, raised to the 50 km floor` : ""}). Doubling it adds ${R.num(r[2] - r[1])} quake${r[2] - r[1] === 1 ? "" : "s"}; halving it loses ${R.num(r[1] - r[0])}.`;
    if (I.cut_by) p2 += ` The window ends after ${span(I.cut_by[2])}, when an M${f1(I.cut_by[1])} struck the same zone.`;
    else if (I.at_end) p2 += ` The catalogue ends ${span(I.window)} after this quake.`;
    if (I.parent) p2 += ` This quake itself struck ${span(-I.parent[2])} after an M${f1(I.parent[1])}, ${R.num(I.parent[3], 0)} km away, inside that quake's aftershock zone, so the counts mix both sequences.`;
    $("laws-om-p2").innerHTML = p2;
    let p3 = "";
    if (f) {
      if (I.sec.length && s) {
        const restarts = I.sec.map(([, mg, t]) => `an M${f1(mg)} on day ${Math.round(t)}`).join(" and ");
        p3 = `${restarts[0].toUpperCase()}${restarts.slice(1)} restarted the clock. Giving each its own decay, with the same c and p, improves the fit by ${R.num(s.aic - f.aic, 0)} AIC units. A single law over the same ${span(I.window)} gives p = ${f2(s.p)} and fails a residual test (KS p ${pval(s.ks_p)}); the full model ${f.ks_p >= 0.05 ? "passes" : "also fails"} it (KS p ${pval(f.ks_p)}).`;
      } else {
        p3 = `A residual test of the fitted model ${f.ks_p >= 0.05 ? "finds no significant misfit" : "finds a significant misfit"} (KS p ${pval(f.ks_p)}).`;
      }
      p3 += ` The delay c = ${span(f.c)} is the flat start of the curve: in the first hours the network misses many smaller quakes in the coda of larger ones.`;
    }
    $("laws-om-p3").innerHTML = p3;
  }
  function setSequence(i) {
    const status = W.laws_seq_set(i);
    if (status === 2) return false;
    refresh(charts[OM]);
    st.main = charts[OM].info.q0;
    syncChips();
    return true;
  }
  function buildChips() {
    const list = R.largest(7, 60).filter((i) => R.q(i).mag >= 7.4);
    $("laws-om-chips").innerHTML = list.map((i) =>
      `<button type="button" class="chip" data-q="${i}" aria-pressed="false"><b>M${f1(R.q(i).mag)}</b> ${R.esc(R.shortPlace(R.place(i)))}</button>`).join("");
    $("laws-om-chips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-q]");
      if (!b) return;
      const i = +b.dataset.q;
      R.select(i === R.state.selected ? -1 : i, "laws");
    });
  }
  function syncChips() {
    document.querySelectorAll("#laws-om-chips [data-q]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.q === st.main)));
  }

  // ----- C: energy map -----
  function layoutEN(c) {
    const I = c.info, m = c.marks;
    m.textContent = "";
    const box = (r) => [css(c, r[0]), css(c, r[1]), css(c, r[2]), css(c, r[3])];
    for (const [i, x0, y0, x1, y1, share] of I.labels) {
      const [l, t, r, b] = box([x0, y0, x1, y1]), w = r - l, h = b - t;
      const el = document.createElement("div");
      el.className = "lw-tl";
      const q = R.q(i);
      if (i === I.top1_i && w > 220 && h > 160) {
        el.classList.add("hero");
        el.innerHTML = `<b>${pct(share)}%</b><span>M${f1(q.mag)} ${R.esc(R.shortPlace(R.place(i)))} · ${R.fmtDate(q.t)} · ${Math.round(q.depth)} km deep</span>`;
      } else if (w >= 92 && h >= 40) {
        el.innerHTML = `<b>M${f1(q.mag)}</b><span>${pct(share)}%</span><span>${R.esc(R.shortPlace(R.place(i)))}</span>`;
      } else if (w >= 50 && h >= 30) {
        el.innerHTML = `<b>M${f1(q.mag)}</b><span>${pct(share)}%</span>`;
      } else continue;
      Object.assign(el.style, { left: `${l}px`, top: `${t}px`, width: `${w}px`, height: `${h}px` });
      m.appendChild(el);
    }
    for (const [ci, x0, y0, x1, y1, n, share, lo, hi] of I.dust) {
      const [l, t, r, b] = box([x0, y0, x1, y1]);
      if (r - l < 112 || b - t < 64) continue;
      const el = document.createElement("div");
      el.className = "lw-tl dust";
      el.innerHTML = `<b>${R.num(n)} quakes</b>M${f1(lo)}–${f1(hi)} · ${pct(share)}%`;
      Object.assign(el.style, { left: `${l}px`, top: `${t}px`, maxWidth: `${r - l - 10}px` });
      m.appendChild(el);
      void ci;
    }
    textEN(I);
    readEN(c, -1, -1);
  }
  function classLabel(cl) {
    const [, lo, hi] = cl;
    return Math.abs(lo - hi) < 0.01 ? `M${f1(lo)}` : `M${f1(lo)}–${f1(hi)}`;
  }
  function textEN(I) {
    const top = R.q(I.top1_i);
    // Plain fraction for the heading when the share is close to one; the exact
    // figure is on the tile and in the notes.
    const words = [[1 / 2, "half"], [2 / 3, "two thirds"], [3 / 4, "three quarters"], [1 / 3, "a third"], [9 / 10, "nine tenths"]]
      .find(([v]) => Math.abs(I.top1 - v) < 0.012);
    $("laws-en-h").innerHTML = `One quake in ${R.num(I.n)} released <b>${words ? words[1] : `${pct(I.top1)}%`}</b> of all the energy`;
    $("laws-en-top1").textContent = `${pct(I.top1)}%`;
    $("laws-en-top1-lab").textContent = `released by the M${f1(top.mag)} ${R.shortPlace(R.place(I.top1_i))} alone`;
    $("laws-en-top10").textContent = `${pct(I.top10)}%`;
    $("laws-en-small").textContent = `${pct(I.small90)}%`;
    $("laws-en-small-lab").textContent = `by the smallest 90%, ${R.num(I.small90_n)} quakes up to M${f1(I.small90_max)}`;
    $("laws-en-classes").innerHTML = I.classes.map((cl, ci) => {
      const [, , , n, share] = cl;
      return `<tr tabindex="0" data-class="${ci}"><td>${classLabel(cl)}</td><td class="num">${R.num(n)}</td><td class="num">${pct(n / I.n)}%</td><td class="num${share > 0.5 ? " hot" : ""}">${pct(share)}%</td></tr>`;
    }).join("");
    const b = st.bAll, step = 10 ** (1.5 - b);
    $("laws-en-p1").innerHTML = `Each tile is one quake. Its area is the energy it radiated and its colour is its depth. Energy grows 32-fold with each step of magnitude (log E = 1.5 M + 4.8), while quakes get only ${Math.round(10 ** b)} times rarer (b = ${f2(b)}). So each step up holds about ${f1(step)} times more energy in total, and the giants win.`;
    const low = I.classes[I.classes.length - 1];
    const beat = I.beats ? ` All ${R.num(I.beats[2])} quakes of ${classLabel(low)} together released ${pct(I.beats[3])}%, less than one M${f1(I.beats[1])}.` : "";
    $("laws-en-p2").innerHTML = `${beat} In total the catalogue released ${sci(I.total)} joules, about ${R.num(I.mt, 0)} megatons of TNT, as much as a single M${f1(I.equiv_m)}.`;
    $("laws-en-dustkey").textContent = `${R.num(I.n - I.tiles)} quakes too small to draw as tiles (under about ${Math.round(Math.sqrt(I.min_area))} px across) merge into a glowing dust, one speck each, shallow at the top of each patch.`;
  }
  function energyLine(i) {
    const I = charts[EN].info, q = R.q(i), e = 10 ** (1.5 * q.mag + 4.8);
    const n45 = 10 ** (1.5 * (q.mag - 4.5));
    return `<b>${sci(e)} J</b>, ${pct(e / I.total)}% of all the energy${q.mag >= 5 ? `, as much as ${R.num(n45, 0)} M4.5 quakes` : ""}.`;
  }
  function readEN(c, i, dust) {
    const I = c.info;
    if (i >= 0) {
      const d = dust >= 0 ? I.dust[dust] : null;
      c.read.innerHTML = `<b>${quakeName(i)}</b>, ${R.fmtDate(R.q(i).t)}: ${energyLine(i)}${d ? ` <em>In the dust with ${R.num(d[5] - 1)} others.</em>` : ""}`;
      return;
    }
    const sel = R.state.selected;
    c.read.innerHTML = sel >= 0
      ? `Selected <b>${quakeName(sel)}</b>: ${energyLine(sel)}`
      : `<em>${R.num(I.tiles)} quakes drawn as tiles, the rest as dust. Hover or tap a tile for its quake; click to select it across the page.</em>`;
  }
  function tipEN(c, i, dust, x, y) {
    const I = c.info;
    let html = R.tipHTML(i) + `<div class="lw-tip-e">${energyLine(i)}`;
    if (dust >= 0) {
      const d = I.dust[dust];
      html += `<br>One of ${R.num(d[5])} quakes of M${f1(d[7])}–${f1(d[8])} merged into dust, ${pct(d[6])}% together.`;
    }
    R.placeTip(c.tip, x, y, html + "</div>");
  }

  const LAYOUT = [layoutGR, layoutOM, layoutEN];

  // ----- interaction -----
  function local(c, e) {
    const b = c.canvas.getBoundingClientRect();
    return { x: (e.clientX - b.left) * c.canvas.width / b.width, y: (e.clientY - b.top) * c.canvas.height / b.height, cx: e.clientX - b.left, cy: e.clientY - b.top };
  }
  function hoverAt(c, x, y, cx, cy) {
    const id = W.laws_hover(c.ch, x, y), aux = W.laws_hover_aux(c.ch);
    const changed = id !== c.hover || aux !== c.aux;
    c.hover = id; c.aux = aux;
    if (changed) c.dirty = true;
    if (c.ch === GR) readGR(c, id);
    else if (c.ch === OM) {
      readOM(c, id, aux);
      if (id >= 1000 && aux >= 0) R.placeTip(c.tip, cx, cy, R.tipHTML(aux)); else c.tip.hidden = true;
    } else {
      readEN(c, id, aux);
      if (id >= 0) tipEN(c, id, aux, cx, cy); else c.tip.hidden = true;
    }
    return id;
  }
  function clearHover(c) {
    W.laws_hover(c.ch, -1, -1);
    if (c.hover !== -1) c.dirty = true;
    c.hover = -1; c.aux = -1;
    if (c.tip) c.tip.hidden = true;
    if (c.ch === GR) readGR(c, -1); else if (c.ch === OM) readOM(c, -1); else readEN(c, -1, -1);
  }
  function wire(c) {
    R.pointer(c.canvas, {
      hover(e) { const p = local(c, e); hoverAt(c, p.x, p.y, p.cx, p.cy); },
      leave() { clearHover(c); },
      tap(e) {
        const p = local(c, e);
        const id = hoverAt(c, p.x, p.y, p.cx, p.cy);
        if (c.ch === GR && id >= 1000) setGR(st.subset, id - 1000);
        else if (c.ch === OM && id >= 1000 && c.aux >= 0) R.select(c.aux, "laws");
        else if (c.ch === EN && id >= 0) R.select(id === R.state.selected ? -1 : id, "laws");
      },
    });
    c.canvas.addEventListener("blur", () => clearHover(c));
    c.canvas.addEventListener("keydown", (e) => key(c, e));
    R.sized(c.plot, () => resize(c));
  }
  // Keyboard: arrows step through bins (A, B) or quakes by energy (C).
  function key(c, e) {
    const I = c.info;
    if (e.key === "Escape") { clearHover(c); if (c.ch === EN) R.select(-1, "laws"); e.preventDefault(); return; }
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (c.ch === EN && e.key === "Enter" && c.hover >= 0) { R.select(c.hover, "laws"); e.preventDefault(); return; }
    if (!dir) return;
    e.preventDefault();
    if (c.ch === GR) {
      const ks = I.bins.map((b) => b[0]);
      let at = ks.indexOf(c.hover);
      at = at < 0 ? (dir > 0 ? 0 : ks.length - 1) : Math.max(0, Math.min(ks.length - 1, at + dir));
      const x = I.xpx[0] + I.xpx[1] * ks[at] / 10, y = (I.main[1] + I.main[3]) / 2;
      hoverAt(c, x, y, x / c.k, y / c.k);
    } else if (c.ch === OM) {
      const ids = I.bins.map((b, k) => (b[2] > 0 ? k : -1)).filter((k) => k >= 0);
      let at = ids.indexOf(c.hover);
      at = at < 0 ? (dir > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, at + dir));
      const x = I.bins[ids[at]][7], y = (I.main[1] + I.main[3]) / 2;
      hoverAt(c, x, y, x / c.k, y / c.k);
    } else {
      if (!st.byRank) st.byRank = Array.from({ length: R.n }, (_, i) => i).sort((a, b) => R.cat[b * 5 + 4] - R.cat[a * 5 + 4] || a - b);
      st.rank = Math.max(0, Math.min(R.n - 1, st.rank + dir));
      const i = st.byRank[st.rank];
      const x0 = W.laws_energy_rect(i, 0), y0 = W.laws_energy_rect(i, 1), x1 = W.laws_energy_rect(i, 2), y1 = W.laws_energy_rect(i, 3);
      if (!Number.isNaN(x0)) {
        const x = (x0 + x1) / 2, y = (y0 + y1) / 2;
        hoverAt(c, x, y, x / c.k, y / c.k);
      }
    }
  }

  function onSelect(i) {
    W.laws_select(i);
    charts[GR].dirty = charts[EN].dirty = true;
    layoutSelGR();
    if (charts[GR].hover < 0) readGR(charts[GR], -1);
    if (charts[EN].hover < 0) readEN(charts[EN], -1, -1);
    if (i >= 0 && R.q(i).mag >= 7) {
      if (i !== st.main) setSequence(i);
    } else if (i < 0 && st.main !== st.def) {
      setSequence(-1);
    }
  }

  R.view({
    id: "laws",
    init() {
      W = R.W;
      W.laws_init();
      chart(GR, "gr", "06 Laws · Gutenberg–Richter", 1.0e6);
      chart(OM, "om", "06 Laws · Omori–Utsu", 1.0e6);
      chart(EN, "en", "06 Laws · energy map", 1.3e6);
      buildChips();
      charts.forEach(wire);
      // A first (it sets the b-value C quotes), then B and C.
      resize(charts[GR]);
      resize(charts[OM]);
      resize(charts[EN]);
      st.def = st.main = charts[OM].info.default;
      syncChips();
      document.querySelectorAll("#laws-gr-seg button").forEach((b) => b.addEventListener("click", () => setGR(+b.dataset.subset, -1)));
      $("laws-mc").addEventListener("input", (e) => setGR(st.subset, +e.target.value));
      $("laws-mc-auto").addEventListener("click", () => setGR(st.subset, -1));
      const rows = $("laws-en-classes");
      const hl = (ci) => { W.laws_class_highlight(ci); charts[EN].dirty = true; };
      rows.addEventListener("pointerover", (e) => { const r = e.target.closest("[data-class]"); if (r) hl(+r.dataset.class); });
      rows.addEventListener("pointerleave", () => hl(-1));
      rows.addEventListener("focusin", (e) => { const r = e.target.closest("[data-class]"); if (r) hl(+r.dataset.class); });
      rows.addEventListener("focusout", () => hl(-1));
      R.on("select", (i) => onSelect(i));
      if (R.state.selected >= 0) onSelect(R.state.selected);
    },
    frame() {
      for (const c of charts) if (c.dirty) draw(c);
    },
  });
})();
