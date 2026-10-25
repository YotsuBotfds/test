//! Instrument 06 Laws: three statistical laws of seismology, fitted live to the
//! catalogue and drawn by the software rasteriser.
//!
//! - A, Gutenberg–Richter (`gr`): completeness by three estimators and the b-value by
//!   maximum likelihood, for the whole catalogue or one depth band.
//! - B, Omori–Utsu (`omori`): the decay of an aftershock sequence, fitted by maximum
//!   likelihood with secondary sequences, plus Båth's law.
//! - C, energy (`energy`): a treemap of radiated energy, one tile per quake.
//!
//! Fits and layouts run when their inputs change (`set_gr`, `set_sequence`,
//! `resize`); `render` only redraws marks. Text is laid out by the page from the
//! JSON that `info` returns (ticks, anchors and every fitted number).

pub mod energy;
pub mod gr;
pub mod omori;
pub mod plot;
pub mod stats;
pub mod treemap;

use crate::color::{depth_color, hex, Rgb};
use crate::data::{world, World};
use crate::gfx::Frame;
use energy::EnergyView;
use gr::{GrData, GrView};
use omori::{OmoriData, OmoriView};
use plot::{jnum, jstr, jticks};
use stats::{Budget, Hist, MIN_B, MIN_FIT};
use std::fmt::Write;

pub const CHART_GR: u32 = 0;
pub const CHART_OMORI: u32 = 1;
pub const CHART_ENERGY: u32 = 2;

/// Depth subsets for panel A: name, top and bottom depth (km).
pub const SUBSETS: [(&str, f32, f32); 4] =
    [("all", 0.0, f32::INFINITY), ("shallow", 0.0, 70.0), ("intermediate", 70.0, 300.0), ("deep", 300.0, f32::INFINITY)];

/// What `set_sequence` did.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SeqStatus {
    Fitted = 0,
    TooFew = 1,
    NotLarge = 2,
}

pub struct Laws {
    pub world: &'static World,
    pub hists: Vec<Hist>,
    pub subset: usize,
    pub mc_override: Option<usize>,
    pub gr: GrData,
    /// Cutoff used for aftershock counting: the automatic Mc of the whole catalogue.
    pub mc_seq: f64,
    pub om: OmoriData,
    pub default_main: usize,
    pub budget: Budget,
    pub depth: Vec<f32>,
    /// Depth colour of every quake, computed once.
    pub tint: Vec<Rgb>,
    pub selected: Option<usize>,
    pub grv: GrView,
    pub omv: OmoriView,
    pub env: EnergyView,
}

impl Default for Laws {
    fn default() -> Self {
        Self::new()
    }
}

fn subset_color(s: usize) -> Rgb {
    match s {
        1 => depth_color(20.0),
        2 => depth_color(150.0),
        3 => depth_color(550.0),
        _ => hex(plot::INK),
    }
}

impl Laws {
    pub fn new() -> Self {
        let world = world();
        let q = &world.quakes;
        let hists: Vec<Hist> = SUBSETS
            .iter()
            .map(|&(_, a, b)| Hist::new(q.iter().filter(|x| x.depth >= a && x.depth < b).map(|x| x.mag)))
            .collect();
        let mc_seq = hists[0].completeness().map_or(4.5, |c| stats::mag(c.chosen));
        let default_main = world.largest(1, 0.0).first().copied().unwrap_or(0);
        let budget = Budget::new(q);
        let placeholder = GrData {
            hist: hists[0].clone(),
            comp: hists[0].completeness().expect("catalogue is not empty"),
            curve: Vec::new(),
            fit: hists[0].b_value(45).expect("catalogue is not empty"),
            color: subset_color(0),
        };
        let mut l = Laws {
            world,
            hists,
            subset: 0,
            mc_override: None,
            gr: placeholder,
            mc_seq,
            om: OmoriData::default(),
            default_main,
            budget,
            depth: q.iter().map(|x| x.depth).collect(),
            tint: q.iter().map(|x| depth_color(x.depth)).collect(),
            selected: None,
            grv: GrView::new(),
            omv: OmoriView::new(),
            env: EnergyView::new(),
        };
        l.set_gr(0, None);
        l.set_sequence(default_main);
        l
    }

