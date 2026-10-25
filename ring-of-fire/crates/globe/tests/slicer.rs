//! Instrument 03 Slabs. Run with `-- --nocapture` to print the preset table.
use globe::data::world;
use globe::gfx::{hash, v3};
use globe::slicer::*;

fn band_of(p: &Profile) -> Vec<BandQuake> {
    let mut band = Vec::new();
    collect_band(world(), &Geom::new(p), p.half_width, &mut band);
    band
}

/// Expected ranges for each preset: (id, dip range °, deepest fitting quake range km).
/// The values in the page are computed live; these bounds make sure each preset still
/// shows a clean slab of the right kind if the catalogue or the fit changes.
/// (min, max).
type Range = (f32, f32);

const EXPECT: [(&str, Range, Range); 7] = [
    ("tonga", (54.0, 66.0), (600.0, 700.0)),
    ("japan", (18.0, 32.0), (250.0, 560.0)),
    ("andes", (22.0, 35.0), (240.0, 320.0)),
    ("kuril", (40.0, 56.0), (550.0, 680.0)),
    ("mariana", (72.0, 88.0), (550.0, 680.0)),
    ("hindukush", (60.0, 85.0), (200.0, 280.0)),
    ("sumatra", (32.0, 50.0), (170.0, 260.0)),
];

#[test]
fn every_preset_shows_a_clean_slab() {
    println!(
        "{:<18} {:>15} {:>15} {:>6} {:>5} {:>6} {:>5} {:>8} {:>9} {:>8} {:>7}",
        "preset", "A (lat, lon)", "B (lat, lon)", "±W km", "band", "deep", "fit", "dip °", "depth km", "scatter", "az °"
    );
    for (p, (id, dips, depths)) in PRESETS.iter().zip(EXPECT) {
        assert_eq!(p.id, id);
        let band = band_of(&p.profile);
        let g = Geom::new(&p.profile);
        let r = fit_slab(&band);
        let s = r.slab().unwrap_or_else(|| panic!("{}: no slab ({r:?})", p.name));
        println!(
            "{:<18} {:>6.1}, {:>6.1} {:>6.1}, {:>6.1} {:>6.0} {:>5} {:>6} {:>5} {:>4.1}±{:<3.1} {:>4.0}–{:<4.0} {:>7.1} {:>7.0}",
            p.name,
            p.profile.a[0],
            p.profile.a[1],
            p.profile.b[0],
            p.profile.b[1],
            p.profile.half_width,
            band.len(),
            s.n_deep,
            s.inliers,
            s.dip,
            s.dip_err,
            s.top_depth,
            s.max_depth,
            s.scatter,
            g.azimuth(0.0),
        );
        assert!(s.n_deep >= 20, "{}: only {} slab-depth quakes", p.name, s.n_deep);
        assert!(s.inliers * 4 >= s.n_deep * 3, "{}: only {} of {} fit", p.name, s.inliers, s.n_deep);
        assert!(s.scatter < 25.0, "{}: scatter {}", p.name, s.scatter);
        assert!((dips.0..=dips.1).contains(&s.dip), "{}: dip {}", p.name, s.dip);
        assert!((depths.0..=depths.1).contains(&s.max_depth), "{}: max depth {}", p.name, s.max_depth);
        assert!(s.toward_b, "{}: A should be on the ocean side", p.name);
        assert!(s.top_depth < 120.0, "{}: zone starts at {} km", p.name, s.top_depth);
        assert!(s.dip_err < 3.0, "{}: dip error {}", p.name, s.dip_err);
        // The trench (a plate boundary) lies between A and the slab.
        let mut x = Vec::new();
        crossings(&g, plate_lines(), &mut x);
        if id != "hindukush" {
            let first = x.first().copied().unwrap_or(f32::NAN);
            let (top_along, _) = s.at(0.0);
            assert!(first < top_along, "{}: plate boundary at {first} km, slab starts at {top_along} km", p.name);
        }
        // `preset_stats` agrees with the direct fit.
        let st = preset_stats(PRESETS.iter().position(|q| q.id == id).unwrap());
        assert_eq!(st[0], s.dip);
        assert_eq!(st[1], s.max_depth);
    }
    // The Mariana is the steepest preset and Japan the shallowest of the ocean slabs,
    // as the page's notes say.
    let dip = |id: &str| preset_fit(PRESETS.iter().position(|p| p.id == id).unwrap()).slab().unwrap().dip;
    for p in PRESETS {
        assert!(dip("mariana") >= dip(p.id));
        assert!(dip("japan") <= dip(p.id));
    }
}

