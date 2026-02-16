# ZTH Content Upgrade — Batch 4 of 6

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

### 1. `con-02-carpentry-woodworking.html` (26,137 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Joinery techniques comparison: mortise-and-tenon, dovetail, lap joint, tongue-and-groove with load ratings
2. Timber frame structural diagram: sill plate, posts, beams, braces, rafters, pegs with force arrows
3. Hand tool guide: saw types (rip, cross, bow), plane anatomy, chisel bevel angles

**Content sections:** Historical context (timber framing traditions), wood identification and properties, seasoning and drying methods, hand tool selection and maintenance, fundamental joinery, timber frame construction, furniture building basics, wood finishing and preservation, jigs and fixtures for repeatability, sharpening techniques, failure modes (wood movement, joint failure, rot), seasonal wood working considerations, community carpentry shop setup.

---

### 2. `cra-01-forging-metalwork.html` (26,410 B · 2 SVGs)

**SVG topics (add 1–2 more to reach 3–4):**
1. Forge hearth design: tuyere placement, firepot depth, clinker breaker, hood and chimney airflow
2. Heat color temperature chart: black heat → cherry → orange → yellow → white with °F/°C ranges

**Content sections:** Historical context (Bronze Age through modern blacksmithing), forge construction (coal, charcoal, gas), anvil setup and tooling, fire management and fuel selection, basic forging operations (drawing, upsetting, bending, punching), tool making (tongs, hammers, chisels), blade forging, heat treatment (normalizing, hardening, tempering), welding (forge welding technique), decorative ironwork, failure modes (cold shuts, cracks, decarburization), seasonal forge management, community smithy organization.

---

### 3. `psychological-resilience.html` (26,936 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Stress response cycle: trigger → fight/flight/freeze → physiological effects → recovery → adaptation
2. Community mental health support structure: peer support → group sessions → trained counselors → crisis intervention
3. Resilience building framework: social connection, purpose/meaning, self-regulation, physical health, cognitive flexibility as interconnected pillars

**Content sections:** Historical context (wartime psychology, disaster mental health), stress physiology and the nervous system, acute stress responses, grief and loss processing, building individual resilience, cognitive behavioral techniques, mindfulness and grounding exercises, group cohesion and morale, leadership psychology, conflict resolution, substance abuse prevention, failure modes (burnout, compassion fatigue, PTSD), seasonal affective considerations, community mental health program design.

---

### 4. `pigeon-keeping-messenger.html` (27,200 B · 1 SVG)

**SVG topics (add 2–3 more):**
1. Pigeon loft design: nesting boxes, landing board, ventilation, predator guards, trap door mechanism
2. Homing navigation diagram: magnetic field sensing, sun compass, olfactory mapping, landmark recognition
3. Message capsule designs: leg band tube, back harness pouch, waterproofing methods with size/weight specs

**Content sections:** Historical context (ancient Egypt through WWI/WWII), pigeon breeds for messaging, loft construction and management, breeding program basics, training young birds (progressive distance), message preparation and encryption, relay station network design, health and disease management, predator defense, feeding and nutrition, failure modes (hawk predation, disorientation, disease), seasonal breeding and molting cycles, community communication network scaling.

---

## Verification

```bash
cd /path/to/project
for f in con-02-carpentry-woodworking cra-01-forging-metalwork psychological-resilience pigeon-keeping-messenger; do
  size=$(wc -c < "guides/${f}.html")
  svgs=$(grep -oP '<svg' "guides/${f}.html" | wc -l)
  warns=$(grep -oiP 'class=.?warning' "guides/${f}.html" | wc -l)
  tips=$(grep -oiP 'class=.?tip' "guides/${f}.html" | wc -l)
  related=$(grep -oiP 'class=.?related' "guides/${f}.html" | wc -l)
  echo "${f}: ${size}B, ${svgs} SVGs, ${warns} warn, ${tips} tip, ${related} related"
done
```

**Pass criteria:** Each guide ≥ 35,000 B, ≥ 3 SVGs, ≥ 2 warnings, ≥ 2 tips, ≥ 1 related.
