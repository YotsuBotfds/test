#!/bin/bash

# Build/Maintenance Script for ZTH Survival App
# This script:
#   1. Generates the service worker cache list
#   2. Validates data files
#   3. Reports statistics

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "ZTH Survival App Build/Maintenance Script"
echo "=========================================="
echo ""

# ============================================================================
# Step 1: Generate PRE_CACHE_URLS for service worker
# ============================================================================
echo "Step 1: Generating service worker cache list..."

python3 << 'PYEOF'
import os
import json
import re
from pathlib import Path

# Get the current directory
base_dir = os.getcwd()

# Collect all files to cache
cache_urls = []

# 1. Always include index.html, manifest.json, sw.js
cache_urls.append('./index.html')
cache_urls.append('./manifest.json')
cache_urls.append('./sw.js')

# 2. Find all .html files in guides/
guides_dir = os.path.join(base_dir, 'guides')
if os.path.isdir(guides_dir):
    for filename in os.listdir(guides_dir):
        if filename.endswith('.html'):
            cache_urls.append(f'./guides/{filename}')

# 3. Find all .html files in tools/
tools_dir = os.path.join(base_dir, 'tools')
if os.path.isdir(tools_dir):
    for filename in os.listdir(tools_dir):
        if filename.endswith('.html'):
            cache_urls.append(f'./tools/{filename}')

# 4. Find all files in data/
data_dir = os.path.join(base_dir, 'data')
if os.path.isdir(data_dir):
    for filename in os.listdir(data_dir):
        if os.path.isfile(os.path.join(data_dir, filename)):
            cache_urls.append(f'./data/{filename}')

# 5. Find all files in assets/
assets_dir = os.path.join(base_dir, 'assets')
if os.path.isdir(assets_dir):
    for filename in os.listdir(assets_dir):
        if os.path.isfile(os.path.join(assets_dir, filename)):
            cache_urls.append(f'./assets/{filename}')

# 6. Find all files in shared/
shared_dir = os.path.join(base_dir, 'shared')
if os.path.isdir(shared_dir):
    for filename in os.listdir(shared_dir):
        if os.path.isfile(os.path.join(shared_dir, filename)):
            cache_urls.append(f'./shared/{filename}')

# 7. Find css files (from guides/css/ and any other css directories)
guides_css_dir = os.path.join(guides_dir, 'css')
if os.path.isdir(guides_css_dir):
    for filename in os.listdir(guides_css_dir):
        if os.path.isfile(os.path.join(guides_css_dir, filename)):
            cache_urls.append(f'./guides/css/{filename}')

# Remove duplicates and sort
cache_urls = sorted(list(set(cache_urls)))

# Read the current sw.js to find the current cache version
sw_path = os.path.join(base_dir, 'sw.js')
with open(sw_path, 'r') as f:
    sw_content = f.read()

# Extract current cache version
version_match = re.search(r"const CACHE_NAME = 'zth-survival-v(\d+)'", sw_content)
if version_match:
    current_version = int(version_match.group(1))
    new_version = current_version + 1
else:
    new_version = 2

# Generate the new PRE_CACHE_URLS array
new_cache_array = "const CACHE_NAME = 'zth-survival-v" + str(new_version) + "';\n"
new_cache_array += "const PRE_CACHE_URLS = [\n"
for url in cache_urls:
    new_cache_array += f"  '{url}',\n"
new_cache_array += "];\n"

# Replace the PRE_CACHE_URLS in sw.js
# Find and replace the CACHE_NAME and PRE_CACHE_URLS section
pattern = r"const CACHE_NAME = 'zth-survival-v\d+';\nconst PRE_CACHE_URLS = \[[\s\S]*?\];\n"
updated_sw_content = re.sub(pattern, new_cache_array, sw_content)

# Write back to sw.js
with open(sw_path, 'w') as f:
    f.write(updated_sw_content)

print(f"Cache version bumped: v{current_version} -> v{new_version}")
print(f"Generated {len(cache_urls)} cache URLs")

# Store stats for later
stats = {
    'cache_count': len(cache_urls),
    'new_version': new_version,
    'cache_urls': cache_urls
}

# Write stats to temp file for bash to read
import tempfile
stats_file = os.path.join(tempfile.gettempdir(), f'build_stats_{os.getpid()}.json')
with open(stats_file, 'w') as f:
    json.dump(stats, f)

PYEOF

# ============================================================================
# Step 2: Validate data files
# ============================================================================
echo ""
echo "Step 2: Validating data files..."

VALIDATION_ERRORS=0

python3 << 'PYEOF'
import os
import json
from pathlib import Path
import sys

base_dir = os.getcwd()
validation_errors = []

# 1. Check that all JSON files in data/ are valid JSON
print("  Checking JSON validity...")
data_dir = os.path.join(base_dir, 'data')
if os.path.isdir(data_dir):
    for filename in os.listdir(data_dir):
        if filename.endswith('.json'):
            filepath = os.path.join(data_dir, filename)
            try:
                with open(filepath, 'r') as f:
                    json.load(f)
                print(f"    ✓ {filename}")
            except json.JSONDecodeError as e:
                error_msg = f"Invalid JSON in {filename}: {str(e)}"
                validation_errors.append(error_msg)
                print(f"    ✗ {error_msg}")

# 2. (Removed) salvage_data.json validation — file deprecated, salvage data now in skills_merged.json

