//! Instrument 04 Waves: P and S waves from a real quake crossing the planet.
//!
//! - `model`: a spherically symmetric Earth (simplified ak135), P and S speed by depth.
//! - `fmm`: fast marching for first-arrival travel times on a polar grid, with the
//!   take-off angle carried along so ray density (and so amplitude) comes for free.
//! - `solve`: the multi-stage solve for one source depth (mantle P and S, the core,
//!   and the core waves coming back up), run a stage at a time.
//! - `rays`: exact ray theory through the same model, to check the grid solver, find
//!   where core rays leave the core, and draw ray paths.
//! - `section`: the cross-section renderer; `chart`: the travel-time chart.

pub mod chart;
pub mod fmm;
pub mod model;
pub mod rays;
pub mod section;
pub mod solve;

/// Source depths are solved to the nearest kilometre.
pub fn depth_key(depth: f64) -> f64 {
    depth.clamp(0.0, 700.0).round()
}

#[cfg(target_arch = "wasm32")]
mod exports {
    use super::chart::Chart;
    use super::depth_key;
    use super::model::{speed, Wave};
    use super::section::{Listener, Opts, Section};
    use super::solve::{grid, Solution, Solver, PH_NONE};
    use std::cell::RefCell;

    /// Solutions kept for recently used depths.
    const CACHE: usize = 3;

    struct State {
        cache: Vec<Solution>,
        cur: Option<usize>,
        solver: Option<Solver>,
        sec: Section,
        chart: Chart,
        /// (distance deg, side, hot).
        places: Vec<(f32, f32, bool)>,
        listeners: Vec<Listener>,
        phases: Vec<u32>,
        surf: Vec<f32>,
    }

    impl State {
        fn sol(&self) -> Option<&Solution> {
            self.cur.map(|k| &self.cache[k])
        }
        /// Recomputes listener arrival times from the current solution.
        fn refresh(&mut self) {
            let Some(k) = self.cur else { return };
            let sol = &self.cache[k];
            self.listeners.clear();
            self.phases.clear();
            for &(delta, side, hot) in &self.places {
                let (ph, p) = sol.first_p(delta as f64);
                let s = sol.first_s(delta as f64);
                self.listeners.push(Listener { delta, side, p: p as f32, s: s as f32, hot });
                self.phases.push(if p.is_finite() { ph } else { PH_NONE });
            }
            self.sec.set_listeners(&self.listeners);
        }
        fn install(&mut self, sol: Solution) {
            if self.cache.len() >= CACHE {
                // Drop the least recently used, which is kept at the front.
                self.cache.remove(0);
            }
            self.cache.push(sol);
            self.cur = Some(self.cache.len() - 1);
            self.refresh();
        }
        fn touch(&mut self, k: usize) {
            let sol = self.cache.remove(k);
            self.cache.push(sol);
            self.cur = Some(self.cache.len() - 1);
            self.refresh();
        }
    }

    thread_local! {
        static ST: RefCell<Option<State>> = const { RefCell::new(None) };
    }

    fn with<R>(f: impl FnOnce(&mut State) -> R) -> R {
        ST.with(|s| {
            let mut s = s.borrow_mut();
            let st = s.get_or_insert_with(|| State {
                cache: Vec::new(),
                cur: None,
                solver: None,
                sec: Section::new(),
                chart: Chart::new(),
                places: Vec::new(),
                listeners: Vec::new(),
                phases: Vec::new(),
                surf: Vec::new(),
            });
            f(st)
        })
    }

    /// Sizes the cross-section; `disc` is Earth's radius as a fraction of the smaller
    /// side (narrow screens leave more room for labels).
    #[no_mangle]
    pub extern "C" fn waves_resize(w: u32, h: u32, disc: f32) {
        with(|s| {
            s.sec.disc = disc.clamp(0.2, 0.5);
            s.sec.resize(w as usize, h as usize)
        })
    }

