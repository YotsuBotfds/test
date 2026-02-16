# Optimization Scripts Quick Start Guide

## Overview
Two Python scripts have been created to optimize and maintain your survival-app project files.

## Scripts Location
```
/sessions/sweet-great-darwin/mnt/survival-app/scripts/
├── compress-guides.py     (HTML compression utility)
└── optimize-svgs.py       (SVG optimization utility)
```

---

## 1. HTML Guide Compression Script

### Purpose
Removes redundant whitespace and comments from HTML guide files while preserving all content and functionality.

### Usage
```bash
cd /sessions/sweet-great-darwin/mnt/survival-app
python3 scripts/compress-guides.py
```

### What It Does
- Scans all `.html` files in the `guides/` directory
- Removes HTML comments (except conditional and metadata comments)
- Strips multiple spaces, excessive blank lines, and trailing whitespace
- Writes optimized versions back to disk
- Reports compression statistics per file and in total

### Output Example
```
Processing 262 guide files...
✓ guide-name.html                         60870 →    50586 bytes ( 16.9% saved)
...
COMPRESSION SUMMARY
Total files processed: 262
Total bytes before:    16,648,255
Total bytes after:     16,318,501
Total bytes saved:     329,754
Overall compression:   2.0%
```

### Results from Last Run
- **Files processed:** 262
- **Total saved:** 329,754 bytes (~330 KB)
- **Average savings:** 1.3% per file
- **Best result:** nutrition-deficiency-diseases.html (22.8% saved)

---

## 2. SVG Optimization Script

### Purpose
Optimizes inline SVG elements within HTML files by removing unnecessary attributes and comments.

### Usage
```bash
cd /sessions/sweet-great-darwin/mnt/survival-app
python3 scripts/optimize-svgs.py
```

### What It Does
- Identifies SVG elements in HTML files
- Removes SVG comments
- Removes unnecessary attributes (xml:space, redundant xmlns)
- Optimizes whitespace within SVG tags
- Preserves all SVG functionality and rendering

### Output Example
```
Processing 262 guide files for SVG optimization...
✓ guide-with-svg.html                    50586 →    50553 bytes (  0.1% saved)
...
SVG OPTIMIZATION SUMMARY
Files with SVG elements: 192
Files optimized:         21
Total bytes saved:       431
Overall compression:     0.0%
```

### Results from Last Run
- **Files with SVG:** 192 (out of 262)
- **Files optimized:** 21
- **Total saved:** 431 bytes
- **Compression ratio:** 0.03%

---

## Icon Assets

All required icon sizes are now available in `/sessions/sweet-great-darwin/mnt/survival-app/assets/`:

| Size | File | Bytes | Use Case |
|------|------|-------|----------|
| 16x16 | icon-16.png | 673 | Browser tab, favicon |
| 32x32 | icon-32.png | 1,536 | Windows taskbar |
| 48x48 | icon-48.png | 2,252 | Windows start menu |
| 64x64 | icon-64.png | 4,288 | Desktop icon |
| 128x128 | icon-128.png | 10,035 | Large app icon |
| 180x180 | icon-180.png | 14,336 | Apple mobile icon |
| 192x192 | icon-192.png | 4,195 | Android PWA icon |
| 512x512 | icon-512.png | 12,018 | Master/store icon |

**Total:** ~53 KB for all icon assets

---

## Integration with Build Process

### Add to build.sh
To automatically optimize guides when building:

```bash
# Near the end of build.sh, before deployment
echo "Optimizing guides..."
python3 scripts/compress-guides.py
python3 scripts/optimize-svgs.py
```

### Manual Use After Guide Creation
```bash
# After generating new guides
python3 scripts/compress-guides.py
python3 scripts/optimize-svgs.py
```

---

## Performance Metrics

### Overall Results
- **Total bytes saved:** 330,185 bytes (~330 KB)
- **Overall compression:** 2.0%
- **Index page:** 57.2 KB saved (18.6%)
- **Average guide:** 1,258 bytes saved (1.3%)

### File Counts
- **Total guides:** 262 HTML files
- **Files compressed:** 258 (98.5%)
- **Files with no changes:** 4 (1.5%)

---

## Maintenance Notes

### When to Run These Scripts
1. **After generating new guides** - Run compress-guides.py
2. **After adding SVG content** - Run optimize-svgs.py
3. **Before deployment** - Run both scripts
4. **On every build** - Add to build.sh

### What's Preserved
- All HTML content and structure
- Conditional comments (<!--[if IE]...-->)
- Metadata comments (<!-- METADATA, <!-- TODO, etc.)
- All SVG functionality and rendering
- JavaScript functionality
- CSS rules

### What's Removed
- Non-essential HTML comments
- Excessive whitespace between tags
- Multiple consecutive spaces
- Redundant blank lines
- SVG comments
- Unnecessary SVG attributes

---

## Troubleshooting

### Issue: Script not executable
```bash
chmod +x scripts/compress-guides.py
chmod +x scripts/optimize-svgs.py
```

### Issue: Python3 not found
```bash
# Check Python version
python3 --version
# Should be 3.6 or higher
```

### Issue: Guides directory not found
Make sure you're running from the project root:
```bash
cd /sessions/sweet-great-darwin/mnt/survival-app
```

---

## Future Optimization Opportunities

1. **CSS Minification** - Potential 10-15% savings
2. **JavaScript Compression** - Potential 15-20% savings
3. **WebP Icon Format** - Potential 20-30% savings for icons
4. **GZip Compression** - Server-side compression for delivery
5. **On-Demand Loading** - Load guides only when needed

---

## Documentation

- **Full Report:** `/sessions/sweet-great-darwin/mnt/survival-app/OPTIMIZATION_REPORT.md`
- **Summary:** `/sessions/sweet-great-darwin/mnt/survival-app/OPTIMIZATION_SUMMARY.txt`
- **This Guide:** `/sessions/sweet-great-darwin/mnt/survival-app/OPTIMIZATION_QUICK_START.md`

---

## Script Technical Details

### compress-guides.py
- **Size:** 5.0 KB
- **Language:** Python 3.6+
- **Dependencies:** None (stdlib only)
- **Runtime:** ~2-5 seconds
- **Output:** Detailed per-file statistics

### optimize-svgs.py
- **Size:** 5.6 KB
- **Language:** Python 3.6+
- **Dependencies:** None (stdlib only)
- **Runtime:** ~2-5 seconds
- **Output:** SVG optimization statistics

---

*Last updated: 2026-02-15*
*Compatible with Python 3.6+*