#[test]
fn andes_has_an_aseismic_gap() {
    let k = PRESETS.iter().position(|p| p.id == "andes").unwrap();
    let st = preset_stats(k);
    println!("Central Andes: largest gap between slab-depth quakes {:.0}–{:.0} km", st[7], st[8]);
    assert!(st[7] > 250.0 && st[7] < 320.0);
    assert!(st[8] > 450.0 && st[8] - st[7] > 150.0);
}

#[test]
fn the_flat_slab_under_argentina_is_flat() {
    // The prose links to this profile.
    let p = Profile { a: [-31.0, -73.6], b: [-31.0, -62.4], half_width: 100.0 };
    let s = fit_slab(&band_of(&p)).slab().cloned().expect("flat slab");
    println!("Pampean flat slab: dip {:.1}°, {:.0}–{:.0} km, {} of {}", s.dip, s.top_depth, s.max_depth, s.inliers, s.n_deep);
    assert!(s.dip < 15.0);
    let (a0, _) = s.at(0.0);
    let (a1, _) = s.at(1.0);
    assert!(a1 - a0 > 300.0, "flat for {} km", a1 - a0);
}

#[test]
fn no_slab_under_a_spreading_ridge() {
    // Across the Mid-Atlantic Ridge near 12°N.
    let p = Profile { a: [12.0, -48.0], b: [12.0, -28.0], half_width: 300.0 };
    let band = band_of(&p);
    match fit_slab(&band) {
        SlabResult::None { n, n_deep, why } => {
            println!("Mid-Atlantic: {n} quakes, {n_deep} below 70 km");
            assert!(n > 20);
            assert_eq!(n_deep, 0);
            assert_eq!(why, NoSlab::TooFewDeep);
        }
        SlabResult::Fit(s) => panic!("found a slab under a ridge: {s:?}"),
    }
}

#[test]
fn fit_recovers_a_synthetic_slab() {
    for (k, alpha) in [20.0f32, 45.0, 70.0, 88.0].into_iter().enumerate() {
        // A straight zone in the true section plane, from the surface at 300 km along,
        // with 8 km noise and 30 % scattered outliers.
        let (ca, sa) = (alpha.to_radians().cos(), alpha.to_radians().sin());
        let theta0 = 300.0 / R_EARTH;
        let mut band = Vec::new();
        let mut n = 0u32;
        let mut rnd = || {
            n += 1;
            hash(n.wrapping_mul(0x9e37_79b9) ^ (k as u32 * 77))
        };
        let mut push = |x: f32, z: f32| {
            let along = (theta0 + x.atan2(R_EARTH - z)) * R_EARTH;
            let depth = R_EARTH - (x * x + (R_EARTH - z).powi(2)).sqrt();
            band.push(BandQuake { i: 0, t: 0, along, across: 0.0, depth, mag: 5.0 });
        };
        // The fit only sees quakes at slab depth: track that part of the true line.
        let (mut first, mut last, mut on_line) = (None, [0.0f32; 2], 0);
        for j in 0..300 {
            let s = 80.0 + 520.0 * j as f32 / 299.0;
            let e = (rnd() - 0.5) * 16.0;
            let (x, z) = (s * ca, s * sa);
            let depth = R_EARTH - (x * x + (R_EARTH - z).powi(2)).sqrt();
            if depth >= SLAB_MIN_DEPTH + 10.0 {
                first.get_or_insert([x, z]);
                last = [x, z];
                on_line += 1;
            }
            push(x - e * sa, z + e * ca);
        }
        let first = first.unwrap();
        let (xm, zm) = ((first[0] + last[0]) / 2.0, (first[1] + last[1]) / 2.0);
        for _ in 0..130 {
            let (x, z) = (rnd() * 900.0 - 100.0, 70.0 + rnd() * 600.0);
            push(x, z);
        }
        let s = fit_slab(&band).slab().cloned().expect("synthetic slab");
        // A straight line's dip against the local horizontal falls by the angle it has
        // travelled round the Earth; the fit quotes it at the middle of the deep zone.
        let expect = alpha - xm.atan2(R_EARTH - zm).to_degrees();
        println!("synthetic {alpha}°: fitted {:.2}° (expect {expect:.2}°), {} inliers of {}", s.dip, s.inliers, s.n_deep);
        assert!((s.dip - expect).abs() < 1.5, "dip {} vs {expect}", s.dip);
        assert!(s.inliers * 10 >= on_line * 9, "{} inliers, {on_line} on the line", s.inliers);
        assert_eq!(s.model, Model::Line);
    }
}