    /// Asks for a source depth (km). Returns 1 if its solution is ready now, 0 if a
    /// solve has started: call `waves_solve_step` until it returns 0.
    #[no_mangle]
    pub extern "C" fn waves_source(depth: f32) -> u32 {
        let d = depth_key(depth as f64);
        with(|s| {
            if let Some(k) = s.cache.iter().position(|x| x.depth == d) {
                s.solver = None;
                s.touch(k);
                return 1;
            }
            if s.solver.as_ref().is_none_or(|v| v.depth() != d) {
                s.solver = Some(Solver::new(d));
            }
            0
        })
    }

    /// 1 if a solution for this depth is cached.
    #[no_mangle]
    pub extern "C" fn waves_cached(depth: f32) -> u32 {
        let d = depth_key(depth as f64);
        with(|s| s.cache.iter().any(|x| x.depth == d) as u32)
    }

    /// Runs one solver stage. Returns the stages left (0 when the solution is installed).
    #[no_mangle]
    pub extern "C" fn waves_solve_step() -> u32 {
        with(|s| {
            let Some(v) = s.solver.as_mut() else { return 0 };
            if v.step() {
                let v = s.solver.take().unwrap();
                s.install(v.finish());
                0
            } else {
                v.remaining() as u32
            }
        })
    }

    /// Bit 0 ray fan, 1 P fronts, 2 S fronts.
    #[no_mangle]
    pub extern "C" fn waves_opts(bits: u32) {
        with(|s| s.sec.opts = Opts { rays: bits & 1 != 0, fronts_p: bits & 2 != 0, fronts_s: bits & 4 != 0 })
    }

    #[no_mangle]
    pub extern "C" fn waves_listeners_clear() {
        with(|s| {
            s.places.clear();
            s.refresh();
        })
    }

    /// Adds a listener `delta` degrees from the source on `side` (-1 left, 1 right) of the
    /// cross-section. Returns its index.
    #[no_mangle]
    pub extern "C" fn waves_listener_add(delta: f32, side: f32) -> u32 {
        with(|s| {
            s.places.push((delta.clamp(0.0, 180.0), if side < 0.0 { -1.0 } else { 1.0 }, false));
            s.refresh();
            s.places.len() as u32 - 1
        })
    }

    /// Highlights one listener (-1 for none).
    #[no_mangle]
    pub extern "C" fn waves_listener_hot(k: i32) {
        with(|s| {
            for (i, p) in s.places.iter_mut().enumerate() {
                p.2 = i as i32 == k;
            }
            s.refresh();
        })
    }

    /// First P-type arrival at listener k, s (infinite if none yet solved).
    #[no_mangle]
    pub extern "C" fn waves_listener_p(k: u32) -> f32 {
        with(|s| s.listeners.get(k as usize).map_or(f32::INFINITY, |l| l.p))
    }

    /// Which wave that is: 0 P, 1 diffracted P, 2 PKIKP, 3 PKP, 4 none.
    #[no_mangle]
    pub extern "C" fn waves_listener_phase(k: u32) -> u32 {
        with(|s| s.phases.get(k as usize).copied().unwrap_or(PH_NONE))
    }

    /// Direct S arrival at listener k, s (infinite in the S shadow).
    #[no_mangle]
    pub extern "C" fn waves_listener_s(k: u32) -> f32 {
        with(|s| s.listeners.get(k as usize).map_or(f32::INFINITY, |l| l.s))
    }

    /// Renders the cross-section at `t` s after the origin. Returns 0 if nothing is
    /// solved yet (the buffer is then untouched).
    #[no_mangle]
    pub extern "C" fn waves_render(t: f32) -> u32 {
        with(|s| {
            let Some(k) = s.cur else { return 0 };
            let sol = &s.cache[k];
            s.sec.prepare(sol);
            s.sec.render(t);
            1
        })
    }

    #[no_mangle]
    pub extern "C" fn waves_pixels() -> *const u32 {
        with(|s| s.sec.frame.px.as_ptr())
    }

    /// Disc geometry in canvas px: 0 centre x, 1 centre y, 2 Earth radius.
    #[no_mangle]
    pub extern "C" fn waves_layout(k: u32) -> f32 {
        with(|s| match k {
            0 => s.sec.cx,
            1 => s.sec.cy,
            _ => s.sec.rad,
        })
    }

