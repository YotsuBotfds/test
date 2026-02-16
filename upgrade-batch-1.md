# ZTH Content Upgrade — Batch 1 of 6

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

### 1. `transistors.html` (18,665 B · 0 SVGs)

**SVG topics:**
1. NPN transistor cross-section: emitter, base, collector, depletion zones, current flow arrows
2. Common-emitter amplifier circuit schematic with component values and signal flow
3. Transistor characteristic curves: Ic vs Vce for different Ib values
4. Salvage-to-circuit pipeline: identify component → test → desolder → categorize → integrate

**Content sections:** Historical context (Bardeen/Brattain/Shockley through post-collapse salvage), semiconductor fundamentals, transistor types (BJT, FET, MOSFET), testing with salvaged multimeters, common-emitter amplifier, switching circuits, radio receiver applications, voltage regulation, transistor-based oscillators, failure modes and degradation, seasonal temperature effects on semiconductors, community electronics workshop setup.

---

### 2. `automotive-alternator-repurposing.html` (18,971 B · 0 SVGs)

**SVG topics:**
1. Alternator internal cross-section: rotor, stator windings, diode bridge, slip rings, bearings
2. Wind turbine conversion diagram: blade hub → alternator → rectifier → charge controller → battery bank
3. Water wheel power generation setup: dam/weir → penstock → wheel → belt drive → alternator
4. Wiring schematic: alternator → bridge rectifier → voltage regulator → battery → load panel

**Content sections:** Historical context, alternator anatomy and operating principles, disassembly/inspection procedure, rewinding stator coils, wind turbine conversion, micro-hydro applications, hand-crank generator build, voltage regulation, battery charging systems, maintenance schedules, failure modes and bearing replacement, seasonal output variations, community power grid scaling.

---

### 3. `cra-07-primitive-weapons.html` (21,436 B · 0 SVGs)

**SVG topics:**
1. Bow construction diagram: stave selection, tillering profile, nock/grip placement, string angles
2. Spear/atlatl throwing mechanics: leverage ratios, release angles, effective range arcs
3. Sling construction and release technique: pouch design, cord lengths, centripetal force diagram
4. Arrow/bolt fletching and point attachment: shaft straightening, sinew wrapping, stone knapping angles

**Content sections:** Historical context (paleolithic through medieval), bow stave selection and seasoning, bow tillering and shaping, arrow crafting, atlatl design and use, sling construction, bola making, defensive applications, hunting ethics and game selection, materials sourcing by biome, failure modes, seasonal material availability, community defense coordination.

---

### 4. `medications.html` (22,354 B · 0 SVGs)

**SVG topics:**
1. Medication shelf-life decision tree: package integrity → storage conditions → expiration date → potency testing → use/discard
2. Drug interaction matrix showing common salvaged medication categories and dangerous combinations
3. Dosage adjustment chart: body weight × age × condition severity → recommended dose range
4. Pharmaceutical salvage triage: location types → likely finds → storage assessment → categorization

**Content sections:** Historical context (pharmacy through collapse), medication identification and classification, shelf life and potency assessment, proper storage conditions, common analgesics and antipyretics, antibiotics and antiinfectives, cardiovascular medications, psychiatric medications, pediatric dosing, drug interactions and contraindications, compounding basics, failure modes (degradation signs), seasonal storage challenges, community pharmacy protocols.

---

## Verification

After upgrading all 4 guides, run this check:

```bash
cd /path/to/project
for f in transistors automotive-alternator-repurposing cra-07-primitive-weapons medications; do
  size=$(wc -c < "guides/${f}.html")
  svgs=$(grep -oP '<svg' "guides/${f}.html" | wc -l)
  warns=$(grep -oiP 'class=.?warning' "guides/${f}.html" | wc -l)
  tips=$(grep -oiP 'class=.?tip' "guides/${f}.html" | wc -l)
  related=$(grep -oiP 'class=.?related' "guides/${f}.html" | wc -l)
  echo "${f}: ${size}B, ${svgs} SVGs, ${warns} warn, ${tips} tip, ${related} related"
done
```

**Pass criteria:** Each guide ≥ 35,000 B, ≥ 3 SVGs, ≥ 2 warnings, ≥ 2 tips, ≥ 1 related.
