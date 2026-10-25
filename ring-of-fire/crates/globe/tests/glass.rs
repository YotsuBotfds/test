use globe::glass::{radius_at, section_dip, stretch, unstretch, Glass, Pose, CMB_KM, LABELS, RC, REGIONS};
use globe::gfx::v3;

#[test]
fn stretch_is_true_scale_at_one_and_keeps_the_core() {
    for d in [0.0, 10.0, 100.0, 410.0, 670.0, 2000.0] {
        assert!((stretch(1.0, d) - d).abs() < 1e-3);
    }
    for k in [1.0, 2.5, 4.0, 10.0] {
        assert_eq!(stretch(k, 0.0), 0.0);
        assert!((stretch(k, CMB_KM) - CMB_KM).abs() < 0.5, "k={k}");
        // Slope k at the surface.
        assert!((stretch(k, 1.0) - k).abs() < 0.01 * k);
        // Monotonic, and the inverse undoes it.
        let mut prev = -1.0;
        for i in 0..=100 {
            let d = i as f32 * 28.9;
            let s = stretch(k, d);
            assert!(s > prev);
            prev = s;
            assert!((unstretch(k, s) - d).abs() < 0.05, "k={k} d={d}");
        }
        // The deepest quakes stay well above the core.
        assert!(radius_at(k, 700.0) > RC + 0.05);
    }
}

#[test]
fn renders_every_preset_and_setting_without_panicking() {
    let mut g = Glass::new();
    for (w, h) in [(1, 1), (7, 5), (161, 97), (240, 300)] {
        g.resize(w, h);
        for k in 0..=REGIONS.len() {
            g.preset(k, 0.0);
            for cut in [true, false] {
                g.cut_on = cut;
                for exag in [1.0, 4.0, 10.0] {
                    g.set_exag(exag);
                    g.sweep = 0.3;
                    g.render();
                    g.tick(0.5, true, true);
                    g.render();
                }
            }
        }
    }
    g.cursor = 0.0;
    g.render();
    assert_eq!(g.stats.shown, 0);
}

#[test]
fn the_core_hides_what_is_behind_it_and_the_glass_does_not() {
    let mut g = Glass::new();
    g.resize(200, 200);
    g.cut_on = false;
    g.cam.fly_to(Pose { target: [0.0; 3], axis: [0.0, 0.0, 1.0], back: [1.0, 0.0, 0.0], dist: 4.0 }, 0.0);
    let view = g.view();
    // Straight behind the core, in the mantle.
    assert_eq!(view.see([-0.8, 0.0, 0.0]), 0.0);
    // Beside the core, behind the glass: seen.
    assert_eq!(view.see([-0.8, 0.0, 0.7]), 1.0);
    // In front of the core.
    assert_eq!(view.see([0.8, 0.0, 0.0]), 1.0);
    // With the cut, a point just behind the face is frosted, one far behind is faint.
    g.cut_on = true;
    g.preset(0, 0.0);
    let view = g.view();
    let n = view.planes[0];
    let eye = view.eye;
    // A point on the face, seen from the open side, then pushed behind it.
    let on_face = v3::scale(v3::norm(v3::sub(eye, v3::scale(n, v3::dot(eye, n)))), 0.75);
    let near = view.see(v3::add(on_face, v3::scale(n, -0.01)));
    let far = view.see(v3::add(on_face, v3::scale(n, -0.3)));
    assert!(near > 0.4 && near < 1.0, "near {near}");
    assert!(far < near * 0.1, "far {far}");
}

#[test]
fn camera_flights_end_where_asked_and_stay_outside_the_planet() {
    let mut g = Glass::new();
    g.resize(300, 200);
    let to = g.preset_pose(1).0;
    g.preset(1, 2.0);
    let mut t = 0.0;
    while g.cam.flying() {
        g.tick(1.0 / 30.0, false, false);
        t += 1.0 / 30.0;
        assert!(v3::len(g.cam.pose.eye()) >= 1.05);
        assert!(t < 3.0);
    }
    assert_eq!(g.cam.pose, to);
    // Orbiting never tips over the axis.
    for _ in 0..200 {
        g.cam.orbit(0.1, 0.2);
        assert!(g.cam.pose.elevation().abs() <= 1.381);
        assert!(v3::len(g.cam.pose.eye()) >= 1.05);
    }
    for _ in 0..50 {
        g.cam.zoom(1.5);
    }
    assert!(v3::len(g.cam.pose.eye()) >= 1.05);
}

