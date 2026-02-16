#!/usr/bin/env python3
"""
Add relatedSpreadsheet field to guides.json entries that match spreadsheet topics.
This script maps guides to spreadsheets based on keyword matching.
"""

import json
from pathlib import Path

# Mapping of spreadsheet names to keywords and descriptions
SPREADSHEET_KEYWORDS = {
    'climate-terrain-guide.json': {
        'keywords': ['climate', 'terrain', 'environment', 'weather', 'geography', 'location', 'biome', 'landscape'],
        'guides': ['GD-024', 'GD-025', 'GD-026', 'GD-027', 'GD-028', 'GD-029', 'GD-030', 'GD-031']
    },
    'failure-troubleshooting.json': {
        'keywords': ['failure', 'troubleshooting', 'problem', 'error', 'issue', 'fix', 'repair', 'malfunction', 'debug'],
        'guides': ['CON-02', 'CON-03', 'CON-04', 'CRA-01', 'CRA-02']
    },
    'materials-checklists.json': {
        'keywords': ['materials', 'checklist', 'supplies', 'items', 'equipment', 'gear', 'list', 'inventory', 'building', 'crafting'],
        'guides': ['CON-01', 'CON-02', 'CON-03', 'CRA-01', 'CRA-02', 'CRA-03', 'CRA-04', 'CRA-05', 'CRA-06', 'CRA-07']
    },
    'resource-database.json': {
        'keywords': ['resource', 'database', 'material', 'supply', 'available', 'inventory'],
        'guides': ['GD-032', 'GD-033']
    },
    'salvage_variants_master.json': {
        'keywords': ['salvage', 'variant', 'scrap', 'repurpose', 'recycle', 'reuse', 'waste'],
        'guides': ['GD-034', 'GD-035']
    },
    'scenario-plans.json': {
        'keywords': ['scenario', 'plan', 'planning', 'strategy', 'preparation', 'disaster', 'emergency'],
        'guides': ['GD-023', 'COM-01']
    },
    'seasonal-calendar.json': {
        'keywords': ['seasonal', 'calendar', 'season', 'spring', 'summer', 'fall', 'winter', 'weather', 'timing'],
        'guides': ['FOD-01', 'FOD-03', 'FOD-04', 'FOD-05', 'GD-024']
    },
    'threat-risk-matrix.json': {
        'keywords': ['threat', 'risk', 'danger', 'hazard', 'security', 'assessment', 'evaluation'],
        'guides': ['GD-036', 'GD-037']
    },
    'trade-barter-guide.json': {
        'keywords': ['trade', 'barter', 'exchange', 'commerce', 'economy', 'transaction', 'negotiation'],
        'guides': ['COM-01', 'GD-038']
    }
}

def get_spreadsheet_for_guide(guide_id, guide_title, guide_description):
    """
    Find best matching spreadsheet(s) for a guide based on keywords.
    Returns list of matching spreadsheets.
    """
    text = (guide_title + ' ' + guide_description).lower()
    matches = []

    for spreadsheet, info in SPREADSHEET_KEYWORDS.items():
        # Check explicit guide mapping first
        if guide_id in info.get('guides', []):
            matches.append(spreadsheet)
            continue

        # Check keyword matching
        keyword_matches = sum(1 for keyword in info['keywords'] if keyword in text)
        if keyword_matches >= 2:  # Require at least 2 keyword matches
            matches.append(spreadsheet)

    return matches[0] if matches else None  # Return first match or None

def main():
    """Main function to add spreadsheet links to guides."""

    app_root = Path(__file__).parent.parent
    guides_path = app_root / 'data' / 'guides.json'

    # Read guides
    with open(guides_path, 'r', encoding='utf-8') as f:
        guides = json.load(f)

    # Track changes
    added_count = 0
    updated_guides = []

    # Process each guide
    for guide in guides:
        guide_id = guide.get('id', '')
        guide_title = guide.get('title', '')
        guide_description = guide.get('description', '')

        # Find matching spreadsheet
        spreadsheet = get_spreadsheet_for_guide(guide_id, guide_title, guide_description)

        if spreadsheet:
            guide['relatedSpreadsheet'] = spreadsheet
            added_count += 1
            updated_guides.append({
                'id': guide_id,
                'title': guide_title,
                'spreadsheet': spreadsheet
            })

    # Write updated guides back
    with open(guides_path, 'w', encoding='utf-8') as f:
        json.dump(guides, f, indent=2, ensure_ascii=False)

    print(f"Added relatedSpreadsheet to {added_count} guides")
    print("-" * 60)
    print("Sample mappings:")
    for item in updated_guides[:10]:
        print(f"  {item['id']}: {item['title']}")
        print(f"    -> {item['spreadsheet']}")
    print()
    print(f"Guides file updated: {guides_path}")

if __name__ == "__main__":
    main()
