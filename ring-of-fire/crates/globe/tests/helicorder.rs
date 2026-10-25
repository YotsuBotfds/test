use globe::data::world;
use globe::helicorder::drum::{Grid, Row, RowMaker, ZOOMS, CLIP};
use globe::helicorder::seis::{Kind, Seis, Source};
use globe::helicorder::travel::{distance_azimuth, tables, Branch, Wave};
use globe::helicorder::{audio, Helicorder};

fn near(v: f32, want: f32, tol: f32) -> bool {
    (v - want).abs() <= tol
}

#[test]
fn travel_times_match_iasp91() {
    let tt = tables();
    // Surface-focus first arrivals from the iasp91 tables (seconds), within ~1%.
    for (d, p, s) in [(10.0, 144.0, 259.0), (30.0, 372.0, 671.0), (60.0, 608.0, 1102.0), (90.0, 781.0, 1436.0)] {
        let a = tt.first(Wave::P, d, 0.0);
        let b = tt.first(Wave::S, d, 0.0);
        assert!(near(a.t, p, p * 0.01), "P at {d}: {} vs {p}", a.t);
        assert!(near(b.t, s, s * 0.012), "S at {d}: {} vs {s}", b.t);
        assert_eq!(a.branch, Branch::Direct);
    }
    // The core's shadow: diffracted P, then PKIKP arriving 20 min 12 s at the antipode.
    assert_eq!(tt.first(Wave::P, 120.0, 0.0).branch, Branch::Diffracted);
    let pkp = tt.first(Wave::P, 180.0, 0.0);
    assert_eq!(pkp.branch, Branch::Core);
    assert!(near(pkp.t, 1212.0, 8.0), "PKIKP at 180: {}", pkp.t);
    // SKS replaces S beyond the S shadow.
    assert_eq!(tt.first(Wave::S, 120.0, 0.0).branch, Branch::Core);
    // First arrivals never arrive earlier further away, and S always trails P.
    let mut last = -1.0;
    for i in 0..=360 {
        let d = i as f32 * 0.5;
        for h in [0.0, 35.0, 300.0, 650.0] {
            let p = tt.first(Wave::P, d, h).t;
            let s = tt.first(Wave::S, d, h).t;
            assert!(p.is_finite() && s.is_finite() && s > p, "P {p} S {s} at {d} deg, {h} km");
        }
        let p = tt.first(Wave::P, d, 0.0).t;
        assert!(p >= last - 0.5, "P time decreases at {d}: {p} < {last}");
        last = p;
    }
    // A deep source: the surface reflection pP trails P by about two minutes.
    let deep = tt.first(Wave::P, 60.0, 600.0);
    assert!(deep.depth_delay > 100.0 && deep.depth_delay < 140.0, "pP-P {}", deep.depth_delay);
    assert!(deep.t < tt.first(Wave::P, 60.0, 0.0).t, "deep sources arrive sooner");
}

#[test]
fn geocentric_distance_and_back_azimuth() {
    let (d, az) = distance_azimuth(0.0, 0.0, 0.0, 90.0);
    assert!((d - 90.0).abs() < 1e-6 && (az - 90.0).abs() < 1e-6);
    let (d, _) = distance_azimuth(10.0, 20.0, -10.0, -160.0);
    assert!((d - 180.0).abs() < 1e-6);
    // Kamchatka is north-west of Albuquerque, about 65 degrees away.
    let (d, az) = distance_azimuth(34.9459, -106.4572, 52.49, 160.24);
    assert!((d - 65.0).abs() < 1.0 && (az - 318.0).abs() < 3.0, "{d} {az}");
}

#[test]
fn quakes_reach_the_station_in_order() {
    let s = Seis::new(0);
    let w = world();
    assert_eq!(s.events.len(), w.quakes.len());
    let big = w.largest(1, 0.0)[0];
    let e = s.event_of(big).unwrap();
    assert!(e.t_p < e.t_s && e.t_s < e.t_r && e.t_r < e.t_r2, "{e:?}");
    // Rayleigh waves at ~4 km/s on the short path.
    let km = e.dist as f64 * 111.19;
    assert!((km / e.t_r as f64 - 4.05).abs() < 0.05);
    // The M8.8 drives the pen to its stops for hours; it is the day's loudest signal.
    assert!(e.peak > 50.0 * CLIP && e.clip_s > 3600.0, "peak {} clip {}", e.peak, e.clip_s);
    // Deep quakes barely make surface waves: the same M7 at 10 km and at 600 km.
    let src = |depth: f32| Source { t0: 0.0, lat: 0.0, lon: 120.0, depth, mag: 7.0, q: 0 };
    let pair = Seis::from_sources(0, &[src(10.0), src(600.0)], 1);
    let pk = |e: usize, k: Kind| pair.packets_of(&pair.events[e]).iter().find(|p| p.kind == k).map_or(0.0, |p| p.amp);
    assert!(pk(1, Kind::R1) < 0.05 * pk(0, Kind::R1), "deep R1 {} vs shallow {}", pk(1, Kind::R1), pk(0, Kind::R1));
    assert!(pk(1, Kind::P) > 0.5 * pk(0, Kind::P), "deep P {} vs shallow {}", pk(1, Kind::P), pk(0, Kind::P));
    // Window queries find every event whose record overlaps.
    let mut act = Vec::new();
    s.active(e.t0 + 7200.0, e.t0 + 7300.0, &mut act);
    assert!(act.contains(&(big as u32)));
}