#[test]
fn geometry_round_trips() {
    for k in 0..200u32 {
        let r = |j: u32| hash(k * 7 + j);
        let p = Profile { a: [r(0) * 170.0 - 85.0, r(1) * 360.0 - 180.0], b: [r(2) * 170.0 - 85.0, r(3) * 360.0 - 180.0], half_width: 100.0 };
        let g = Geom::new(&p);
        if g.length < 10.0 {
            continue;
        }
        let (along, across) = (r(4) * g.length, r(5) * 400.0 - 200.0);
        let (a2, c2) = g.locate(g.point(along, across));
        assert!((a2 - along).abs() < 1.0 && (c2 - across).abs() < 1.0, "{along},{across} -> {a2},{c2}");
        let (b_along, b_across) = g.locate(v3::from_latlon(p.b[0], p.b[1]));
        assert!((b_along - g.length).abs() < 1.0 && b_across.abs() < 1.0);
        // Sliding sideways keeps the length and moves the middle by the given amount.
        let moved = shift(&p, 150.0);
        let gm = Geom::new(&moved);
        assert!((gm.length - g.length).abs() < 1.0, "{} vs {}", gm.length, g.length);
        let (_, off) = g.locate(gm.point(gm.length / 2.0, 0.0));
        assert!((off - 150.0).abs() < 2.0, "shifted {off}");
        let carried = carry(&p, p.a, [p.a[0] * 0.5, p.a[1] * 0.5]);
        assert!((Geom::new(&carried).length - g.length).abs() < 1.0);
    }
    let east = Geom::new(&Profile { a: [0.0, 0.0], b: [0.0, 1.0], half_width: 50.0 });
    assert!((east.length - 111.19).abs() < 0.1);
    assert!((east.azimuth(0.0) - 90.0).abs() < 0.01);
    let north = Geom::new(&Profile { a: [10.0, 20.0], b: [30.0, 20.0], half_width: 50.0 });
    assert!(north.azimuth(500.0).abs() < 0.01 || (north.azimuth(500.0) - 360.0).abs() < 0.01);
    // Left of A→B is positive across.
    let (_, c) = east.locate(v3::from_latlon(0.5, 0.5));
    assert!(c > 50.0);
}

#[test]
fn band_respects_width_and_ends() {
    let p = PRESETS[0].profile;
    let g = Geom::new(&p);
    let band = band_of(&p);
    let u = units();
    for q in &band {
        assert!(q.across.abs() <= p.half_width + 0.01);
        assert!((0.0..=g.length).contains(&q.along));
        let (a, c) = g.locate(u[q.i as usize]);
        assert!((a - q.along).abs() < 0.01 && (c - q.across).abs() < 0.01);
    }
    // Brute force agrees.
    let brute = u.iter().filter(|p| {
        let (a, c) = g.locate(**p);
        c.abs() <= p_hw() && (0.0..=g.length).contains(&a)
    });
    fn p_hw() -> f32 {
        PRESETS[0].profile.half_width
    }
    assert_eq!(brute.count(), band.len());
    // Time order, so the cursor can take a prefix.
    assert!(band.windows(2).all(|w| w[0].t <= w[1].t));
}

#[test]
fn slice_through_a_deep_tonga_quake_crosses_the_trend() {
    let w = world();
    let tonga = PRESETS[0].profile;
    let band = band_of(&tonga);
    let preset_dip = fit_slab(&band).slab().unwrap().dip;
    let preset_az = Geom::new(&tonga).azimuth(0.0);
    // The largest quake deeper than 300 km in the preset band.
    let i = band.iter().filter(|q| q.depth > 300.0).max_by(|a, b| a.mag.total_cmp(&b.mag)).unwrap().i as usize;
    let auto = auto_profile(w, i, 300.0, 100.0);
    let g = Geom::new(&auto.profile);
    let az = g.azimuth(0.0);
    let s = fit_slab(&band_of(&auto.profile)).slab().cloned().expect("slab through the selected quake");
    let daz = ((az - preset_az + 540.0) % 360.0 - 180.0).abs();
    println!(
        "through M{} at {} km: strike {:.0}°, elongation {:.2}, cut az {az:.0}° (preset {preset_az:.0}°), dip {:.1}° (preset {preset_dip:.1}°)",
        w.quakes[i].mag, w.quakes[i].depth, auto.strike, auto.elongation, s.dip
    );
    assert!(daz < 30.0, "azimuth off by {daz}");
    assert!((s.dip - preset_dip).abs() < 10.0);
    assert!(s.toward_b);
    // Centred on the quake.
    let (along, across) = g.locate(units()[i]);
    assert!((along - g.length / 2.0).abs() < 1.0 && across.abs() < 1.0);
}

