# ZTH Content Upgrade — Batch 3 of 6

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

### 1. `sterilization-methods.html` (26,112 B · 0 SVGs)

**SVG topics:**
1. Autoclave/pressure cooker sterilization diagram: vessel cross-section, pressure gauge, steam flow, temperature zones
2. Chemical sterilization process: solution preparation → soak time → rinse → dry with concentration charts
3. UV sterilization setup: lamp placement, exposure distances, shadow zones, timer protocols
4. Sterilization decision tree: instrument type → contamination level → available method → cycle parameters

**Content sections:** Historical context (Lister, Pasteur, Semmelweis), heat sterilization (autoclave, boiling, dry heat, flaming), chemical sterilization (bleach, alcohol, hydrogen peroxide, iodine), UV sterilization, filtration for water and air, instrument classification (critical, semi-critical, non-critical), sterile field setup, indicator testing (biological, chemical), storage of sterilized equipment, failure modes (incomplete sterilization signs), seasonal humidity challenges, community sterilization station protocols.

---

### 2. `cra-05-weaving-textiles.html` (21,288 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Loom anatomy: warp beam, heddle frames, shuttle, reed, cloth beam, treadles with labeled parts
2. Basic weave patterns: plain, twill, satin shown as grid intersections with float diagrams
3. Natural dye color chart: plant source → mordant → resulting color for 8 common dyes

**Content sections:** Historical context (Neolithic through industrial revolution), loom types (backstrap, rigid heddle, floor loom, inkle), warp preparation and threading, basic weave structures, pattern drafting, natural fiber preparation, dyeing techniques, fabric finishing (fulling, napping, pressing), specialty textiles (waterproofing, insulation), repair and darning, failure modes (warp breakage, uneven tension), seasonal fiber availability, community textile guild organization.

---

### 3. `fire-suppression.html` (23,781 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Fire triangle/tetrahedron: fuel, heat, oxygen, chain reaction with suppression methods at each vertex
2. Firebreak construction diagram: cleared zone widths, soil barrier, backfire technique
3. Improvised fire extinguisher designs: sand bucket, wet blanket, vinegar-baking soda, pump sprayer

**Content sections:** Historical context (Roman fire brigades through modern techniques), fire science fundamentals, fire classification (A/B/C/D/K), detection and alarm systems, manual suppression techniques, firebreaks and defensible space, structural fire prevention, wildfire response, water supply systems for firefighting, improvised equipment, chemical suppressants from salvage, failure modes (flashover, backdraft, rekindling), seasonal fire risk calendar, community fire brigade organization.

---

### 4. `cra-02-pottery-ceramics.html` (24,888 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Kiln cross-section: firebox, chamber, flue, damper, temperature zones with airflow arrows
2. Clay processing pipeline: dig → soak → slake → sieve → wedge → age with quality checkpoints
3. Firing temperature chart: earthenware (900–1100°C), stoneware (1200–1300°C), porcelain (1300–1400°C) with cone equivalents

**Content sections:** Historical context, clay identification and sourcing, clay processing and preparation, hand-building techniques (coil, slab, pinch), wheel throwing basics, kiln construction (pit, updraft, downdraft), firing schedules, glazing from natural materials (wood ash, feldspar, clay slips), functional vessel design (water storage, cooking, fermentation), decorative techniques, failure modes (cracking, warping, bloating), seasonal drying considerations, community pottery workshop scaling.

---

## Verification

```bash
cd /path/to/project
for f in sterilization-methods cra-05-weaving-textiles fire-suppression cra-02-pottery-ceramics; do
  size=$(wc -c < "guides/${f}.html")
  svgs=$(grep -oP '<svg' "guides/${f}.html" | wc -l)
  warns=$(grep -oiP 'class=.?warning' "guides/${f}.html" | wc -l)
  tips=$(grep -oiP 'class=.?tip' "guides/${f}.html" | wc -l)
  related=$(grep -oiP 'class=.?related' "guides/${f}.html" | wc -l)
  echo "${f}: ${size}B, ${svgs} SVGs, ${warns} warn, ${tips} tip, ${related} related"
done
```

**Pass criteria:** Each guide ≥ 35,000 B, ≥ 3 SVGs, ≥ 2 warnings, ≥ 2 tips, ≥ 1 related.