/// The envelope never undershoots the packet it summarises.
#[test]
fn envelope_bounds_the_wave() {
    let s = Seis::new(0);
    for p in s.packets.iter().step_by(997).take(200) {
        let len = p.len.min(4000.0);
        for k in 0..40 {
            let a = len * k as f32 / 40.0;
            let b = a + len / 40.0;
            let m = p.env_max(a, b);
            for j in 0..=20 {
                let x = a + (b - a) * j as f32 / 20.0;
                assert!(p.env(x) <= m + 1e-4, "{:?} env {} > max {} at {x}", p.kind, p.env(x), m);
                assert!(p.sample(x).abs() <= p.amp * p.env(x) * 1.6 + 1e-6);
            }
        }
    }
}

/// A drum column's reach, built from analytic envelopes, should contain the real
/// sampled seismogram over that column without exaggerating it.
#[test]
fn drum_columns_contain_the_sampled_trace() {
    let s = Seis::new(0);
    // A moderate quake that stays on the paper: loud, but not clipped.
    let e = s.events.iter().filter(|e| e.peak > 0.6 && e.peak < 1.6).nth(40).copied().unwrap();
    let z = ZOOMS[1];
    let g = Grid::new(z, world().epoch);
    let (k, _) = g.locate(e.peak_t);
    let ncol = 900;
    let mut row = Row::empty();
    RowMaker::default().compute(&s, k, g.start(k), z.span, g.end(k), ncol, &z, &mut row);
    let dt = row.dt;
    let mut act = Vec::new();
    let (mut inside, mut total, mut worst) = (0usize, 0usize, 0.0f32);
    for c in 0..row.valid {
        let t0 = row.t0 + c as f64 * dt;
        s.active(t0, t0 + dt, &mut act);
        let (mut lo, mut hi) = (f32::MAX, f32::MIN);
        for j in 0..=72 {
            let t = t0 + dt * j as f64 / 72.0;
            let a = s.noise.amp(t);
            let mut v = a * (s.noise.micro(t) + 0.3 * s.noise.primary(t));
            for &ei in &act {
                for p in s.packets_of(&s.events[ei as usize]) {
                    v += p.sample((t - p.on) as f32);
                }
            }
            lo = lo.min(v);
            hi = hi.max(v);
            total += 1;
            if v >= row.lo[c] - 0.03 && v <= row.hi[c] + 0.03 {
                inside += 1;
            }
        }
        if row.hi[c] < CLIP * 0.8 && row.lo[c] > -CLIP * 0.8 {
            worst = worst.max((row.hi[c] - row.lo[c]) / (hi - lo + 0.05));
        }
    }
    let frac = inside as f32 / total as f32;
    assert!(frac > 0.95, "only {frac} of samples inside the drawn reach");
    assert!(worst < 4.0, "drawn reach exaggerates the trace {worst}x");
}

#[test]
fn the_pen_stays_within_its_stops() {
    let s = Seis::new(0);
    let big = world().largest(1, 0.0)[0];
    let e = *s.event_of(big).unwrap();
    for (zi, z) in ZOOMS.iter().enumerate() {
        let g = Grid::new(*z, world().epoch);
        let (k0, _) = g.locate(e.t0 + e.t_p as f64);
        let mut maker = RowMaker::default();
        let mut row = Row::empty();
        let mut clipped = 0;
        for k in k0..k0 + 4 {
            maker.compute(&s, k, g.start(k), z.span, g.end(k), 500, z, &mut row);
            for c in 0..row.valid {
                assert!(row.lo[c] <= row.hi[c] && row.lo[c].is_finite(), "zoom {zi} line {k} col {c}");
                assert!(row.hi[c] <= CLIP + 1e-4 && row.lo[c] >= -CLIP - 1e-4, "zoom {zi}: {} {}", row.lo[c], row.hi[c]);
                if row.hi[c] > 0.85 * CLIP {
                    clipped += 1;
                }
            }
        }
        assert!(clipped > 0, "the M8.8 never reaches the stops at zoom {zi}");
    }
    // A quiet day stays near its line.
    let h = Helicorder::new(0);
    let z = ZOOMS[1];
    let g = Grid::new(z, world().epoch);
    let (k, _) = g.locate(h.quiet_day() as f64 * 86400.0 + 3.0 * 3600.0);
    let mut row = Row::empty();
    RowMaker::default().compute(&h.seis, k, g.start(k), z.span, g.end(k), 600, &z, &mut row);
    let reach = (0..row.valid).map(|c| row.hi[c] - row.lo[c]).fold(0.0f32, f32::max);
    assert!(reach > 0.01 && reach < 0.6, "quiet line reach {reach}");
}