    /// Facts about the current solution: 0 P shadow starts (deg), 1 S shadow starts,
    /// 2 PKP returns, 3 PKIKP first reaches, 4 grazing P touches the core, 5 same for
    /// S, 6 depth km, 7 angular nodes, 8 rings, 9 nodes updated by the solver.
    #[no_mangle]
    pub extern "C" fn waves_info(k: u32) -> f32 {
        with(|s| {
            let Some(sol) = s.sol() else { return f32::NAN };
            let i = sol.info;
            let g = grid();
            (match k {
                0 => i.p_shadow,
                1 => i.s_shadow,
                2 => i.pkp_min,
                3 => i.pkikp_min,
                4 => i.p_touch,
                5 => i.s_touch,
                6 => sol.depth,
                7 => g.nt as f64,
                8 => g.r.len() as f64,
                9 => sol.pops as f64,
                _ => f64::NAN,
            }) as f32
        })
    }

    /// Surface arrival times then amplitudes of field `f` at every angular node
    /// (0..180 degrees): read `2 * waves_surface_n()` f32s.
    #[no_mangle]
    pub extern "C" fn waves_surface(f: u32) -> *const f32 {
        with(|s| {
            let g = grid();
            let n = g.nt;
            let mut out = vec![f32::INFINITY; 2 * n];
            if let Some(sol) = s.sol() {
                if let Some(field) = sol.fields.get(f as usize) {
                    for i in 0..n {
                        out[i] = field.at(g.j_top, i);
                        out[n + i] = field.amp_at(g.j_top, i);
                    }
                }
            }
            s.surf = out;
            s.surf.as_ptr()
        })
    }

    #[no_mangle]
    pub extern "C" fn waves_surface_n() -> u32 {
        grid().nt as u32
    }

    /// Arrival time of field `f` at a canvas pixel, s (NaN if none).
    #[no_mangle]
    pub extern "C" fn waves_probe(f: u32, x: f32, y: f32) -> f32 {
        with(|s| if x < 0.0 || y < 0.0 { f32::NAN } else { s.sec.probe(f as usize, x as usize, y as usize) })
    }

    /// Angle (degrees) where field `f`'s front crosses the ring at radius `r` km at time
    /// `t`, scanning from `from` to `to` degrees; NaN where absent or fainter than `a_min`.
    #[no_mangle]
    pub extern "C" fn waves_front_th(f: u32, r: f32, t: f32, a_min: f32, from: f32, to: f32) -> f32 {
        with(|s| {
            s.sol().map_or(f32::NAN, |sol| sol.front_on_ring(f as usize, r as f64, t as f64, a_min as f64, from as f64, to as f64) as f32)
        })
    }

    /// Model speed, km/s: wave 0 P, 1 S, at `depth` km (the deeper side on a jump).
    #[no_mangle]
    pub extern "C" fn waves_speed(wave: u32, depth: f32) -> f32 {
        speed(if wave == 0 { Wave::P } else { Wave::S }, depth as f64, true) as f32
    }

    /// Sizes the chart; `k` is canvas pixels per CSS pixel (the margins hold HTML labels).
    #[no_mangle]
    pub extern "C" fn waves_chart_resize(w: u32, h: u32, k: f32) {
        with(|s| s.chart.resize(w as usize, h as usize, k))
    }

    /// Renders the travel-time chart; `hover` is a distance in degrees, or negative.
    #[no_mangle]
    pub extern "C" fn waves_chart_render(t: f32, hover: f32) -> u32 {
        with(|s| {
            let Some(k) = s.cur else { return 0 };
            s.chart.prepare(&s.cache[k]);
            s.chart.render(t, &s.listeners, hover);
            1
        })
    }

    #[no_mangle]
    pub extern "C" fn waves_chart_pixels() -> *const u32 {
        with(|s| s.chart.frame.px.as_ptr())
    }

    /// Plot rectangle in chart px: 0 left, 1 top, 2 right, 3 bottom.
    #[no_mangle]
    pub extern "C" fn waves_chart_rect(k: u32) -> f32 {
        with(|s| s.chart.rect[(k as usize).min(3)])
    }
}
