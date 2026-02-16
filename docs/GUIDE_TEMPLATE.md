# Guide Template Documentation

## Overview

This document describes the standardized guide template for the ZTH Survival Compendium. All guides should follow this template structure to ensure consistency, readability, and usability across the entire collection.

The canonical template is located at `/scripts/guide-template.html` and uses template variables (marked as `{{VARIABLE}}`) for easy customization.

---

## Template Variables Reference

Replace these placeholders with actual content:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{TITLE}}` | Main guide title | "Fire Starting Methods" |
| `{{DESCRIPTION}}` | One-line description of the guide | "Comprehensive guide to igniting fire with primitive and modern techniques" |
| `{{CATEGORY}}` | Topic category | "Fire", "Water", "Medicine", "Agriculture" |
| `{{DIFFICULTY_BADGE}}` | Difficulty indicator | "Beginner", "Intermediate", "Advanced", "Expert" |
| `{{READING_TIME}}` | Estimated reading time in minutes | "15", "30", "45" |
| `{{LAST_UPDATED}}` | Date guide was last revised | "2026-02-15" |
| `{{TAGS_HTML}}` | HTML-formatted tags | `<span class="tag">water</span><span class="tag">essential</span>` |
| `{{GUIDE_ID}}` | Unique guide identifier | "SUR-02", "FOD-03" |
| `{{VERSION}}` | Version number | "1.0", "2.1" |

---

## Required HTML5 Structure

Every guide must include:

### DOCTYPE and Head
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{TITLE}} - ZTH Survival Compendium</title>
  <link rel="stylesheet" href="../guides/css/shared.css">
</head>
```

- **`<!DOCTYPE html>`**: HTML5 standard
- **`lang="en"`**: Primary language attribute
- **`charset="UTF-8"`**: Character encoding for international support
- **`viewport` meta tag**: Responsive design support
- **Title format**: `[Guide Title] - ZTH Survival Compendium` (for browser tabs and bookmarks)
- **Stylesheet path**: `../guides/css/shared.css` (relative path from guides/ directory)

### Body Structure
```html
<body>
  <main role="main">
    <div class="container">
      <!-- Navigation -->
      <!-- Header -->
      <!-- Metadata -->
      <!-- Table of Contents -->
      <!-- Article content -->
      <!-- Footer -->
    </div>
  </main>
  <script src="../shared/theme-sync.js"></script>
</body>
```

---

## Structural Sections

### 1. Navigation & Breadcrumbs

```html
<nav class="breadcrumb" role="navigation" aria-label="Breadcrumb">
  <a href="index.html">Home</a> &rsaquo; <strong>{{TITLE}}</strong>
</nav>
```

- Provides context and navigation path
- Uses semantic `<nav>` element with proper ARIA labels
- First link should point to `index.html` (main guide list)

### 2. Header Section

```html
<header>
  <h1>{{TITLE}}</h1>
  <p>{{DESCRIPTION}}</p>
</header>
```

- Contains main title (`<h1>`, only one per page)
- Includes one-line description explaining guide purpose
- Uses semantic `<header>` element

### 3. Metadata Block

```html
<div class="guide-metadata">
  <span class="category">Category: <strong>{{CATEGORY}}</strong></span>
  <span class="difficulty">Difficulty: <strong>{{DIFFICULTY_BADGE}}</strong></span>
  <span class="reading-time">Reading Time: <strong>{{READING_TIME}} min</strong></span>
  <span class="last-updated">Last Updated: <strong>{{LAST_UPDATED}}</strong></span>
</div>
```

- Provides quick reference information
- Helps users assess guide complexity and time commitment
- Uses appropriate CSS classes for styling consistency

### 4. Tags Section (Optional)

```html
<div class="guide-tags">
  <span class="tag">water</span>
  <span class="tag">essential</span>
  <span class="tag">beginner-friendly</span>
</div>
```

- Displays searchable keywords
- Each tag in its own `<span class="tag">` element
- Use lowercase, hyphen-separated tag names

### 5. Table of Contents

```html
<nav class="toc" role="navigation" aria-label="Table of Contents">
  <h2>Contents</h2>
  <ol>
    <li><a href="#section-1">Section 1 Title</a></li>
    <li><a href="#section-2">Section 2 Title</a></li>
    <li><a href="#section-3">Section 3 Title</a></li>
  </ol>
</nav>
```

- Must use ordered list (`<ol>`) for numbered sections
- Links use fragment identifiers (`#section-id`)
- Each section heading must have matching `id` attribute
- Helps navigation and accessibility

### 6. Article Content

