#!/usr/bin/env node

/**
 * Assign Prerequisites to Guides
 * Analyzes guide titles, descriptions, and categories to establish logical
 * learning prerequisites based on skill progression and topic dependencies
 */

const fs = require('fs');
const path = require('path');

// Read guides.json
const guidesPath = path.join(__dirname, '../data/guides.json');
const guides = JSON.parse(fs.readFileSync(guidesPath, 'utf8'));

// Create lookup objects for faster searching
const guideMap = {};
guides.forEach(guide => {
  guideMap[guide.id] = guide;
});

/**
 * Extract keywords from text
 */
function extractKeywords(text = '') {
  return text.toLowerCase().split(/[\s,;:]+/).filter(w => w.length > 2);
}

/**
 * Find guides matching keyword patterns
 */
function findGuidesByKeywords(keywords, excludeId) {
  return guides.filter(g => {
    if (g.id === excludeId || !g.id || !g.title) return false;

    const text = `${g.title} ${g.description || ''}`.toLowerCase();
    return keywords.some(keyword => text.includes(keyword));
  });
}

/**
 * Find guides in same category prefix
 */
function findGuidesByCategoryPrefix(categoryPrefix, excludeId) {
  return guides.filter(g => {
    if (g.id === excludeId || !g.id) return false;
    return g.id.startsWith(categoryPrefix);
  });
}

/**
 * Determine if a guide is "basic" or "foundational"
 */
function isFoundational(guide) {
  if (!guide.id || !guide.title) return false;
  const text = `${guide.title} ${guide.description || ''}`.toLowerCase();
  return /\b(basic|fundamentals?|intro|introduction|essentials?|foundation)\b/.test(text);
}

/**
 * Determine difficulty level order
 */
function getDifficultyScore(difficulty) {
  const scores = {
    'beginner': 1,
    'intermediate': 2,
    'advanced': 3,
  };
  return scores[difficulty] || 2;
}

/**
 * Check for circular dependencies
 */
function hasCircularDependency(guideId, targetId, visited = new Set()) {
  if (guideId === targetId) return true;
  if (visited.has(guideId)) return false;

  visited.add(guideId);
  const guide = guideMap[guideId];

  if (!guide || !guide.prerequisites) return false;

  for (const prereqId of guide.prerequisites) {
    if (hasCircularDependency(prereqId, targetId, new Set(visited))) {
      return true;
    }
  }

  return false;
}

/**
 * Main prerequisite assignment logic
 */