    /// Refits panel A for a depth subset, at an explicit cutoff bin or the automatic one.
    pub fn set_gr(&mut self, subset: usize, mc_bin: Option<usize>) {
        let subset = subset.min(SUBSETS.len() - 1);
        let hist = self.hists[subset].clone();
        let Some(comp) = hist.completeness() else { return };
        let curve = hist.b_curve(MIN_B);
        let (first, last) = (curve.first().map_or(comp.chosen, |c| c.kc), curve.last().map_or(comp.chosen, |c| c.kc));
        let kc = mc_bin.unwrap_or(comp.chosen).clamp(first, last.max(first));
        let Some(fit) = hist.b_value(kc) else { return };
        self.subset = subset;
        self.mc_override = mc_bin.filter(|&k| k != comp.chosen);
        self.gr = GrData { hist, comp, curve, fit, color: subset_color(subset) };
        if self.grv.frame.w > 1 {
            self.grv.layout(&self.gr);
        }
    }

    /// Selects and fits the aftershock sequence of quake `main` (M ≥ 7 only).
    pub fn set_sequence(&mut self, main: usize) -> SeqStatus {
        let q = &self.world.quakes;
        if main >= q.len() || q[main].mag < 7.0 {
            return SeqStatus::NotLarge;
        }
        let seq = stats::sequence(q, main, self.mc_seq);
        let (fit, single) = if seq.times.len() >= MIN_FIT {
            let full = stats::fit_omori(&seq.times, seq.window, &seq.sec_times, seq.mu);
            let single = if seq.sec_times.is_empty() { None } else { stats::fit_omori(&seq.times, seq.window, &[], seq.mu) };
            (full, single)
        } else {
            (None, None)
        };
        let status = if fit.is_some() { SeqStatus::Fitted } else { SeqStatus::TooFew };
        self.om = OmoriData::new(seq, fit, single);
        if self.omv.frame.w > 1 {
            self.omv.layout(&self.om, q);
        }
        status
    }

    pub fn select(&mut self, i: Option<usize>) {
        self.selected = i.filter(|&i| i < self.world.quakes.len());
        self.env.selected = self.selected;
    }

    pub fn frame(&self, chart: u32) -> &Frame {
        match chart {
            CHART_GR => &self.grv.frame,
            CHART_OMORI => &self.omv.frame,
            _ => &self.env.frame,
        }
    }

    pub fn resize(&mut self, chart: u32, w: usize, h: usize, k: f32) {
        match chart {
            CHART_GR => {
                self.grv.resize(w, h, k);
                self.grv.layout(&self.gr);
            }
            CHART_OMORI => {
                self.omv.resize(w, h, k);
                self.omv.layout(&self.om, &self.world.quakes);
            }
            _ => {
                self.env.resize(w, h, k);
                self.env.layout(&self.budget, &self.depth);
            }
        }
    }

    pub fn render(&mut self, chart: u32) {
        let q = &self.world.quakes;
        match chart {
            CHART_GR => {
                let sel = self.selected.map(|i| q[i].mag);
                self.grv.render(&self.gr, sel)
            }
            CHART_OMORI => self.omv.render(&self.om, q, &self.tint),
            _ => self.env.render(q, &self.tint),
        }
    }

    /// Updates the hover state from canvas coordinates (x < 0 clears) and returns what
    /// is under the pointer: a bin (A, B), 1000 + slot in a strip, or a quake (C).
    pub fn hover(&mut self, chart: u32, x: f32, y: f32) -> i32 {
        let q = &self.world.quakes;
        match chart {
            CHART_GR => {
                self.grv.hover = if x < 0.0 { -1 } else { self.grv.pick(&self.gr, x, y) };
                self.grv.hover
            }
            CHART_OMORI => {
                self.omv.hover = if x < 0.0 { -1 } else { self.omv.pick(&self.om, q, x, y) };
                self.omv.hover
            }
            _ => {
                let (i, d) = if x < 0.0 { (None, None) } else { self.env.pick(x, y) };
                self.env.hover = i;
                self.env.hover_dust = d;
                i.map_or(-1, |i| i as i32)
            }
        }
    }

