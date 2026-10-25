//! Orbit camera for the glass Earth.
//!
//! A pose is a pivot (`target`), a turntable axis (`axis`, screen-up is always the
//! part of it perpendicular to the view, so there is never any roll), the unit
//! direction from the pivot to the eye (`back`) and a distance. Flights between
//! poses interpolate each part separately, so they can be interrupted at any
//! moment and dragging carries on from exactly what is on screen.

use crate::gfx::v3::{self, V};

/// Highest elevation above the turntable plane, radians (keeps the axis off-screen-vertical).
const MAX_ELEV: f32 = 1.38;
/// The eye never goes closer to the centre than this (Earth radii).
const MIN_EYE: f32 = 1.06;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pose {
    pub target: V,
    pub axis: V,
    pub back: V,
    pub dist: f32,
}

/// Rotate `p` about the unit axis `k` by `a` radians (Rodrigues).
pub fn rotate(p: V, k: V, a: f32) -> V {
    let (s, c) = a.sin_cos();
    let kxp = v3::cross(k, p);
    let kdp = v3::dot(k, p);
    [0, 1, 2].map(|i| p[i] * c + kxp[i] * s + k[i] * kdp * (1.0 - c))
}

/// Any unit vector perpendicular to `v`.
pub fn perp(v: V) -> V {
    let h = if v[2].abs() < 0.9 { [0.0, 0.0, 1.0] } else { [1.0, 0.0, 0.0] };
    v3::norm(v3::cross(v, h))
}

/// Spherical interpolation that also copes with opposite vectors.
pub fn slerp(a: V, b: V, t: f32) -> V {
    let w = v3::angle(a, b);
    if w < 1e-5 {
        return a;
    }
    if w > std::f32::consts::PI - 1e-3 {
        return rotate(a, perp(a), w * t);
    }
    v3::norm(v3::slerp(a, b, t))
}

fn lerp3(a: V, b: V, t: f32) -> V {
    [0, 1, 2].map(|i| a[i] + (b[i] - a[i]) * t)
}

impl Pose {
    pub fn eye(&self) -> V {
        v3::add(self.target, v3::scale(self.back, self.dist))
    }

    /// Screen right, screen up, forward (into the screen).
    pub fn basis(&self) -> [V; 3] {
        let r = v3::cross(self.axis, self.back);
        let right = if v3::len(r) < 1e-4 { perp(self.back) } else { v3::norm(r) };
        let up = v3::cross(self.back, right);
        [right, up, v3::scale(self.back, -1.0)]
    }

    pub fn lerp(a: &Pose, b: &Pose, t: f32) -> Pose {
        Pose {
            target: lerp3(a.target, b.target, t),
            axis: slerp(a.axis, b.axis, t),
            back: slerp(a.back, b.back, t),
            dist: a.dist * (b.dist / a.dist).powf(t),
        }
    }

    /// Elevation of the view above the turntable plane, radians.
    pub fn elevation(&self) -> f32 {
        v3::dot(self.back, self.axis).clamp(-1.0, 1.0).asin()
    }

    fn yaw(&mut self, a: f32) {
        self.back = v3::norm(rotate(self.back, self.axis, a));
    }

    fn pitch(&mut self, a: f32) {
        let e = (self.elevation() + a).clamp(-MAX_ELEV, MAX_ELEV);
        let along = v3::dot(self.back, self.axis);
        let flat = v3::sub(self.back, v3::scale(self.axis, along));
        let h = if v3::len(flat) < 1e-5 { perp(self.axis) } else { v3::norm(flat) };
        self.back = v3::norm(v3::add(v3::scale(h, e.cos()), v3::scale(self.axis, e.sin())));
    }

    /// Push the eye back out if it would be inside (or too close to) the planet.
    pub fn keep_outside(&mut self) {
        let tb = v3::dot(self.target, self.back);
        let tt = v3::dot(self.target, self.target);
        let disc = tb * tb - tt + MIN_EYE * MIN_EYE;
        if disc > 0.0 {
            let s = -tb + disc.sqrt();
            if self.dist < s {
                self.dist = s;
            }
        }
    }
}

