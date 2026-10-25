use globe::Globe;

#[test]
fn renders_every_view_without_panicking() {
    let mut g = Globe::new();
    g.resize(240, 160);
    for zoom in [0.8, 1.0, 3.0, 8.0] {
        for yaw in (-180..180).step_by(45) {
            for pitch in [-85.0, 0.0, 85.0] {
                g.yaw = yaw as f32;
                g.pitch = pitch;
                g.zoom = zoom;
                g.opts.rings = true;
                g.render();
            }
        }
    }
    g.cursor = 0.0;
    g.render();
    assert_eq!(g.visible(), 0);
}

#[test]
fn pick_finds_the_kamchatka_mainshock() {
    let mut g = Globe::new();
    g.resize(800, 800);
    let i = g.world.largest(1, 0.0)[0];
    let q = g.world.quakes[i];
    assert!(q.mag >= 8.8);
    g.yaw = q.lon;
    g.pitch = q.lat;
    g.render();
    // Centred on the epicentre, so it projects to the middle of the canvas.
    let [x, y, z] = g.screen[i];
    assert!((x - 400.0).abs() < 1.0 && (y - 400.0).abs() < 1.0 && z > 0.99);
    assert_eq!(g.pick(400.0, 400.0, 6.0), Some(i));
}
