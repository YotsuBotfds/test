# Build Script Documentation

## Overview
The `build.sh` script is a maintenance and validation tool for the ZTH Survival App. It automates three critical tasks:

1. **Service Worker Cache Generation** - Creates a comprehensive cache list for offline functionality
2. **Data Validation** - Ensures all data files are valid and consistent
3. **Statistics Reporting** - Provides a summary of the project's contents

## Usage

```bash
./build.sh
```

The script is idempotent and safe to run multiple times. It will automatically increment the service worker cache version each time it runs.

## What It Does

### Step 1: Generate Service Worker Cache List

The script scans the entire project and generates a `PRE_CACHE_URLS` array in `sw.js` containing:
- `index.html`, `manifest.json`, `sw.js` (root files)
- All `.html` files from `guides/` directory
- All `.html` files from `tools/` directory
- All files from `data/` directory (JSON databases)
- All files from `assets/` directory (images, icons)
- All files from `shared/` directory (JavaScript utilities)
- All CSS files from `guides/css/`

**Features:**
- Generates relative paths (e.g., `./guides/water-purification.html`)
- Removes duplicates
- Sorts alphabetically for consistency
- Increments cache version (v1 → v2 → v3, etc.)
- Updates `sw.js` in-place using regex

### Step 2: Validate Data Files

Performs comprehensive validation checks:

#### JSON Validity
- Validates that all JSON files in `data/` are syntactically correct
- Reports: ✓/✗ for each JSON file

#### salvage_data.json Structure
- Ensures all `time_savings` values are numeric (int or float)
- Ensures all `best_salvage_items` are arrays
- Catches data type mismatches

#### Guide File References
- Scans `master-skills-db.json` for all `guide_file` references
- Verifies that referenced files actually exist on disk
- Handles both list and dict JSON formats

#### Dead Link Detection
- Scans all guide HTML files for broken links
- Intelligently filters:
  - External URLs (http/https)
  - Anchors (#)
  - Email links (mailto:)
  - Data URIs (data:)
  - Template literals (${...})
  - JavaScript: protocol links
- Reports actual dead links with file and line reference

### Step 3: Report Statistics

Prints summary information:
```
Total guides: 262
Total tools: 6
Total files in pre-cache list: 274
Cache version: v5
```

## Output

### Success Output
```
==========================================
ZTH Survival App Build/Maintenance Script
==========================================

Step 1: Generating service worker cache list...
Cache version bumped: v4 -> v5
Generated 274 cache URLs

Step 2: Validating data files...
  Checking JSON validity...
    ✓ skills_data.json
    ✓ master-skills-db.json
    ✓ skills_merged.json
    ✓ salvage_data.json
  Checking salvage_data.json structure...
    ✓ salvage_data.json structure valid
  Checking guide file references...
    ✓ All guide file references valid
  Checking for dead links in guides...
    ✓ No dead links detected

Step 3: Reporting statistics...
  Total guides: 262
  Total tools: 6
  Total files in pre-cache list: 274
  Cache version: v5

==========================================
✓ Build completed successfully
==========================================
```

### Error Output
If validation errors are found, the script will:
1. List all errors found
2. Exit with code 1
3. Still update the cache (idempotent)

Example:
```
VALIDATION ERRORS FOUND: 2
  - Dead link in knowledge-preservation.html: oral-history.html
  - Dead link in cultural-practices-cohesion.html: medicine-midwifery.html
```

## Implementation Details

### Technology Stack
- **Bash** - Main script shell
- **Python 3** - Complex logic (JSON parsing, regex, file system operations)
- **Inline Python** - Uses heredoc syntax for easy maintenance

### Key Features
1. **Idempotent** - Safe to run multiple times without side effects
2. **Error Handling** - Validates all inputs before making changes
3. **Atomic Updates** - Only modifies `sw.js` when all checks pass
4. **Smart Filtering** - Avoids false positives in link detection
5. **Comprehensive Logging** - Clear feedback for each check

### File Modifications
- **Modified:** `sw.js` (CACHE_NAME version + PRE_CACHE_URLS array)
- **Created (temporary):** `/tmp/build_stats.json` (cache list and statistics)
- **Read-only:** All other files (no destructive operations)

## Integration

### CI/CD Pipeline
Add to pre-deploy validation:
```bash
if ! ./build.sh; then
  echo "Build validation failed"
  exit 1
fi
```

### Pre-commit Hook
Add to `.git/hooks/pre-commit`:
```bash
#!/bin/bash
./build.sh || exit 1
```

### Manual Usage
Run before deploying to production:
```bash
cd /sessions/clever-admiring-knuth/mnt/survival-app
./build.sh
# Review any errors and commit changes
git add sw.js
git commit -m "Update service worker cache"
```

## Troubleshooting

### Script reports JSON errors
**Issue:** Invalid JSON in a data file
**Solution:** Validate the JSON file syntax. Use an online JSON validator or `python3 -m json.tool`

### Script reports dead links
**Issue:** HTML files reference non-existent guides
**Solution:** Either create the missing guide file or update the HTML link to point to an existing guide

### Script fails to run
**Ensure:**
- Script is executable: `chmod +x build.sh`
- Python 3 is installed: `python3 --version`
- Running from the correct directory (project root)

## Performance
- Typical execution time: < 2 seconds
- Handles 260+ guides efficiently
- Minimal memory footprint

## Future Enhancements
- Optional CSS validation
- Image file validation
- JavaScript syntax checking
- Link preview validation
- Manifest.json validation
- PWA compliance checking