pub struct Cam {
    pub pose: Pose,
    fly: Option<Fly>,
    /// Yaw and pitch velocity from a fling, rad/s.
    pub vel: [f32; 2],
    /// Auto-orbit: phase (s) and fade-in (0..1).
    phase: f32,
    gain: f32,
    /// Auto-orbit sways back and forth (true) or turns continuously (false).
    pub sway: bool,
    /// Half-amplitude of the sway, radians.
    pub sway_amp: f32,
    pub min_dist: f32,
    pub max_dist: f32,
}

struct Fly {
    from: Pose,
    to: Pose,
    t: f32,
    dur: f32,
}

impl Cam {
    pub fn new(pose: Pose) -> Self {
        Cam { pose, fly: None, vel: [0.0; 2], phase: 0.0, gain: 0.0, sway: false, sway_amp: 0.56, min_dist: 0.35, max_dist: 9.0 }
    }

    pub fn flying(&self) -> bool {
        self.fly.is_some()
    }

    /// Where a running flight will end (or the current pose).
    pub fn destination(&self) -> Pose {
        self.fly.as_ref().map_or(self.pose, |f| f.to)
    }

    fn interrupt(&mut self) {
        self.fly = None;
        self.gain = 0.0;
    }

    /// Drag: turn about the axis and tilt, radians.
    pub fn orbit(&mut self, dyaw: f32, dpitch: f32) {
        self.interrupt();
        self.vel = [0.0; 2];
        self.pose.yaw(dyaw);
        self.pose.pitch(dpitch);
        self.pose.keep_outside();
    }

    /// Release after a drag: keep turning at this speed and let it decay.
    pub fn fling(&mut self, vyaw: f32, vpitch: f32) {
        let lim = 6.0;
        self.vel = [vyaw.clamp(-lim, lim), vpitch.clamp(-lim, lim)];
    }

    /// Zoom by a factor (> 1 moves closer).
    pub fn zoom(&mut self, f: f32) {
        if let Some(fl) = &mut self.fly {
            fl.to.dist = (fl.to.dist / f).clamp(self.min_dist, self.max_dist);
            return;
        }
        self.gain = 0.0;
        self.pose.dist = (self.pose.dist / f).clamp(self.min_dist, self.max_dist);
        self.pose.keep_outside();
    }

    pub fn fly_to(&mut self, mut to: Pose, dur: f32) {
        to.keep_outside();
        self.vel = [0.0; 2];
        self.gain = 0.0;
        if dur <= 0.0 {
            self.pose = to;
            self.fly = None;
            return;
        }
        self.fly = Some(Fly { from: self.pose, to, t: 0.0, dur });
    }

    /// Advance by `dt` seconds. `auto` turns on the idle orbit. Returns whether the pose moved.
    pub fn tick(&mut self, dt: f32, auto: bool) -> bool {
        let before = self.pose;
        if let Some(f) = &mut self.fly {
            f.t += dt;
            let k = (f.t / f.dur).min(1.0);
            let e = if k < 0.5 { 4.0 * k * k * k } else { 1.0 - (-2.0 * k + 2.0).powi(3) / 2.0 };
            self.pose = Pose::lerp(&f.from, &f.to, e);
            if k >= 1.0 {
                self.pose = f.to;
                self.fly = None;
            }
            self.pose.keep_outside();
        } else if self.vel[0] != 0.0 || self.vel[1] != 0.0 {
            self.pose.yaw(self.vel[0] * dt);
            self.pose.pitch(self.vel[1] * dt);
            self.pose.keep_outside();
            let decay = (-dt / 0.45).exp();
            self.vel = self.vel.map(|v| if (v * decay).abs() < 0.004 { 0.0 } else { v * decay });
        } else if auto {
            self.gain = (self.gain + dt / 2.5).min(1.0);
            let ease = self.gain * self.gain * (3.0 - 2.0 * self.gain);
            let w = if self.sway {
                // Back and forth over a 34 s period.
                let om = std::f32::consts::TAU / 34.0;
                self.phase += dt;
                -self.sway_amp * om * (om * self.phase).cos()
            } else {
                0.09
            };
            self.pose.yaw(w * ease * dt);
        } else {
            self.gain = 0.0;
            self.phase = 0.0;
        }
        self.pose != before
    }
}