function assignPrerequisites(guide) {
  if (!guide.id || !guide.title) return [];

  const prerequisites = [];
  const addedIds = new Set();

  // Helper to add a prerequisite (with circular dependency check)
  function addPrereq(guideId) {
    if (guideId && guideId !== guide.id && !addedIds.has(guideId)) {
      // Check if adding this prerequisite would create a circular dependency
      if (!hasCircularDependency(guideId, guide.id)) {
        prerequisites.push(guideId);
        addedIds.add(guideId);
      }
    }
  }

  const title = guide.title.toLowerCase();
  const description = (guide.description || '').toLowerCase();
  const combined = `${title} ${description}`;

  // Category-specific rules
  const guideId = guide.id;
  const categoryPrefix = guideId.substring(0, 3);

  // ===== SURVIVAL BASICS (SUR) =====
  if (categoryPrefix === 'SUR') {
    // Water Purification (SUR-01) - no prerequisites
    if (guideId === 'SUR-01') {
      // Foundation, no prereqs
    }
    // Fire Starting (SUR-02) - no prerequisites, but useful after water
    else if (guideId === 'SUR-02') {
      // Foundation, no prereqs
    }
    // Herbal Medicine (SUR-03) - requires Food Foraging for plant identification
    else if (guideId === 'SUR-03') {
      addPrereq('FOD-05'); // Food Foraging
    }
    // Navigation & Mapping (SUR-04) - no prerequisites
    else if (guideId === 'SUR-04') {
      // Foundation skill
    }
    // Sanitation & Hygiene (SUR-05) - requires Water Purification
    else if (guideId === 'SUR-05') {
      addPrereq('SUR-01'); // Water Purification
    }
  }

  // ===== FOOD PRODUCTION (FOD) =====
  else if (categoryPrefix === 'FOD') {
    // Food Preservation (FOD-01) - requires Trapping/Hunting or Agriculture
    if (guideId === 'FOD-01') {
      // Can come from either hunting or farming - add primary one
      addPrereq('FOD-02'); // Trapping & Hunting is more fundamental
    }
    // Trapping & Hunting (FOD-02) - foundational
    else if (guideId === 'FOD-02') {
      // Foundation
    }
    // Agriculture Basics (FOD-03) - no strict prereqs, but Soil Science helps
    else if (guideId === 'FOD-03') {
      // Foundation agriculture
    }
    // Animal Husbandry (FOD-04) - requires basic agriculture knowledge
    else if (guideId === 'FOD-04') {
      addPrereq('FOD-03'); // Agriculture Basics
    }
    // Food Foraging (FOD-05) - foundational
    else if (guideId === 'FOD-05') {
      // Foundation
    }
  }

  // ===== CONSTRUCTION (CON) =====
  else if (categoryPrefix === 'CON') {
    // Shelter Building (CON-01) - foundational survival
    if (guideId === 'CON-01') {
      // Foundation
    }
    // Carpentry & Woodworking (CON-02) - basic shelter building helps
    else if (guideId === 'CON-02') {
      addPrereq('CON-01'); // Shelter Building
    }
    // Clay & Earthworks (CON-03) - foundational
    else if (guideId === 'CON-03') {
      // Foundation
    }
    // Energy Systems (CON-04) - requires understanding of mechanics/basic building
    else if (guideId === 'CON-04') {
      addPrereq('CON-02'); // Carpentry foundation
    }
  }

  // ===== CRAFTS (CRA) =====
  else if (categoryPrefix === 'CRA') {
    // Forging & Metalwork (CRA-01) - requires fire and basic metalworking knowledge
    if (guideId === 'CRA-01') {
      addPrereq('SUR-02'); // Fire Starting
    }
    // Pottery & Ceramics (CRA-02) - requires Clay & Earthworks
    else if (guideId === 'CRA-02') {
      addPrereq('CON-03'); // Clay & Earthworks
    }
    // Cordage & Textiles (CRA-03) - foundational
    else if (guideId === 'CRA-03') {
      // Foundation
    }
    // Soap Making (CRA-04) - requires Sanitation & Hygiene awareness
    else if (guideId === 'CRA-04') {
      addPrereq('SUR-05'); // Sanitation & Hygiene
    }
    // Weaving & Textiles (CRA-05) - requires Cordage & Textiles foundation
    else if (guideId === 'CRA-05') {
      addPrereq('CRA-03'); // Cordage & Textiles
    }
    // Knot Tying & Rigging (CRA-06) - requires Cordage foundation
    else if (guideId === 'CRA-06') {
      addPrereq('CRA-03'); // Cordage & Textiles
    }
    // Primitive Weapons (CRA-07) - requires Forging & basic crafting
    else if (guideId === 'CRA-07') {
      addPrereq('CRA-01'); // Forging & Metalwork
    }
  }

  // ===== COMMUNITY (COM) =====
  else if (categoryPrefix === 'COM') {
    // Community Governance (COM-01) - no strict technical prerequisites
    if (guideId === 'COM-01') {
      // Social/governance foundation
    }
  }

  // ===== ADVANCED GUIDES (Non-core modules) =====
  // These are identified by longer IDs or specific patterns

  // Metalworking guides
  if (combined.includes('blacksmith') || combined.includes('forging') || combined.includes('steel')) {
    if (guideId !== 'CRA-01') {
      addPrereq('CRA-01'); // Forging & Metalwork
    }
    if (combined.includes('steel') && guideId !== 'CRA-01') {
      // Steel making requires bloomery furnace knowledge
      const bloomery = guides.find(g =>
        g.title && g.title.toLowerCase().includes('bloomery')
      );
      if (bloomery && bloomery.id) {
        addPrereq(bloomery.id);
      }
    }
  }

  // Electrical/Power generation guides
  if (combined.includes('electric') && !combined.includes('motor rewinding')) {
    // Find electricity basics guide
    const elecGuide = guides.find(g =>
      g.title && g.title.toLowerCase().includes('electricity') &&
      g.id !== guideId
    );
    if (elecGuide) {
      addPrereq(elecGuide.id);
    }
  }

  // Motor-related guides
  if (combined.includes('motor rewinding') || combined.includes('rewinding')) {
    // Motor rewinding requires electric motors understanding
    const motorGuide = guides.find(g =>
      g.title && g.title.toLowerCase().includes('electric motor') &&
      !g.title.toLowerCase().includes('rewinding') &&
      g.id !== guideId
    );
    if (motorGuide && motorGuide.id !== guideId) {
      addPrereq(motorGuide.id);
    }
  }

  // Textiles and fiber arts
  if (combined.includes('textile') || combined.includes('fiber')) {
    if (combined.includes('weav')) {
      addPrereq('CRA-03'); // Cordage & Textiles
    }
  }

  // Advanced agriculture
  if (combined.includes('breeding') || combined.includes('seed')) {
    addPrereq('FOD-03'); // Agriculture Basics
  }

  // Medical guides
  if (combined.includes('surgery') || combined.includes('operation')) {
    const firstAidGuide = guides.find(g =>
      g.title && g.title.toLowerCase().includes('first aid') &&
      g.id !== guideId
    );
    if (firstAidGuide) {
      addPrereq(firstAidGuide.id);
    }
  }

  // Water-related systems
  if (combined.includes('well') || combined.includes('water system')) {
    addPrereq('SUR-01'); // Water Purification
  }

  // Construction/building advanced topics
  if (combined.includes('bridge') || combined.includes('dam') || combined.includes('infrastructure')) {
    addPrereq('CON-02'); // Carpentry & Woodworking
  }

  // Tools and machine shops
  if (combined.includes('machine tool') || combined.includes('lathe') || combined.includes('shop')) {
    addPrereq('CRA-01'); // Forging & Metalwork (foundation)
  }

  // Weapons (advanced)
  if ((combined.includes('gunsmith') || combined.includes('firearm') || combined.includes('gun')) &&
      guideId !== 'CRA-07') {
    addPrereq('CRA-07'); // Primitive Weapons
  }

  // Navigation/astronomy
  if (combined.includes('astronomy') || combined.includes('celestial')) {
    addPrereq('SUR-04'); // Navigation & Mapping
  }

  // Fortifications and defense
  if (combined.includes('fortif') || (combined.includes('defense') && combined.includes('structure'))) {
    addPrereq('CON-01'); // Shelter Building
  }

  // Limit prerequisites to max 3
  if (prerequisites.length > 3) {
    prerequisites.length = 3;
  }

  return prerequisites;
}