    /// Secondary hover result: the quake under the pointer in B's strip, or the dust
    /// region under the pointer in C.
    pub fn hover_aux(&self, chart: u32) -> i32 {
        match chart {
            CHART_OMORI if self.omv.hover >= 1000 => {
                self.om.seq.events.get((self.omv.hover - 1000) as usize).map_or(-1, |&j| j as i32)
            }
            CHART_ENERGY => self.env.hover_dust.map_or(-1, |d| d as i32),
            _ => -1,
        }
    }

    pub fn info(&self, chart: u32) -> String {
        match chart {
            CHART_GR => self.info_gr(),
            CHART_OMORI => self.info_omori(),
            _ => self.info_energy(),
        }
    }

    fn info_gr(&self) -> String {
        let d = &self.gr;
        let v = &self.grv;
        let mut o = String::with_capacity(8192);
        o.push('{');
        o.push_str("\"subset\":");
        jstr(&mut o, SUBSETS[self.subset].0);
        let _ = write!(o, ",\"n\":{},\"auto\":{},\"kc\":{}", d.hist.total(), self.mc_override.is_none(), d.fit.kc);
        for (name, val) in [
            ("mc", d.fit.mc),
            ("b", d.fit.b),
            ("sb", d.fit.sigma),
            ("sb_aki", d.fit.sigma_aki),
            ("a", d.fit.a),
            ("maxc", stats::mag(d.comp.maxc)),
            ("chosen", stats::mag(d.comp.chosen)),
            ("mbs", d.comp.mbs.map_or(f64::NAN, stats::mag)),
            ("gft_best_mc", stats::mag(d.comp.gft_best.0)),
            ("gft_best_r", d.comp.gft_best.1),
            ("gft_mc", d.comp.gft.map_or(f64::NAN, |g| stats::mag(g.0))),
            ("gft_r", d.comp.gft.map_or(f64::NAN, |g| g.1)),
            ("gft_level", d.comp.gft.map_or(f64::NAN, |g| g.2 as f64)),
        ] {
            let _ = write!(o, ",\"{name}\":");
            jnum(&mut o, val);
        }
        let _ = write!(o, ",\"nfit\":{}", d.fit.n);
        // b above M5.5, where the catalogue's magnitudes are almost all moment magnitudes.
        if let Some(b) = d.hist.b_value(55) {
            let _ = write!(o, ",\"b55\":[");
            jnum(&mut o, b.b);
            o.push(',');
            jnum(&mut o, b.sigma);
            let _ = write!(o, ",{}]", b.n);
        }
        o.push_str(",\"bins\":[");
        let (lo, hi) = (d.hist.lo().unwrap_or(0), d.hist.hi().unwrap_or(0));
        let mut first = true;
        for k in lo..=hi {
            if d.hist.n[k] == 0 {
                continue;
            }
            if !first {
                o.push(',');
            }
            first = false;
            let _ = write!(o, "[{},{},{},", k, d.hist.n[k], d.hist.cum(k));
            jnum(&mut o, d.fit.n_at_least(stats::mag(k)));
            o.push(']');
        }
        o.push_str("],\"curve\":[");
        for (i, c) in d.curve.iter().enumerate() {
            if i > 0 {
                o.push(',');
            }
            let _ = write!(o, "[{},", c.kc);
            jnum(&mut o, c.b);
            o.push(',');
            jnum(&mut o, c.sigma);
            let _ = write!(o, ",{}]", c.n);
        }
        o.push(']');
        plot_json(&mut o, "main", &v.main);
        plot_json(&mut o, "strip", &v.strip);
        o.push(',');
        jticks(&mut o, "x", &v.xt);
        o.push(',');
        jticks(&mut o, "y", &v.yt);
        o.push(',');
        jticks(&mut o, "yb", &v.ybt);
        o.push_str(",\"mcx\":");
        jnum(&mut o, v.x.px(d.fit.mc - 0.05) as f64);
        // Fit label anchor: walk up the line from its low end and take the first point
        // where a label box above-right (else below-left) of it clears every dot.
        let (k, lw, lh) = (v.k, 56.0 * v.k, 15.0 * v.k);
        let dots: Vec<(f32, f32)> = (0..stats::NB)
            .filter(|&b| d.hist.n[b] > 0)
            .map(|b| (v.x.px(stats::mag(b)), v.y.px(d.hist.cum(b) as f64)))
            .collect();
        let clear = |x0: f32, y0: f32| {
            x0 >= v.main.x0 && x0 + lw <= v.main.x1 && y0 >= v.main.y0 && y0 + lh <= v.main.y1
                && dots.iter().all(|&(dx, dy)| dx < x0 - 6.0 * k || dx > x0 + lw + 6.0 * k || dy < y0 - 6.0 * k || dy > y0 + lh + 6.0 * k)
        };
        let m_end = ((d.fit.a - 0.5f64.log10()) / d.fit.b).min(v.x.hi);
        let mut lab = None;
        let mut m = m_end - 0.1;
        while m > d.fit.mc && lab.is_none() {
            let (px, py) = (v.x.px(m), v.y.px(d.fit.n_at_least(m)));
            if clear(px + 8.0 * k, py - 6.0 * k - lh) {
                lab = Some((px, py, 0));
            } else if clear(px - 8.0 * k - lw, py + 8.0 * k) {
                lab = Some((px, py, 1));
            }
            m -= 0.05;
        }
        if let Some((px, py, mode)) = lab {
            o.push_str(",\"fitlab\":[");
            jnum(&mut o, px as f64);
            o.push(',');
            jnum(&mut o, py as f64);
            let _ = write!(o, ",{mode}]");
        }
        o.push_str(",\"b1y\":");
        jnum(&mut o, if (v.yb.lo..=v.yb.hi).contains(&1.0) { v.yb.px(1.0) as f64 } else { f64::NAN });
        o.push_str(",\"xpx\":[");
        // Pixel of each bin, for the readout and the selection marker.
        jnum(&mut o, v.x.px(0.0) as f64);
        o.push(',');
        jnum(&mut o, (v.x.px(1.0) - v.x.px(0.0)) as f64);
        o.push_str("]}");
        o
    }

