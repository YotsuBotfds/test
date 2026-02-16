# ZTH Content Upgrade — Batch 5 of 6

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

### 1. `orthodontics-survival.html` (28,744 B · 2 SVGs)

**SVG topics (add 1–2 more to reach 3–4):**
1. Dental arch anatomy: tooth numbering, occlusion classes I/II/III, bite relationship diagrams
2. Improvised orthodontic appliance: wire bending sequences for retainer, bracket positioning guide

**Content sections:** Historical context, dental arch anatomy and occlusion, malocclusion classification, improvised bracket and wire systems, tooth movement principles (tipping, bodily, rotation), retention and stabilization, TMJ assessment and management, pediatric vs adult considerations, emergency orthodontic repair, materials sourcing from salvage, pain management, failure modes (root resorption, wire breakage, relapse), seasonal appointment scheduling, community dental clinic integration.

---

### 2. `zoonotic-disease.html` (29,138 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Zoonotic transmission pathways: direct contact, vector-borne, foodborne, airborne with animal reservoir icons
2. Disease surveillance network: animal monitoring → sample collection → testing → reporting → response
3. Quarantine zone layout: hot zone, buffer zone, clean zone with decontamination stations and movement protocols

**Content sections:** Historical context (plague, rabies, influenza pandemics), transmission pathway types, major zoonotic diseases by vector (tick-borne, mosquito-borne, rodent-borne, livestock), rabies prevention and post-exposure protocol, avian influenza monitoring, brucellosis and livestock management, disease surveillance methods, quarantine procedures, personal protective equipment, animal handling safety, failure modes (missed early signs, containment breaches), seasonal disease patterns, community one-health program design.

---

### 3. `infectious-disease.html` (29,205 B · 2 SVGs)

**SVG topics (add 1–2 more to reach 3–4):**
1. Chain of infection diagram: pathogen → reservoir → portal of exit → transmission → portal of entry → susceptible host, with intervention points
2. Epidemic curve interpretation: point source, propagated, and mixed outbreak patterns with timeline

**Content sections:** Historical context (germ theory, antibiotics era, post-collapse), pathogen types (bacteria, viruses, fungi, parasites), chain of infection and breaking transmission, clinical assessment without labs, isolation and quarantine protocols, wound infection management, respiratory illness protocols, gastrointestinal infections, waterborne disease prevention, improvised diagnostic techniques, antibiotic stewardship, failure modes (antibiotic resistance, superspreader events), seasonal disease calendars, community epidemic response team.

---

### 4. `veterinary-parasitology.html` (30,612 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Parasite life cycles: direct (roundworm) vs indirect (liver fluke) with host stages and environmental phases
2. Fecal flotation testing procedure: sample → mix solution → strain → float → microscope slide with expected findings
3. Pasture rotation diagram: paddock layout with rest periods, larval die-off timelines, stocking density guidelines

**Content sections:** Historical context, common internal parasites by livestock species, external parasites (ticks, lice, mites, flies), parasite life cycles, fecal egg counting techniques, pasture management for parasite control, herbal anthelmintics, chemical dewormer salvage and dosing, resistance management and rotation, biosecurity for new animals, zoonotic parasites, failure modes (resistance emergence, misdiagnosis), seasonal parasite pressure patterns, community veterinary parasite surveillance.

---

## Verification

```bash
cd /path/to/project
for f in orthodontics-survival zoonotic-disease infectious-disease veterinary-parasitology; do
  size=$(wc -c < "guides/${f}.html")
  svgs=$(grep -oP '<svg' "guides/${f}.html" | wc -l)
  warns=$(grep -oiP 'class=.?warning' "guides/${f}.html" | wc -l)
  tips=$(grep -oiP 'class=.?tip' "guides/${f}.html" | wc -l)
  related=$(grep -oiP 'class=.?related' "guides/${f}.html" | wc -l)
  echo "${f}: ${size}B, ${svgs} SVGs, ${warns} warn, ${tips} tip, ${related} related"
done
```

**Pass criteria:** Each guide ≥ 35,000 B, ≥ 3 SVGs, ≥ 2 warnings, ≥ 2 tips, ≥ 1 related.
