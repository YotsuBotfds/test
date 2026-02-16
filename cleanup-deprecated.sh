#!/bin/bash
# ============================================================
# Cleanup Script: Remove Deprecated Files
# Run this script from the project root to delete files that
# have been stubbed out during the UX cleanup.
# ============================================================

set -e
echo "🧹 Zero to Hero — Deprecated Code Cleanup"
echo "==========================================="
echo ""

# --- JS MODULES (stubbed to empty exports) ---
echo "Removing deprecated JS modules..."
rm -v js/learning-paths.js
rm -v js/achievements.js
rm -v js/practice-mode.js
rm -v js/share.js
rm -v js/collections.js
rm -v js/collections-ui.js

# --- DIST VERSIONS (compiled/minified copies) ---
echo ""
echo "Removing deprecated dist files..."
rm -vf js/dist/learning-paths.js
rm -vf js/dist/achievements.js
rm -vf js/dist/practice-mode.js
rm -vf js/dist/share.js
rm -vf js/dist/collections.js
rm -vf js/dist/collections-ui.js

# --- TEST FILES ---
echo ""
echo "Removing deprecated test files..."
rm -vf tests/learning-paths.test.js
rm -vf tests/achievements.test.js
rm -vf tests/practice-mode.test.js
rm -vf tests/share.test.js
rm -vf tests/collections.test.js

# --- DATA FILES ---
echo ""
echo "Removing deprecated data files..."
rm -v data/learning-paths.json
rm -vf tools/data/learning-paths-data.json

# --- TOOL PAGES ---
echo ""
echo "Removing deprecated tool pages..."
rm -v tools/learning-paths.html
rm -v tools/achievements.html

# --- MERGED CORE MODULE GUIDE HTML FILES ---
# These 20 guides were merged into existing comprehensive guides.
# Their content is now covered by the merge targets listed below.
echo ""
echo "Removing merged core module HTML guides..."
echo "(Content merged into existing comprehensive guides)"

# SUR-01 Water Purification → merged into GD-035
rm -vf guides/sur-01-water-purification.html
# SUR-02 Fire Starting → merged into GD-031
rm -vf guides/sur-02-fire-starting.html
# SUR-03 Herbal Medicine → merged into GD-034
rm -vf guides/sur-03-herbal-medicine.html
# SUR-05 Sanitation & Hygiene → merged into GD-036
rm -vf guides/sur-05-sanitation-hygiene.html
# FOD-01 Food Preservation → merged into GD-065
rm -vf guides/fod-01-food-preservation.html
# FOD-02 Trapping & Hunting → merged into GD-154
rm -vf guides/fod-02-trapping-hunting.html
# FOD-03 Agriculture Basics → merged into GD-064
rm -vf guides/fod-03-agriculture-basics.html
# FOD-04 Animal Husbandry → merged into GD-067
rm -vf guides/fod-04-animal-husbandry.html
# CON-01 Shelter Building → merged into GD-094
rm -vf guides/con-01-shelter-building.html
# CON-02 Carpentry & Woodworking → merged into GD-094
rm -vf guides/con-02-carpentry-woodworking.html
# CON-03 Clay & Earthworks → merged into GD-109
rm -vf guides/con-03-clay-earthworks.html
# CON-04 Energy Systems → merged into GD-096
rm -vf guides/con-04-energy-systems.html
# CRA-01 Forging & Metalwork → merged into GD-120
rm -vf guides/cra-01-forging-metalwork.html
# CRA-02 Pottery & Ceramics → merged into GD-103
rm -vf guides/cra-02-pottery-ceramics.html
# CRA-03 Cordage & Textiles → merged into GD-128
rm -vf guides/cra-03-cordage-textiles.html
# CRA-04 Soap Making → merged into GD-129
rm -vf guides/cra-04-soap-making.html
# CRA-05 Weaving & Textiles → merged into GD-121
rm -vf guides/cra-05-weaving-textiles.html
# CRA-06 Knot Tying & Rigging → merged into GD-124
rm -vf guides/cra-06-knot-tying-rigging.html
# CRA-07 Primitive Weapons → merged into GD-150
rm -vf guides/cra-07-primitive-weapons.html
# COM-01 Community Governance → merged into GD-189
rm -vf guides/com-01-community-governance.html

# --- MINIFIED CSS (needs to be regenerated) ---
echo ""
echo "Removing stale minified CSS (regenerate from main.css)..."
rm -vf css/main.min.css

# --- STALE PLANNING FILE ---
rm -vf scavenging-content-upgrade-plan.js

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Summary:"
echo "  - 6 JS modules removed"
echo "  - 6 dist files removed"
echo "  - 5 test files removed"
echo "  - 2 data files removed"
echo "  - 2 tool pages removed"
echo "  - 20 merged guide HTML files removed"
echo "  - 1 stale CSS minified file removed"
echo ""
echo "NOTE: The service worker (sw.js) may need its file list"
echo "      updated to remove references to deleted files."
echo ""
echo "NOTE: localStorage keys that are now unused:"
echo "  - compendium-practice"
echo "  - compendium-achievements"
echo "  - compendium-collections"
echo "  - achievement-reading-dates"
echo "  - current-reading-streak"
echo "  Users can clear these manually or they will be ignored."