    fn info_omori(&self) -> String {
        let d = &self.om;
        let s = &d.seq;
        let v = &self.omv;
        let q = &self.world.quakes;
        let t0 = q[s.main].t as f64;
        let days = |j: usize| (q[j].t as f64 - t0) / stats::DAY_S;
        let mut o = String::with_capacity(8192);
        let _ = write!(o, "{{\"q0\":{},\"default\":{},\"m0\":", s.main, self.default_main);
        jnum(&mut o, s.m0);
        for (name, val) in [
            ("radius", s.radius_km),
            ("rupture", stats::rupture_length_km(s.m0)),
            ("window", s.window),
            ("mc", s.mc),
            ("mu", s.mu),
        ] {
            let _ = write!(o, ",\"{name}\":");
            jnum(&mut o, val);
        }
        let opt = |o: &mut String, name: &str, v: Option<usize>| {
            let _ = write!(o, ",\"{name}\":");
            match v {
                Some(j) => {
                    let _ = write!(o, "[{j},");
                    jnum(o, q[j].mag as f64);
                    o.push(',');
                    jnum(o, days(j));
                    o.push(',');
                    jnum(o, stats::distance_km(q[s.main].lat, q[s.main].lon, q[j].lat, q[j].lon));
                    o.push(']');
                }
                None => o.push_str("null"),
            }
        };
        opt(&mut o, "cut_by", s.cut_by);
        opt(&mut o, "largest", s.largest);
        opt(&mut o, "parent", s.parent);
        let _ = write!(
            o,
            ",\"at_end\":{},\"n_events\":{},\"n\":{},\"early\":{},\"mu_windows\":{},\"radius_check\":[{},{},{}],\"min_fit\":{}",
            s.at_end,
            s.events.len(),
            s.times.len(),
            d.early,
            s.mu_windows,
            s.radius_check[0],
            s.radius_check[1],
            s.radius_check[2],
            MIN_FIT
        );
        o.push_str(",\"sec\":[");
        for (k, &j) in s.secondary.iter().enumerate() {
            if k > 0 {
                o.push(',');
            }
            let _ = write!(o, "[{j},");
            jnum(&mut o, q[j].mag as f64);
            o.push(',');
            jnum(&mut o, days(j));
            o.push(',');
            jnum(&mut o, v.x.px(days(j)) as f64);
            o.push(']');
        }
        o.push(']');
        let fit_json = |o: &mut String, name: &str, f: Option<&stats::OmoriFit>| {
            let _ = write!(o, ",\"{name}\":");
            let Some(f) = f else {
                o.push_str("null");
                return;
            };
            o.push('{');
            let mut first = true;
            for (k, val) in [
                ("k", f.k),
                ("c", f.c),
                ("p", f.p),
                ("sk", f.sk),
                ("sc", f.sc),
                ("sp", f.sp),
                ("aic", f.aic),
                ("nll", f.nll),
                ("ks_d", f.ks_d),
                ("ks_p", f.ks_p),
            ] {
                if !first {
                    o.push(',');
                }
                first = false;
                let _ = write!(o, "\"{k}\":");
                jnum(o, val);
            }
            o.push_str(",\"kj\":[");
            for (i, (a, b)) in f.kj.iter().zip(&f.skj).enumerate() {
                if i > 0 {
                    o.push(',');
                }
                o.push('[');
                jnum(o, *a);
                o.push(',');
                jnum(o, *b);
                o.push(']');
            }
            let _ = write!(o, "],\"n\":{}}}", f.n);
        };
        fit_json(&mut o, "fit", d.fit.as_ref());
        fit_json(&mut o, "single", d.single.as_ref());
        if let Some(f) = &d.fit {
            // Plain-language anchors: the primary decay alone at 1 and 100 days.
            for (name, t) in [("r1", 1.0), ("r10", 10.0), ("r100", 100.0)] {
                let _ = write!(o, ",\"{name}\":");
                jnum(&mut o, f.k * (f.c + t).powf(-f.p));
            }
        }
        o.push_str(",\"bins\":[");
        for i in 0..d.counts.len() {
            if i > 0 {
                o.push(',');
            }
            let (a, b) = (d.edges[i], d.edges[i + 1]);
            let n = d.counts[i];
            let (lo, up) = stats::poisson_limits(n);
            o.push('[');
            for (k, val) in [a, b, n as f64, n as f64 / (b - a), lo / (b - a), up / (b - a)].into_iter().enumerate() {
                if k > 0 {
                    o.push(',');
                }
                jnum(&mut o, val);
            }
            o.push(',');
            jnum(&mut o, d.fit.as_ref().map_or(f64::NAN, |f| f.expected(a, b, &s.sec_times, s.mu) / (b - a)));
            o.push(',');
            jnum(&mut o, v.x.px((a * b).sqrt()) as f64);
            o.push(']');
        }
        o.push(']');
        plot_json(&mut o, "main", &v.main);
        plot_json(&mut o, "strip", &v.strip);
        o.push(',');
        jticks(&mut o, "x", &v.xt);
        o.push(',');
        jticks(&mut o, "y", &v.yt);
        o.push(',');
        jticks(&mut o, "ym", &v.ymt);
        let anchor = |o: &mut String, name: &str, x: f64, y: f64| {
            let _ = write!(o, ",\"{name}\":[");
            jnum(o, x);
            o.push(',');
            jnum(o, y);
            o.push(']');
        };
        if let Some(f) = &d.fit {
            if f.c > v.x.lo && f.c < v.x.hi {
                anchor(&mut o, "c_at", v.x.px(f.c) as f64, v.main.y1 as f64);
            }
        }
        if s.mu > 0.0 && s.mu >= v.y.lo {
            anchor(&mut o, "mu_at", v.main.x1 as f64, v.y.px(s.mu) as f64);
        }
        anchor(&mut o, "m0_at", v.strip.x1 as f64, v.ym.px(s.m0) as f64);
        if s.m0 - 1.2 > v.ym.lo {
            anchor(&mut o, "bath_at", v.strip.x1 as f64, v.ym.px(s.m0 - 1.2) as f64);
        }
        if let Some(j) = s.largest {
            let t = days(j).max(v.x.lo);
            anchor(&mut o, "largest_at", v.x.px(t) as f64, v.ym.px(q[j].mag as f64) as f64);
        }
        o.push('}');
        o
    }