/**
 * Main execution
 */
function main() {
  console.log(`\nAssigning prerequisites to ${guides.length} guides...\n`);

  let guideWithPrereqs = 0;
  const results = guides.map(guide => {
    const prerequisites = assignPrerequisites(guide);
    if (prerequisites.length > 0) {
      guideWithPrereqs++;
      guide.prerequisites = prerequisites;
    }
    return guide;
  });

  // Write updated guides.json
  fs.writeFileSync(guidesPath, JSON.stringify(results, null, 2) + '\n');

  // Print summary
  console.log(`✓ Successfully assigned prerequisites!`);
  console.log(`  Total guides: ${guides.length}`);
  console.log(`  Guides with prerequisites: ${guideWithPrereqs}`);
  console.log(`  Guides without prerequisites: ${guides.length - guideWithPrereqs}`);

  // Show some examples
  console.log('\nExample prerequisites assigned:');
  results
    .filter(g => g.prerequisites && g.prerequisites.length > 0)
    .slice(0, 10)
    .forEach(guide => {
      const prereqTitles = guide.prerequisites
        .map(id => {
          const prereq = guideMap[id];
          return prereq ? prereq.title : id;
        })
        .join(', ');
      console.log(`  ${guide.id}: ${guide.title}`);
      console.log(`    → Prerequisites: ${prereqTitles}`);
    });
}

main();
