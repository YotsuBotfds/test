# Shared CSS for Survival Compendium Guides

## Overview

This directory contains the consolidated CSS file used across all 256 guide documents in the Survival Compendium.

### Files

- **shared.css** - Main stylesheet with common styles, CSS variables, and responsive design rules

## CSS Structure

### CSS Variables (10 total)

All colors and theme values are defined as CSS custom properties in `:root`:

```css
--bg:       #1a2e1a    /* Background color */
--surface:  #2d2416    /* Card/panel background */
--card:     #2d2416    /* Card container */
--accent:   #d4a574    /* Primary accent */
--accent2:  #b8956a    /* Secondary accent */
--text:     #f5f0e8    /* Text color */
--muted:    #999       /* Secondary text */
--border:   #4a6d4a    /* Border color */
--red:      #c94444    /* Alert/error color */
--lg:       #4a6d4a    /* Tertiary accent */
```

### Base Styles

The stylesheet provides base styling for:
- Document structure (body, container, sections)
- Typography (h1-h4, paragraphs, lists)
- Tables and code blocks
- Links and navigation

### Component Classes

Common class selectors included:
- `.container` - Main content container
- `.toc` - Table of contents styling
- `.card` - Content cards
- `.warning`, `.tip`, `.info-box` - Alert boxes
- `.back-link` - Back navigation button
- `nav.breadcrumb` - Breadcrumb navigation
- `.related` - Related guides section
- `header`, `footer` - Page sections

### Responsive Design

- Mobile breakpoint: `@media (max-width: 768px)`
- Adapts font sizes, padding, and layout for smaller screens

### Theme Support

- **Dark theme** (default) with warm earth tones
- **Light theme** via `@media (prefers-color-scheme: light)`

### Print Styles

Print-specific rules optimize guides for printing:
- Removes decorative elements
- Optimizes colors and contrast for paper
- Adjusts layout for print margins

## Guide-Specific CSS

Individual guides may have inline `<style>` tags with custom CSS for:
- Guide-specific layout patterns (e.g., `.construction-steps`)
- Custom data visualizations
- Unique color schemes or theme overrides
- Special formatting (e.g., `.highlight`, `.success`)

These custom styles are preserved while duplicate shared styles are removed.

## Browser Support

Modern browsers supporting:
- CSS Custom Properties (CSS Variables)
- CSS Grid and Flexbox
- Media queries
- Linear gradients

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Integration

All guide HTML files reference this stylesheet:

```html
<!-- Minified guides -->
<link rel=stylesheet href=css/shared.css>

<!-- Formatted guides -->
<link rel="stylesheet" href="../css/shared.css">
```

## Statistics

- **File size**: 6,270 bytes
- **CSS variables**: 10
- **Selectors**: 71
- **CSS reduction**: ~66% across all guides (~210KB saved)
- **Guides using only shared.css**: 26
- **Guides with guide-specific CSS**: 230

## Maintenance Notes

When updating shared.css:

1. Test changes across multiple guide examples
2. Verify responsive design at 768px breakpoint
3. Check light theme variant still works
4. Validate print styles function correctly
5. Ensure CSS variables are properly referenced
6. Test with modern browsers

## Version History

- **v1.0** (2026-02-15): Initial consolidated version
  - Extracted common CSS from 256 guides
  - Implemented dark/light theme support
  - Added responsive design rules
  - Reduced overall CSS footprint by 66%