Wrap all content in semantic `<article>` element:

```html
<article>
  <section id="section-1">
    <!-- Content here -->
  </section>
  <section id="section-2">
    <!-- Content here -->
  </section>
</article>
```

### 7. Related Guides Section

```html
<div class="related" role="navigation" aria-label="Related guides">
  <h3>Related Guides</h3>
  <a href="guide-filename.html">Guide Title</a>
  <a href="guide-filename.html">Guide Title</a>
  <a href="guide-filename.html">Guide Title</a>
</div>
```

- Links to 3-5 related guides
- Helps users discover related information
- Should appear before footer

### 8. Footer

```html
<footer>
  <p>Guide ID: <strong>{{GUIDE_ID}}</strong> | Version: <strong>{{VERSION}}</strong></p>
  <p>Zero to Hero Survival Compendium &mdash; Offline Reference</p>
</footer>
```

- Includes guide identifier and version for reference
- Reinforces offline nature of the compendium

---

## Heading Hierarchy Rules

Strict heading hierarchy is essential for accessibility and document structure:

| Level | Usage | Example |
|-------|-------|---------|
| `<h1>` | **Once per page** — Main guide title | "Fire Starting Methods" |
| `<h2>` | **Major sections** — Primary topics | "Friction Methods", "Equipment Setup" |
| `<h3>` | **Subsections** — Details within sections | "Bow Drill Method", "Ferro Rod Operation" |
| `<h4>` | **Sub-subsections** — Rarely used | Use sparingly; if needed, indicates over-nesting |

### Correct Hierarchy Example
```html
<h1>Fire Starting Methods</h1>        <!-- Main title -->

<h2>Friction Methods</h2>               <!-- Section -->
<h3>Bow Drill Technique</h3>            <!-- Subsection -->
<p>Description...</p>
<h3>Hand Drill Technique</h3>           <!-- Another subsection -->

<h2>Modern Fire Starting</h2>           <!-- Another section -->
<h3>Ferro Rod Operation</h3>            <!-- Subsection -->
```

### Anti-Pattern (Incorrect)
```html
<h1>Fire Starting</h1>
<h3>Friction Methods</h3>               <!-- WRONG: Skips h2 -->
<h4>Bow Drill</h4>
```

---

## Content Sections Reference

### Standard Section with Subsections

```html
<section id="section-name">
  <h2>Section Title</h2>
  <p>Opening paragraph introducing the topic.</p>

  <h3>Subsection 1</h3>
  <p>Detailed information...</p>

  <h3>Subsection 2</h3>
  <p>More information...</p>
</section>
```

### Step-by-Step Procedure Section

For guides that teach processes or techniques:

```html
<section id="procedure">
  <h2>Step-by-Step Procedure</h2>

  <h3>Preparation</h3>
  <p>Materials and setup needed...</p>

  <h3>Instructions</h3>
  <ol>
    <li>
      <strong>Step description:</strong> Detailed action and expected outcome.
      Include specific measurements, temperatures, or time durations.
    </li>
    <li>
      <strong>Next step:</strong> Continue procedure description...
    </li>
  </ol>

  <h3>Verification</h3>
  <p>How to verify success:</p>
  <ul>
    <li>Success indicator 1</li>
    <li>Success indicator 2</li>
  </ul>
</section>
```

### Reference Table Section

For comparison or reference information:

```html
<section id="reference">
  <h2>Reference Material</h2>
  <p>Explanation of table...</p>

  <table>
    <thead>
      <tr>
        <th>Column 1</th>
        <th>Column 2</th>
        <th>Column 3</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Data 1</td>
        <td>Data 2</td>
        <td>Data 3</td>
      </tr>
    </tbody>
  </table>
</section>
```

---

## Content Box Styles

Use semantic class names for different types of content callouts:

### Information Box
```html
<div class="info-box">
  <strong>Key Point:</strong> Important information users should understand
  and remember. Use for main concepts, definitions, or core knowledge.
</div>
```

### Tip Box
```html
<div class="tip">
  <strong>Tip:</strong> Practical advice, shortcuts, or optimizations.
  Use for helpful but non-critical suggestions.
</div>
```

### Warning Box
```html
<div class="warning">
  <strong>WARNING:</strong> Safety-critical information about potential harm.
  Use for hazards, dangerous practices, or cautionary information.
</div>
```

### Danger Box
```html
<div class="danger">
  <strong>DANGER:</strong> Life-threatening hazard information.
  Use only for severe risks or catastrophic outcomes.
</div>
```

### Card Box
```html
<div class="card">
  <h4>Card Title</h4>
  <p>Self-contained information block. Use for related concepts,
  troubleshooting entries, or supplementary details.</p>
</div>
```

