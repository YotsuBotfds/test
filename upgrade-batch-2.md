# ZTH Content Upgrade — Batch 2 of 6

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

### 1. `stone-tools.html` (18,869 B · 1 SVG)

**SVG topics (add 2–3 more to reach 3–4 total):**
1. Flint knapping technique: platform angle, percussion point, flake detachment physics
2. Tool typology chart: hand axe, scraper, blade, burin, microlith with use-case labels
3. Hafting methods: split-stick, socket, mastic adhesive, sinew binding cross-sections

**Content sections:** Historical context (Oldowan through Neolithic), raw material identification (flint, obsidian, chert, quartzite), knapping techniques (hard hammer, soft hammer, pressure flaking), tool types and functions, hafting and handle construction, edge maintenance and resharpening, grinding and polishing stone, projectile point manufacture, failure modes (material fractures), seasonal material procurement, community tool production workshop.

---

### 2. `cra-03-cordage-textiles.html` (19,821 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Fiber extraction process: plant harvest → retting → breaking → scutching → hackling → spinning
2. Twist direction diagram: S-twist vs Z-twist, ply construction, tensile strength comparison
3. Loom setup schematic: warp beam, heddle, shuttle path, reed, cloth beam

**Content sections:** Historical context, fiber plant identification (hemp, flax, nettle, cattail, yucca), fiber extraction and processing, hand spinning techniques, plying and rope construction, basic weaving on frame looms, knitting and netting, dyeing with natural pigments, tensile strength testing, cordage for specific applications (fishing, shelter, climbing), failure modes, seasonal fiber harvest windows, community textile production scaling.

---

### 3. `cra-06-knot-tying-rigging.html` (21,647 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Essential knot gallery: bowline, clove hitch, trucker's hitch, figure-8, sheet bend with step-by-step
2. Mechanical advantage pulley systems: single, double, compound with force multiplier labels
3. Load-bearing anchor points: tree wrap, deadman anchor, rock chock with force distribution arrows

**Content sections:** Historical context (maritime, mountaineering, construction), rope types and properties, essential knots (10+ with use cases), lashing techniques for structures, pulley and block-and-tackle systems, mechanical advantage calculations, rigging for lifting heavy loads, highline and zip-line setup, rope inspection and retirement criteria, splicing techniques, failure modes (knot slippage, rope degradation), seasonal rope care, community rigging team protocols.

---

### 4. `cra-04-soap-making.html` (21,744 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Saponification reaction diagram: triglyceride + lye → glycerol + soap molecules (molecular structure)
2. Cold process soap timeline: mix → trace → mold → cure (4–6 weeks) with pH testing checkpoints
3. Lye production from wood ash: ash → leach → drip → concentrate → test with egg-float method

**Content sections:** Historical context (ancient Babylon through colonial era), fat and oil sourcing (animal tallow, plant oils), lye production from wood ash, saponification chemistry, cold process method, hot process method, melt-and-pour from salvaged soap, additives (herbs, clay, essential oils), pH testing and safety, specialty soaps (laundry, antiseptic, shampoo), failure modes (lye-heavy, separation, rancidity), seasonal production calendar, community soap cooperative scaling.

---

## Verification

```bash
cd /path/to/project
for f in stone-tools cra-03-cordage-textiles cra-06-knot-tying-rigging cra-04-soap-making; do
  size=$(wc -c < "guides/${f}.html")
  svgs=$(grep -oP '<svg' "guides/${f}.html" | wc -l)
  warns=$(grep -oiP 'class=.?warning' "guides/${f}.html" | wc -l)
  tips=$(grep -oiP 'class=.?tip' "guides/${f}.html" | wc -l)
  related=$(grep -oiP 'class=.?related' "guides/${f}.html" | wc -l)
  echo "${f}: ${size}B, ${svgs} SVGs, ${warns} warn, ${tips} tip, ${related} related"
done
```

**Pass criteria:** Each guide ≥ 35,000 B, ≥ 3 SVGs, ≥ 2 warnings, ≥ 2 tips, ≥ 1 related.
