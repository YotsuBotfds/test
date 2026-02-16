# ZTH Content Upgrade — Batch 6 of 6

## Instructions

Upgrade each guide file listed below. For each guide:

1. **Read** the current file from `guides/<filename>.html`
2. **Rewrite** it, preserving ALL existing metadata (JSON-LD, breadcrumbs, `<link>`, `<meta>`, `<script>` tags)
3. **Add 3–4 inline SVG diagrams** using the exact style below
4. **Expand content** to 35–55 KB with 12+ TOC sections
5. **Add required blocks**: 2+ `class="warning"`, 2+ `class="tip"`, 1+ `class="related"`
6. **Write** the upgraded file back to the same path
7. Keep HTML **minified** (no unnecessary whitespace between tags)

---

## SVG Style (mandatory on every `<svg>`)

```
viewBox="0 0 600 400"
style="background:#1a2e1a;margin:20px 0;border-radius:8px;max-width:100%;height:auto"
aria-label="<descriptive text>"
```

- **Heading text fill:** `#d4a574`
- **Label text fill:** `#b8956a`
- **Body text fill:** `#f5f0e8`
- **Stroke:** `#b8956a`, `stroke-width="2"`
- Use shapes, lines, arrows, and labels to create educational diagrams

---

## Guides to Upgrade

### 1. `desalination-systems.html` (30,728 B · 2 SVGs)

**SVG topics (add 1–2 more to reach 3–4):**
1. Solar still large-scale design: basin still with reflective surfaces, condensation channels, collection reservoir
2. Reverse osmosis salvage setup: pre-filter → high-pressure pump → membrane housing → permeate/brine separation

**Content sections:** Historical context, desalination methods overview, solar distillation (basin, wick, multi-effect), thermal distillation (pot still, multi-stage flash), reverse osmosis from salvaged components, electrodialysis basics, water quality testing, energy requirements comparison, intake and pre-treatment, brine disposal, system maintenance, failure modes (scaling, membrane fouling, corrosion), seasonal output variations, community water supply scaling.

---

### 2. `veterinary-obstetrics.html` (35,045 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Normal presentation positions: anterior, posterior, breech with limb positioning for cattle/horses/sheep
2. Dystocia decision tree: assess presentation → reposition attempt → manual assist → fetotomy → cesarean
3. Neonatal assessment checklist: breathing → temperature → nursing → navel care → colostrum timing

**Content sections:** Historical context, reproductive anatomy by species, breeding management and timing, pregnancy diagnosis methods, prenatal nutrition, normal parturition stages (I, II, III), dystocia recognition and intervention, manual repositioning techniques, equipment preparation, neonatal care first 24 hours, postpartum dam care, retained placenta management, failure modes (uterine torsion, prolapse, infection), seasonal breeding calendars, community breeding program coordination.

---

### 3. `power-distribution.html` (29,720 B · 4 SVGs)

> Note: This guide has 4 SVGs already but is under 35 KB. Focus on **content expansion** — add 12+ sections and required warning/tip/related blocks. Add or improve SVGs only if needed.

**Content sections:** Historical context (Edison vs Westinghouse, AC/DC), basic electrical theory review, generation source integration (solar, wind, hydro, generator), battery bank design and management, charge controller selection, inverter systems, wiring standards and safety, load calculation and circuit design, distribution panel layout, metering and monitoring, grounding and lightning protection, failure modes (overload, short circuit, ground fault), seasonal load patterns, community microgrid scaling.

---

### 4. `desalination-systems.html` — SKIP (already listed above)

Since we only have 3 remaining guides in this batch, also handle these **borderline guides** that have content but are missing SVGs or blocks:

### 4. `infection-control.html` — PATCH ONLY

This guide is 21,708 B with 1 SVG. **Add 2 more SVGs** and ensure it has 2+ warnings, 2+ tips, 1+ related. Read the current file and surgically add SVGs + blocks without full rewrite. Target ≥ 35 KB.

**SVG topics to add:**
1. Hand hygiene technique: 6-step WHO handwashing with duration and coverage zones
2. PPE donning/doffing sequence: gown → mask → goggles → gloves (don) and reverse order (doff) with contamination zones

### 5. `rubber-vulcanization.html` — PATCH ONLY

This guide is 20,933 B with 1 SVG. **Add 2 more SVGs** and ensure it has 2+ warnings, 2+ tips, 1+ related. Read and surgically add. Target ≥ 35 KB.

**SVG topics to add:**
1. Vulcanization chemistry: sulfur cross-links between polymer chains before/after heating
2. Tire retreading process: inspect → buff → apply tread rubber → cure in mold with temperature/time parameters

---

## Verification

```bash
cd /path/to/project
for f in desalination-systems veterinary-obstetrics power-distribution infection-control rubber-vulcanization; do
  size=$(wc -c < "guides/${f}.html")
  svgs=$(grep -oP '<svg' "guides/${f}.html" | wc -l)
  warns=$(grep -oiP 'class=.?warning' "guides/${f}.html" | wc -l)
  tips=$(grep -oiP 'class=.?tip' "guides/${f}.html" | wc -l)
  related=$(grep -oiP 'class=.?related' "guides/${f}.html" | wc -l)
  echo "${f}: ${size}B, ${svgs} SVGs, ${warns} warn, ${tips} tip, ${related} related"
done
```

**Pass criteria:** Each guide ≥ 35,000 B, ≥ 3 SVGs, ≥ 2 warnings, ≥ 2 tips, ≥ 1 related.

---

## Post-Upgrade (run after ALL 6 batches complete)

```bash
# Rebuild search index
node scripts/build-search-index.js

# Validate all guides
node scripts/validate.js

# Bump service worker cache version
# Edit sw.js and increment CACHE_VERSION

# Build
npm run build
```