---

## Style Guidelines

### Text Formatting

- **Bold (`<strong>`)**: Key terms, important phrases, emphasis
- **Italic (`<em>`)**: Scientific names, emphasis, book/tool titles
- **Code (`<code>`)**: Technical terms, measurements, specific values

Example:
```html
<p>
  Use <strong>high-carbon steel</strong> (such as <em>1095 steel</em>)
  when the temperature reaches <code>900°C</code>.
</p>
```

### Lists

#### Unordered Lists (bullet points)
Use for items without sequence or priority:
```html
<ul>
  <li>Benefit one</li>
  <li>Benefit two</li>
  <li>Benefit three</li>
</ul>
```

#### Ordered Lists (numbered)
Use for sequential steps or prioritized items:
```html
<ol>
  <li>First step</li>
  <li>Second step</li>
  <li>Third step</li>
</ol>
```

### Paragraphs and Spacing

- Each logical idea in its own paragraph
- Paragraphs should be 2-4 sentences long
- Avoid wall-of-text paragraphs (over 5 sentences)
- Use section breaks (`<section>`) to organize major topics

### Code Blocks

For code snippets, measurements, or technical specifications:

```html
<pre><code>Example code or data
spans multiple lines
with formatting preserved</code></pre>
```

---

## Accessibility Requirements

All guides must meet WCAG 2.1 AA accessibility standards:

1. **Semantic HTML**
   - Use proper heading levels (no skipping levels)
   - Use `<nav>`, `<header>`, `<footer>`, `<article>`, `<section>` elements
   - Use `<table>` with `<thead>` and `<tbody>` for data tables

2. **ARIA Labels**
   - Navigation elements: `role="navigation"` and `aria-label`
   - Lists of links: `aria-label` describing content
   - Example: `<nav role="navigation" aria-label="Table of Contents">`

3. **Color Contrast**
   - Never rely on color alone (shared.css handles theme colors)
   - Use text contrast meeting WCAG AA (4.5:1 for normal text)

4. **Alternative Text**
   - SVG diagrams: Descriptive text elements inside SVG
   - Images: `alt` attributes (rarely used, prefer SVG diagrams)

5. **Link Text**
   - Descriptive link text, not "click here"
   - Good: `<a href="guide.html">Water Purification Methods</a>`
   - Bad: `<a href="guide.html">Click here</a>`

---

## SVG Diagram Guidelines

SVG diagrams are preferred over images for technical content:

```html
<svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
  <!-- Use CSS variables for colors -->
  <rect x="50" y="50" width="100" height="100" fill="var(--accent)"/>
  <text x="100" y="110" text-anchor="middle" fill="var(--text)">
    Label
  </text>
</svg>
```

### SVG Best Practices
- Use `viewBox` (not `width`/`height`) for responsive scaling
- Reference CSS color variables for theme support
- Include descriptive text elements
- Use consistent sizing: 500-800px wide viewBox
- Add descriptive `<text>` elements for all major components

---

## Example Complete Guide Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Water Purification - ZTH Survival Compendium</title>
  <link rel="stylesheet" href="../guides/css/shared.css">