#[test]
fn calendar_month_lines() {
    let g = Grid::new(ZOOMS[4], world().epoch);
    for k in -2..40 {
        let (a, b) = (g.start(k), g.end(k));
        let days = (b - a) / 86400.0;
        assert!((28.0..=31.0).contains(&days), "line {k}: {days} days");
        assert_eq!(g.locate(a + 1.0).0, k);
        assert_eq!(g.locate(b - 1.0).0, k);
    }
    // The catalogue epoch (25 Oct 2023) sits on the first line, 24 days in.
    let (k, f) = g.locate(0.0);
    assert_eq!(k, 0);
    assert!((f * 31.0 - 24.0).abs() < 1e-6);
}

#[test]
fn renders_and_picks() {
    let mut h = Helicorder::new(0);
    h.drum.resize(640, 420, 1.0);
    let big = world().largest(1, 0.0)[0];
    let e = *h.seis.event_of(big).unwrap();
    for z in 0..ZOOMS.len() {
        h.drum.set_zoom(z);
        h.drum.center = h.drum.grid.pos(e.peak_t).floor();
        while h.render(64) > 0 {}
        assert!(h.drum.frame.px.iter().any(|&p| p & 0xff > 150), "nothing bright at zoom {z}");
        let st = h.stats();
        assert!(st.catalogued > 0 && st.loudest.is_some());
    }
    // Pick the mainshock in its surface waves at the day zoom.
    h.drum.set_zoom(1);
    let (k, f) = h.drum.grid.locate(e.peak_t);
    h.drum.center = k as f64;
    h.render(64);
    let (x, y) = (h.drum.x_of(f), h.drum.y_of(k, 0.0));
    assert_eq!(h.pick(x, y), Some(big));
    // Station switches rebuild the record.
    for st in 1..5 {
        h.set_station(st);
        h.render(64);
    }
}

#[test]
fn noise_fill_matches_the_stateless_formula() {
    let s = Seis::new(1);
    let (t0, ds) = (3.0e7, 2400.0 / 22050.0);
    let mut buf = vec![0.0f32; 20_000];
    s.noise.fill(t0, ds, 1.0, 1.0, &mut buf);
    let mut worst = 0.0f32;
    for (i, &v) in buf.iter().enumerate() {
        let t = t0 + i as f64 * ds;
        let want = s.noise.micro(t) + 0.3 * s.noise.primary(t);
        worst = worst.max((v - want).abs());
    }
    // Within a 32-sample block the slow phase wander is linearised: about -30 dB.
    assert!(worst < 0.06, "rotation drifts {worst}");
}

#[test]
fn audio_is_audible_bounded_and_click_free() {
    let s = Seis::new(0);
    let big = world().largest(1, 0.0)[0];
    let t0 = s.event_of(big).unwrap().t0 - 600.0;
    let rate = 22050.0;
    let start = std::time::Instant::now();
    let c = audio::synth(&s, t0, t0 + 30.0 * 2400.0, 2400.0, rate);
    let ms = start.elapsed().as_secs_f64() * 1000.0;
    assert_eq!(c.frames, 30 * 22050);
    assert_eq!(c.data.len(), 2 * c.frames);
    assert!(c.data.iter().all(|v| v.is_finite()));
    let peak = c.data.iter().fold(0.0f32, |m, v| m.max(v.abs()));
    assert!(peak <= 1.0 && peak > 0.5, "peak {peak}");
    assert!(c.rms > 0.01, "rms {}", c.rms);
    // Fades at both ends: no click.
    let (l, r) = c.data.split_at(c.frames);
    assert!(l[0].abs() < 1e-3 && r[0].abs() < 1e-3 && l[c.frames - 1].abs() < 1e-3 && r[c.frames - 1].abs() < 1e-3);
    // No sample-to-sample jump anywhere near full scale.
    let jump = l.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0f32, f32::max);
    assert!(jump < 0.9, "jump {jump}");
    // Stereo from the back-azimuth: the channels differ.
    let diff: f32 = l.iter().zip(r).map(|(a, b)| (a - b).abs()).sum::<f32>() / c.frames as f32;
    assert!(diff > 1e-4, "mono {diff}");
    println!("30 s clip of the M8.8 at ANMO synthesised in {ms:.0} ms");
    assert!(ms < 3000.0);
    // A quiet day plays quietly but is not silent.
    let h = Helicorder::new(0);
    let q = h.quiet_day() as f64 * 86400.0;
    let c = audio::synth(&h.seis, q, q + 6.0 * 3600.0, 2400.0, rate);
    assert!(c.rms > 0.01 && c.peak < 0.5, "quiet day rms {} peak {}", c.rms, c.peak);
    // At extreme speed-ups the P waves leave the band instead of aliasing.
    let c = audio::synth(&s, t0, t0 + 20.0 * 86400.0, 86400.0, rate);
    assert!(c.peak <= 1.0 && c.data.iter().all(|v| v.is_finite()));
}