    fn info_energy(&self) -> String {
        let b = &self.budget;
        let v = &self.env;
        let q = &self.world.quakes;
        let mut o = String::with_capacity(16384);
        let _ = write!(o, "{{\"n\":{},\"total\":", q.len());
        jnum(&mut o, b.total);
        let equiv = (b.total.log10() - 4.8) / 1.5;
        for (name, val) in [
            ("equiv_m", equiv),
            ("mt", b.total / 4.184e15),
            ("top1", b.top1),
            ("top10", b.top10),
            ("small90", b.small90),
            ("small90_max", b.small90_max as f64),
        ] {
            let _ = write!(o, ",\"{name}\":");
            jnum(&mut o, val);
        }
        let _ = write!(o, ",\"small90_n\":{},\"top1_i\":{}", b.small90_n, b.order.first().copied().unwrap_or(0));
        // The smallest single quake that out-released the whole lowest class.
        if let Some(low) = b.classes.last() {
            let beat = b.order.iter().rev().find(|&&i| b.energy[i] > low.energy).copied();
            if let Some(i) = beat {
                let _ = write!(o, ",\"beats\":[{i},");
                jnum(&mut o, q[i].mag as f64);
                let _ = write!(o, ",{},", low.members.len());
                jnum(&mut o, low.energy / b.total);
                o.push(']');
            }
        }
        o.push_str(",\"classes\":[");
        for (ci, c) in b.classes.iter().enumerate() {
            if ci > 0 {
                o.push(',');
            }
            let r = v.map.classes.get(ci).copied().unwrap_or_default();
            let _ = write!(o, "[{},", c.unit);
            for (k, val) in [c.lo as f64, c.hi as f64, c.members.len() as f64, c.energy / b.total, r.x0, r.y0, r.x1, r.y1]
                .into_iter()
                .enumerate()
            {
                if k > 0 {
                    o.push(',');
                }
                jnum(&mut o, val);
            }
            o.push(']');
        }
        o.push_str("],\"labels\":[");
        let k = v.k as f64;
        let mut first = true;
        let mut count = 0;
        for t in &v.map.tiles {
            if t.rect.w() < 46.0 * k || t.rect.h() < 22.0 * k || count >= 60 {
                continue;
            }
            count += 1;
            if !first {
                o.push(',');
            }
            first = false;
            let _ = write!(o, "[{},", t.quake);
            for (kk, val) in [t.rect.x0, t.rect.y0, t.rect.x1, t.rect.y1, b.energy[t.quake] / b.total].into_iter().enumerate() {
                if kk > 0 {
                    o.push(',');
                }
                jnum(&mut o, val);
            }
            o.push(']');
        }
        o.push_str("],\"dust\":[");
        for (di, d) in v.map.dust.iter().enumerate() {
            if di > 0 {
                o.push(',');
            }
            let lo = d.members.iter().map(|&i| q[i].mag).fold(f32::INFINITY, f32::min);
            let hi = d.members.iter().map(|&i| q[i].mag).fold(0.0, f32::max);
            let shallow = d.members.iter().filter(|&&i| q[i].depth < 70.0).count();
            let deep = d.members.iter().filter(|&&i| q[i].depth >= 300.0).count();
            let _ = write!(o, "[{},", d.class);
            for (kk, val) in [d.rect.x0, d.rect.y0, d.rect.x1, d.rect.y1, d.members.len() as f64, d.energy / b.total, lo as f64, hi as f64]
                .into_iter()
                .enumerate()
            {
                if kk > 0 {
                    o.push(',');
                }
                jnum(&mut o, val);
            }
            let _ = write!(o, ",{shallow},{deep}]");
        }
        let _ = write!(o, "],\"tiles\":{},\"min_area\":", v.map.tiles.len());
        jnum(&mut o, v.min_area / (k * k));
        o.push('}');
        o
    }