# 3. Check that all guide files referenced in master-skills-db.json exist
print("  Checking guide file references...")
master_db_path = os.path.join(data_dir, 'master-skills-db.json')
if os.path.isfile(master_db_path):
    try:
        with open(master_db_path, 'r') as f:
            master_db = json.load(f)
        
        guides_dir = os.path.join(base_dir, 'guides')
        missing_guides = []
        
        # Handle both list and dict formats
        items_to_check = []
        if isinstance(master_db, list):
            items_to_check = master_db
        elif isinstance(master_db, dict):
            # Could be a dict with skills or other structure
            # Try to extract items that have guide_file
            def extract_items_with_guides(obj):
                items = []
                if isinstance(obj, dict):
                    for key, val in obj.items():
                        if isinstance(val, dict):
                            if 'guide_file' in val:
                                items.append(val)
                            items.extend(extract_items_with_guides(val))
                        elif isinstance(val, list):
                            items.extend(extract_items_with_guides(val))
                elif isinstance(obj, list):
                    for item in obj:
                        items.extend(extract_items_with_guides(item))
                return items
            
            items_to_check = extract_items_with_guides(master_db)
        
        for skill in items_to_check:
            if isinstance(skill, dict) and 'guide_file' in skill and skill['guide_file']:
                guide_file = skill['guide_file']
                # Normalize path
                if not guide_file.startswith('./'):
                    guide_file = './' + guide_file
                
                # Remove the './' prefix for file checking
                file_to_check = guide_file.lstrip('./')
                full_path = os.path.join(base_dir, file_to_check)
                
                if not os.path.isfile(full_path):
                    missing_guides.append((skill.get('name', 'Unknown'), guide_file))
        
        if missing_guides:
            for skill_name, guide_file in missing_guides:
                error_msg = f"Referenced guide missing: {guide_file} (from skill: {skill_name})"
                validation_errors.append(error_msg)
                print(f"    ✗ {error_msg}")
        else:
            print("    ✓ All guide file references valid")
    except Exception as e:
        error_msg = f"Error validating master-skills-db.json: {str(e)}"
        validation_errors.append(error_msg)
        print(f"    ✗ {error_msg}")

# 4. Check for dead links in guide HTML files (smarter checking)
print("  Checking for dead links in guides...")
import re

guides_dir = os.path.join(base_dir, 'guides')
dead_links = []

if os.path.isdir(guides_dir):
    for filename in os.listdir(guides_dir):
        if filename.endswith('.html'):
            filepath = os.path.join(guides_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                # Find all href attributes
                href_pattern = r'href=["\']([^"\']+)["\']'
                hrefs = re.findall(href_pattern, content)
                
                for href in hrefs:
                    # Skip external links and anchors
                    if href.startswith('http') or href.startswith('#') or href.startswith('mailto:'):
                        continue
                    
                    # Skip data URIs
                    if href.startswith('data:'):
                        continue
                    
                    # Skip template literals (${...})
                    if '${' in href or '}' in href:
                        continue
                    
                    # Skip javascript: links
                    if href.startswith('javascript:'):
                        continue
                    
                    # Handle CSS files from guides directory
                    if href == '../css/shared.css':
                        # Check if it exists in guides/css/
                        css_path = os.path.join(guides_dir, 'css', 'shared.css')
                        if not os.path.exists(css_path):
                            dead_links.append((filename, href, css_path))
                        continue
                    
                    # Resolve relative path
                    if href.startswith('./'):
                        target_path = os.path.join(base_dir, href.lstrip('./'))
                    elif href.startswith('../'):
                        target_path = os.path.normpath(os.path.join(os.path.dirname(filepath), href))
                    else:
                        # Relative to guides directory
                        target_path = os.path.join(guides_dir, href)
                    
                    if not os.path.exists(target_path):
                        dead_links.append((filename, href, target_path))
            except Exception as e:
                print(f"    ! Could not read {filename}: {str(e)}")
    
    if dead_links:
        # Only report first 10 dead links to avoid spam
        for filename, href, target in dead_links[:10]:
            error_msg = f"Dead link in {filename}: {href}"
            validation_errors.append(error_msg)
            print(f"    ✗ {error_msg}")
        
        if len(dead_links) > 10:
            print(f"    ✗ ... and {len(dead_links) - 10} more dead links")
    else:
        print("    ✓ No dead links detected")

# Summary
print("")
if validation_errors:
    print(f"VALIDATION ERRORS FOUND: {len(validation_errors)}")
    for error in validation_errors:
        print(f"  - {error}")
    sys.exit(1)
else:
    print("✓ All validation checks passed")
    sys.exit(0)

PYEOF

VALIDATION_RESULT=$?

# ============================================================================
# Step 3: Report statistics
# ============================================================================
echo ""
echo "Step 3: Reporting statistics..."

python3 << 'PYEOF'
import json
import os

base_dir = os.getcwd()

# Load stats from file
import tempfile
import glob
stats = {}
try:
    # Find the most recent build_stats file for this session
    pattern = os.path.join(tempfile.gettempdir(), 'build_stats_*.json')
    stats_files = sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True)
    if stats_files:
        with open(stats_files[0], 'r') as f:
            stats = json.load(f)
except:
    pass

# Count guides
guides_dir = os.path.join(base_dir, 'guides')
guide_count = 0
if os.path.isdir(guides_dir):
    guide_count = len([f for f in os.listdir(guides_dir) if f.endswith('.html')])

# Count tools
tools_dir = os.path.join(base_dir, 'tools')
tool_count = 0
if os.path.isdir(tools_dir):
    tool_count = len([f for f in os.listdir(tools_dir) if f.endswith('.html')])

# Print statistics
print(f"  Total guides: {guide_count}")
print(f"  Total tools: {tool_count}")
print(f"  Total files in pre-cache list: {stats.get('cache_count', '?')}")
print(f"  Cache version: v{stats.get('new_version', '?')}")

PYEOF

echo ""
echo "=========================================="
if [ $VALIDATION_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ Build completed successfully${NC}"
else
    echo -e "${RED}✗ Build completed with validation errors${NC}"
    exit 1
fi
echo "=========================================="