</head>
<body>
  <main role="main">
    <div class="container">
      <nav class="breadcrumb" role="navigation" aria-label="Breadcrumb">
        <a href="index.html">Home</a> &rsaquo; <strong>Water Purification</strong>
      </nav>

      <header>
        <h1>Water Purification Methods</h1>
        <p>Essential techniques for making water safe to drink using primitive and modern methods</p>
      </header>

      <div class="guide-metadata">
        <span class="category">Category: <strong>Water</strong></span>
        <span class="difficulty">Difficulty: <strong>Beginner</strong></span>
        <span class="reading-time">Reading Time: <strong>12 min</strong></span>
        <span class="last-updated">Last Updated: <strong>2026-02-15</strong></span>
      </div>

      <div class="guide-tags">
        <span class="tag">water</span>
        <span class="tag">essential</span>
        <span class="tag">health</span>
      </div>

      <nav class="toc" role="navigation" aria-label="Table of Contents">
        <h2>Contents</h2>
        <ol>
          <li><a href="#boiling">Boiling Method</a></li>
          <li><a href="#filtration">Filtration Systems</a></li>
          <li><a href="#chemical">Chemical Treatment</a></li>
        </ol>
      </nav>

      <article>
        <section id="boiling">
          <h2>Boiling Method</h2>
          <p>Most reliable purification technique. Heat kills all pathogens.</p>

          <h3>Procedure</h3>
          <ol>
            <li><strong>Fill container:</strong> Use any heat-safe container.</li>
            <li><strong>Heat to boil:</strong> Bring water to rolling boil (100°C/212°F).</li>
            <li><strong>Maintain heat:</strong> Keep boiling for 1 minute (3 minutes above 2000m elevation).</li>
            <li><strong>Cool safely:</strong> Allow to cool, store in clean container.</li>
          </ol>

          <div class="tip">
            <strong>Tip:</strong> Boiling also removes dissolved gases, improving taste.
          </div>
        </section>

        <section id="filtration">
          <h2>Filtration Systems</h2>
          <p>Physical removal of particles and some contaminants.</p>

          <h3>Simple Filters</h3>
          <p>DIY sand and charcoal filter removes suspended particles...</p>

          <div class="warning">
            <strong>WARNING:</strong> Filtration alone does not kill viruses or bacteria.
            Always combine with boiling or chemical treatment.
          </div>
        </section>

        <section id="chemical">
          <h2>Chemical Treatment</h2>
          <p>Chlorine or iodine tablets for rapid disinfection...</p>
        </section>

        <div class="related" role="navigation" aria-label="Related guides">
          <h3>Related Guides</h3>
          <a href="water-storage.html">Water Storage Methods</a>
          <a href="hygiene-sanitation.html">Hygiene and Sanitation</a>
        </div>
      </article>

      <footer>
        <p>Guide ID: <strong>SUR-01</strong> | Version: <strong>1.0</strong></p>
        <p>Zero to Hero Survival Compendium &mdash; Offline Reference</p>
      </footer>
    </div>
  </main>

  <script src="../shared/theme-sync.js"></script>
</body>
</html>
```

---

## Content Writing Guidelines

### Tone and Voice
- Clear, instructional, practical
- Assume reader has basic knowledge (not absolute beginner)
- Use active voice whenever possible
- Avoid unnecessary jargon; define technical terms

### Specificity
- Always provide measurable details:
  - Temperatures: "900°C" not "very hot"
  - Durations: "3-5 minutes" not "for a while"
  - Quantities: "2 cups" not "some"
  - Sizes: "pencil-thick" not "thin"

### Procedural Content
- Number steps clearly
- Each step should be a complete action (can be performed in one sitting)
- Include "success indicators" (how to know step worked)
- Add troubleshooting tips for failure points

### Safety Information
- Mark all safety-critical information in warning/danger boxes
- Never bury hazards in paragraph text
- Use clear language, avoid assumptions about reader knowledge
- Specify what can cause harm and what prevents it

---

## Common Mistakes to Avoid

1. **Skipping heading levels** (h1 → h3 without h2)
2. **Using h1 multiple times** (only one main title per page)
3. **Broken internal links** (verify all `#section-id` anchors exist)
4. **Inconsistent spacing** (extra blank lines between sections)
5. **Missing metadata** (category, difficulty, reading time)
6. **Orphaned sections** (sections with no parent section heading)
7. **Unclear links** (Related Guides using generic text like "click here")
8. **Missing table headers** (`<thead>` with `<th>` elements)
9. **No semantic elements** (using generic `<div>` when `<section>`, `<article>` would be better)
10. **Inaccessible colors** (relying on color alone without text fallback)

---

## Validation Checklist

Before publishing a guide, verify:

- [ ] `<!DOCTYPE html>` and `<html lang="en">` present
- [ ] `<meta charset="UTF-8">` and viewport meta tag included
- [ ] Title format: `[Title] - ZTH Survival Compendium`
- [ ] Only one `<h1>` (main title)
- [ ] No skipped heading levels (h1→h2→h3 in order)
- [ ] All section IDs match Table of Contents links
- [ ] Breadcrumb navigation links to correct index
- [ ] Metadata block includes all fields
- [ ] Table of Contents is complete and accurate
- [ ] Related Guides section has 3-5 relevant links
- [ ] Footer includes Guide ID and Version
- [ ] All `<table>` elements have `<thead>` and `<tbody>`
- [ ] All content boxes use correct class names
- [ ] SVG diagrams use CSS variables for colors
- [ ] No inline styles (use shared.css instead)
- [ ] Theme script included: `<script src="../shared/theme-sync.js"></script>`
- [ ] Guide uses relative paths to CSS and JS

---

## Template Maintenance

This template should be reviewed and updated:
- When new CSS classes are added to `shared.css`
- When accessibility standards are updated
- When new content patterns emerge across guides
- Quarterly as part of standard maintenance

For questions or updates, refer to the project documentation in `/docs/`.