#[test]
fn slab_geometry_matches_the_known_subduction_zones() {
    let g = Glass::new();
    let tonga = &g.slabs[0];
    assert!(tonga.deep300 > 500, "Tonga holds most deep quakes: {}", tonga.deep300);
    assert!(g.world.quakes[tonga.deepest].depth > 650.0);
    // The Pacific plate sinks westward under Tonga, at roughly 45-55 degrees.
    assert!((250.0..320.0).contains(&tonga.dip_az), "dip azimuth {}", tonga.dip_az);
    assert!((35.0..65.0).contains(&tonga.dip_deg), "dip {}", tonga.dip_deg);
    // Nazca sinks eastward under the Andes, at a shallower angle.
    let andes = &g.slabs[2];
    assert!((40.0..110.0).contains(&andes.dip_az), "Andes dip azimuth {}", andes.dip_az);
    assert!(andes.dip_deg < tonga.dip_deg);
    // The Hindu Kush slab is steep and has no quakes at 300 km.
    let hk = &g.slabs[4];
    assert_eq!(hk.deep300, 0);
    assert!(hk.dip_deg > 55.0, "Hindu Kush dip {}", hk.dip_deg);
    // The live slice reports the same dip as the list at the start.
    let mut g = Glass::new();
    g.preset(1, 0.0);
    assert!((g.slice_dip(150.0) - g.slabs[0].dip_deg).abs() < 0.01);
    let s = &g.slabs[0];
    assert!(section_dip(g.world, &s.idx, s.strike, s.dip, 150.0, 0.0).is_nan());
}

#[test]
fn each_slab_preset_shows_the_dip() {
    // Looking along the trench, deep quakes near the slice sit lower on screen
    // than shallow ones, and off to the side the slab sinks towards.
    let mut g = Glass::new();
    g.resize(400, 300);
    for k in 1..=REGIONS.len() {
        g.preset(k, 0.0);
        g.render();
        let s = &g.slabs[k - 1];
        let (mut shallow, mut deep) = ([0.0f32; 3], [0.0f32; 3]);
        for &i in &s.idx {
            let q = g.world.quakes[i as usize];
            let [x, y, w] = g.screen[i as usize];
            if w < 0.3 {
                continue;
            }
            let bucket = if q.depth < 60.0 { &mut shallow } else if q.depth > 150.0 { &mut deep } else { continue };
            bucket[0] += x;
            bucket[1] += y;
            bucket[2] += 1.0;
        }
        assert!(shallow[2] > 5.0 && deep[2] > 5.0, "{}: {shallow:?} {deep:?}", s.name);
        let (sy, dy) = (shallow[1] / shallow[2], deep[1] / deep[2]);
        assert!(dy > sy + 20.0, "{}: deep quakes should hang below shallow ones ({sy} vs {dy})", s.name);
        // Steep slabs (Hindu Kush, about 70 degrees) hang nearly straight down.
        if s.dip_deg < 60.0 {
            let side = (deep[0] / deep[2] - shallow[0] / shallow[2]) * REGIONS[k - 1].look;
            assert!(side > 5.0, "{}: slab should sink to the expected side ({side})", s.name);
        }
    }
}

#[test]
fn picking_finds_a_quake_where_it_was_drawn() {
    let mut g = Glass::new();
    g.resize(500, 400);
    g.preset(1, 0.0);
    g.render();
    let i = g.slabs[0].deepest;
    let [x, y, w] = g.screen[i];
    assert!(w > 0.1, "the deepest Tonga quake should be drawn in the Tonga view");
    let p = g.pick(x, y, 4.0).expect("something under the cursor");
    let [px, py, _] = g.screen[p];
    assert!((px - x).abs() < 8.0 && (py - y).abs() < 8.0);
    assert_eq!(g.pick(-100.0, -100.0, 4.0), None);
}

#[test]
fn whole_planet_view_labels_the_layers_and_counts_what_it_draws() {
    let mut g = Glass::new();
    g.resize(640, 480);
    g.render();
    // 410 km, 660 km, core and inner core are labelled on the wedge.
    for slot in 3..LABELS {
        assert!(g.labels[slot][2] > 0.0, "label {slot} missing");
    }
    assert!(g.stats.shown > 15_000 && g.stats.shown <= g.visible());
    let d = g.stats.deepest.unwrap();
    assert!(g.world.quakes[d].depth > 650.0);
    // Without the cut there is nothing to label.
    g.cut_on = false;
    g.render();
    assert!(g.labels.iter().all(|l| l[2] == 0.0));
}