#[test]
fn slice_through_works_everywhere() {
    let w = world();
    for k in 0..60u32 {
        let i = (hash(k * 31 + 5) * w.quakes.len() as f32) as usize % w.quakes.len();
        let a = auto_profile(w, i, 300.0, 100.0);
        let g = Geom::new(&a.profile);
        assert!(g.length > 800.0 && g.length < 2000.0, "length {}", g.length);
        assert!(a.profile.a.iter().chain(&a.profile.b).all(|v| v.is_finite()));
        let _ = fit_slab(&band_of(&a.profile));
    }
}

#[test]
fn renders_any_profile_without_panicking() {
    let mut s = Slicer::new();
    let profiles = [
        PRESETS[0].profile,
        Profile { a: [10.0, 20.0], b: [10.0, 20.0], half_width: 100.0 },
        Profile { a: [10.0, 20.0], b: [-10.0, -160.0], half_width: 100.0 },
        Profile { a: [0.0, 0.0], b: [0.0, 170.0], half_width: 300.0 },
        Profile { a: [89.9, 0.0], b: [80.0, 180.0], half_width: 50.0 },
        Profile { a: [-30.0, 179.9], b: [-30.0, -179.9], half_width: 10.0 },
    ];
    for (w, h, ui) in [(16, 16, 1.0), (1, 1, 1.0), (390, 410, 2.0), (957, 780, 1.0), (240, 900, 1.5)] {
        s.resize(w, h, ui);
        for p in profiles {
            for depth in [DEPTH_UPPER, DEPTH_CORE] {
                s.set_depth(depth);
                s.set_profile(p);
                for sel in [None, Some(s.band.first().map_or(0, |q| q.i as usize))] {
                    s.set_marks(sel, sel);
                    s.render();
                }
                assert!(s.geom.length >= Slicer::MIN_LENGTH - 0.5);
                assert_eq!(s.cv.frame.px.len(), s.cv.w() * s.cv.h());
                let _ = s.pick(w as f32 / 2.0, h as f32 / 2.0, 20.0);
            }
        }
    }
    s.set_cursor(0.0);
    s.render();
    assert_eq!(s.visible, 0);
    assert_eq!(s.stats[stat::FIT], 0.0);
}

#[test]
fn pick_and_labels_land_on_the_drawn_section() {
    let mut s = Slicer::new();
    s.resize(900, 700, 1.0);
    s.set_profile(PRESETS[0].profile);
    s.render();
    let (w, h) = (s.cv.w() as f32, s.cv.h() as f32);
    // The deepest quake in the band: picking at its position finds it (or a quake
    // drawn right on top of it).
    let j = (0..s.visible).max_by(|&a, &b| s.band[a].depth.total_cmp(&s.band[b].depth)).unwrap();
    let [x, y, _] = s.screen[j];
    let i = s.pick(x, y, 4.0).expect("a quake under the cursor");
    let k = s.band.iter().position(|q| q.i as usize == i).unwrap();
    assert!((s.screen[k][0] - x).hypot(s.screen[k][1] - y) < 4.0);
    // Layout round-trip and label anchors inside the canvas.
    let (al, d) = s.lay.inverse(x, y);
    assert!((al - s.band[j].along).abs() < 0.5 && (d - s.band[j].depth).abs() < 0.5);
    for k in [stat::DIP_LABEL_X, stat::END_LABEL_X] {
        assert!(s.stats[k] > 0.0 && s.stats[k] < w);
    }
    for k in [stat::DIP_LABEL_Y, stat::END_LABEL_Y] {
        assert!(s.stats[k] > 0.0 && s.stats[k] < h);
    }
    // The section sits inside the canvas: both surface ends and the bottom corners.
    for (a, dd) in [(0.0, 0.0), (s.geom.length, 0.0), (0.0, DEPTH_UPPER), (s.geom.length, DEPTH_UPPER)] {
        let p = s.lay.xy(a, dd);
        assert!(p[0] > 0.0 && p[0] < w && p[1] > 0.0 && p[1] < h, "{a},{dd} -> {p:?}");
    }
    // Something glows: the light layer turned some pixels brighter than the background.
    assert!(s.cv.frame.px.iter().zip(&s.cv.frame.bg).filter(|(p, b)| p != b).count() > 1000);
}

#[test]
fn cursor_limits_what_is_drawn_and_fitted() {
    let mut s = Slicer::new();
    s.resize(400, 300, 1.0);
    s.set_profile(PRESETS[0].profile);
    let all = s.visible;
    assert_eq!(all, s.band.len());
    let mid = s.band[all / 2].t as f32;
    s.set_cursor(mid);
    assert!(s.visible > 0 && s.visible < all);
    assert!(s.band[..s.visible].iter().all(|q| q.t as f32 <= mid));
    assert_eq!(s.stats[stat::VISIBLE] as usize, s.visible);
    s.render();
    assert_eq!(s.screen.len(), s.visible);
}