    /// Where quake `i` sits in the energy map (canvas px), for placing the tooltip
    /// when it was selected elsewhere.
    pub fn energy_rect(&self, i: usize) -> Option<treemap::Rect> {
        self.env.where_is(i)
    }
}

fn plot_json(o: &mut String, name: &str, p: &plot::Plot) {
    let _ = write!(o, ",\"{name}\":[");
    for (k, v) in [p.x0, p.y0, p.x1, p.y1].into_iter().enumerate() {
        if k > 0 {
            o.push(',');
        }
        jnum(o, v as f64);
    }
    o.push(']');
}

#[cfg(target_arch = "wasm32")]
mod exports {
    use super::*;
    use std::cell::RefCell;

    thread_local! {
        static LAWS: RefCell<Option<Laws>> = const { RefCell::new(None) };
        static INFO: RefCell<String> = const { RefCell::new(String::new()) };
    }

    fn with<R>(f: impl FnOnce(&mut Laws) -> R) -> R {
        LAWS.with(|l| f(l.borrow_mut().get_or_insert_with(Laws::new)))
    }

    /// Builds the fits and layouts (call once before anything else).
    #[no_mangle]
    pub extern "C" fn laws_init() {
        with(|_| ())
    }

    /// Chart 0 = Gutenberg–Richter, 1 = Omori, 2 = energy map. `k` is canvas px per CSS px.
    #[no_mangle]
    pub extern "C" fn laws_resize(chart: u32, w: u32, h: u32, k: f32) {
        with(|l| l.resize(chart, w as usize, h as usize, k))
    }

