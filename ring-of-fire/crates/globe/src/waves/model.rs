//! A spherically symmetric Earth: P and S speed against radius, piecewise linear.
//!
//! The nodes are a subset of ak135 (Kennett, Engdahl & Buland 1995). The outer core
//! follows the iasp91 polynomial (Kennett & Engdahl 1991), sampled every 250 km, and
//! the inner core is ak135's parabola sampled at four radii. A discontinuity is two
//! nodes at the same depth: the first is the value just above it, the second just below.

/// Mean Earth radius, km.
pub const R_EARTH: f64 = 6371.0;
/// Core-mantle boundary (2891.5 km deep).
pub const R_CMB: f64 = 3479.5;
/// Inner-core boundary (5153.5 km deep).
pub const R_ICB: f64 = 1217.5;
pub const MOHO_DEPTH: f64 = 35.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Wave {
    P,
    S,
}

/// (depth km, Vp km/s, Vs km/s), top to bottom.
pub const NODES: &[(f64, f64, f64)] = &[
    (0.0, 5.80, 3.46),
    (20.0, 5.80, 3.46),
    (20.0, 6.50, 3.85),
    (35.0, 6.50, 3.85),
    (35.0, 8.04, 4.48),
    (77.5, 8.045, 4.49),
    (120.0, 8.05, 4.50),
    (165.0, 8.175, 4.509),
    (210.0, 8.30, 4.518),
    (260.0, 8.4825, 4.609),
    (310.0, 8.665, 4.696),
    (360.0, 8.8475, 4.783),
    (410.0, 9.03, 4.87),
    (410.0, 9.36, 5.08),
    (460.0, 9.528, 5.186),
    (510.0, 9.696, 5.292),
    (560.0, 9.864, 5.398),
    (610.0, 10.032, 5.505),
    (660.0, 10.20, 5.61),
    (660.0, 10.79, 5.96),
    (710.0, 10.9229, 6.0898),
    (760.0, 11.0558, 6.2095),
    (809.5, 11.1353, 6.2426),
    (1000.0, 11.458, 6.380),
    (1250.0, 11.842, 6.541),
    (1500.0, 12.188, 6.680),
    (1750.0, 12.503, 6.805),
    (2000.0, 12.798, 6.920),
    (2250.0, 13.084, 7.030),
    (2500.0, 13.367, 7.140),
    (2740.0, 13.649, 7.246),
    (2891.5, 13.660, 7.281),
    // Liquid outer core: no shear strength, so no S.
    (2891.5, 8.0131, 0.0),
    (3141.5, 8.4306, 0.0),
    (3391.5, 8.8060, 0.0),
    (3641.5, 9.1393, 0.0),
    (3891.5, 9.4305, 0.0),
    (4141.5, 9.6796, 0.0),
    (4391.5, 9.8865, 0.0),
    (4641.5, 10.0514, 0.0),
    (4891.5, 10.1742, 0.0),
    (5153.5, 10.2577, 0.0),
    // Solid inner core.
    (5153.5, 11.0427, 3.5043),
    (5571.0, 11.1674, 3.5972),
    (5971.0, 11.2385, 3.6502),
    (6371.0, 11.2622, 3.6678),
];

/// Depths where the speed jumps (each appears twice in `NODES`).
pub fn discontinuities() -> Vec<f64> {
    NODES.windows(2).filter(|w| w[0].0 == w[1].0).map(|w| w[0].0).collect()
}

/// Speed at `depth` km. Exactly on a discontinuity, `below` picks the deeper side.
pub fn speed(wave: Wave, depth: f64, below: bool) -> f64 {
    let d = depth.clamp(0.0, R_EARTH);
    let pick = |n: &(f64, f64, f64)| if wave == Wave::P { n.1 } else { n.2 };
    // First segment [a, b] that contains d; on a tie the side is chosen by `below`.
    let mut found = None;
    for w in NODES.windows(2) {
        let (a, b) = (&w[0], &w[1]);
        if a.0 == b.0 {
            continue;
        }
        let inside = if below { d >= a.0 && d < b.0 } else { d > a.0 && d <= b.0 };
        if inside {
            found = Some((a, b));
            break;
        }
    }
    let (a, b) = found.unwrap_or_else(|| {
        // d == 0 with !below, or d == R_EARTH with below.
        if d <= 0.0 {
            (&NODES[0], &NODES[1])
        } else {
            (&NODES[NODES.len() - 2], &NODES[NODES.len() - 1])
        }
    });
    let t = (d - a.0) / (b.0 - a.0);
    pick(a) + (pick(b) - pick(a)) * t
}

/// Speed at radius `r` km (the side away from the centre on a discontinuity).
pub fn speed_r(wave: Wave, r: f64) -> f64 {
    speed(wave, R_EARTH - r, false)
}

/// Named shells for labels and shading, (name, top depth, bottom depth) in km.
pub const LAYERS: &[(&str, f64, f64)] = &[
    ("Crust", 0.0, MOHO_DEPTH),
    ("Upper mantle", MOHO_DEPTH, 410.0),
    ("Transition zone", 410.0, 660.0),
    ("Lower mantle", 660.0, 2891.5),
    ("Outer core", 2891.5, 5153.5),
    ("Inner core", 5153.5, R_EARTH),
];

pub fn layer_at(depth: f64) -> usize {
    LAYERS.iter().position(|l| depth < l.2).unwrap_or(LAYERS.len() - 1)
}