    #[no_mangle]
    pub extern "C" fn laws_render(chart: u32) {
        with(|l| l.render(chart))
    }

    #[no_mangle]
    pub extern "C" fn laws_pixels(chart: u32) -> *const u32 {
        with(|l| l.frame(chart).px.as_ptr())
    }

    /// JSON description of a chart (fitted numbers, ticks, anchors); read
    /// `laws_info_len()` bytes from the returned pointer.
    #[no_mangle]
    pub extern "C" fn laws_info(chart: u32) -> *const u8 {
        let s = with(|l| l.info(chart));
        INFO.with(|i| {
            *i.borrow_mut() = s;
            i.borrow().as_ptr()
        })
    }

    #[no_mangle]
    pub extern "C" fn laws_info_len() -> u32 {
        INFO.with(|i| i.borrow().len() as u32)
    }

    /// Hover at canvas px (x < 0 clears). Returns a bin, 1000 + strip slot, or a quake index.
    #[no_mangle]
    pub extern "C" fn laws_hover(chart: u32, x: f32, y: f32) -> i32 {
        with(|l| l.hover(chart, x, y))
    }

    #[no_mangle]
    pub extern "C" fn laws_hover_aux(chart: u32) -> i32 {
        with(|l| l.hover_aux(chart))
    }

    /// Panel A: depth subset (0 all, 1 shallow, 2 intermediate, 3 deep) and cutoff as
    /// magnitude × 10 (negative = automatic).
    #[no_mangle]
    pub extern "C" fn laws_gr_set(subset: u32, mc10: i32) {
        with(|l| l.set_gr(subset as usize, (mc10 >= 0).then_some(mc10 as usize)))
    }

    /// Panel B: fit the sequence of quake `i` (negative = the default mainshock).
    /// Returns 0 fitted, 1 too few aftershocks, 2 not an M7+ quake (nothing changed).
    #[no_mangle]
    pub extern "C" fn laws_seq_set(i: i32) -> i32 {
        with(|l| {
            let main = if i < 0 { l.default_main } else { i as usize };
            l.set_sequence(main) as i32
        })
    }

    /// The page-wide selected quake (-1 clears).
    #[no_mangle]
    pub extern "C" fn laws_select(i: i32) {
        with(|l| l.select((i >= 0).then_some(i as usize)))
    }

    /// Outline one magnitude class in the energy map (-1 clears).
    #[no_mangle]
    pub extern "C" fn laws_class_highlight(c: i32) {
        with(|l| l.env.class_hl = (c >= 0).then_some(c as usize))
    }

    /// Canvas rectangle of quake `i` in the energy map: axis 0..3 = x0, y0, x1, y1 (NaN if absent).
    #[no_mangle]
    pub extern "C" fn laws_energy_rect(i: u32, axis: u32) -> f32 {
        with(|l| match l.energy_rect(i as usize) {
            Some(r) => [r.x0, r.y0, r.x1, r.y1][axis.min(3) as usize] as f32,
            None => f32::NAN,
        })
    }
}
