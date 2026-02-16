#!/usr/bin/env node

/**
 * Assign Difficulty Ratings to Guides
 *
 * Assigns difficulty levels (beginner/intermediate/advanced) based on:
 * - Title keywords
 * - Category
 * - Heuristic patterns
 */

const fs = require('fs');
const path = require('path');

// Beginner guide keywords and patterns
const beginnerPatterns = [
  'survival basics',
  'fire starting',
  'fire by friction',
  'shelter',
  'shelter building',
  'water purification',
  'first aid',
  'first-aid',
  'foraging',
  'food foraging',
  'basic agriculture',
  'agriculture basics',
  'knots',
  'knot tying',
  'navigation basics',
  'sanitation',
  'hygiene',
  'fire\s+finding',
  'water\s+finding',
  'signaling',
];

// Advanced guide keywords and patterns
const advancedPatterns = [
  'vaccine',
  'vaccination',
  'immunization',
  'pharmaceutical',
  'drug\s+production',
  'medicine\s+production',
  'surgery',
  'surgical',
  'transplant',
  'transistor',
  'semiconductor',
  'computing',
  'computer',
  'cpu',
  'processor',
  'steam engine',
  'internal combustion',
  'internal-combustion',
  'petrol engine',
  'gasoline engine',
  'chemical synthesis',
  'chemical\s+weapon',
  'explosives',
  'nuclear',
  'radiation',
  'atomic',
  'ammonia synthesis',
  'nitrogen fixation',
  'advanced chemistry',
  'organic synthesis',
];

// Beginner categories
const beginnerCategories = [
  'survival-basics',
];

// Advanced categories
const advancedCategories = [
  'chemistry',
  'advanced-chemistry',
  'pharmaceuticals',
  'computing',
  'electronics',
];

/**
 * Determine difficulty based on title and category
 * @param {Object} guide - Guide object
 * @returns {string} Difficulty level: 'beginner', 'intermediate', or 'advanced'
 */
function assignDifficulty(guide) {
  const title = (guide.title || '').toLowerCase();
  const category = (guide.category || '').toLowerCase();

  // Check advanced patterns first (most specific)
  for (const pattern of advancedPatterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(title)) {
      return 'advanced';
    }
  }

  // Check advanced categories
  if (advancedCategories.some(cat => category.includes(cat))) {
    return 'advanced';
  }

  // Check beginner patterns
  for (const pattern of beginnerPatterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(title)) {
      return 'beginner';
    }
  }

  // Check beginner categories
  if (beginnerCategories.some(cat => category.includes(cat))) {
    return 'beginner';
  }

  // Default to intermediate for most guides
  return 'intermediate';
}

/**
 * Main function to assign difficulties
 */
function main() {
  const guidesPath = path.join(__dirname, '../data/guides.json');

  // Read guides.json
  console.log('Reading guides.json...');
  const guides = JSON.parse(fs.readFileSync(guidesPath, 'utf8'));

  // Count by difficulty for statistics
  const stats = {
    beginner: 0,
    intermediate: 0,
    advanced: 0,
  };

  // Assign difficulty to each guide
  guides.forEach((guide, index) => {
    const difficulty = assignDifficulty(guide);
    guide.difficulty = difficulty;
    stats[difficulty]++;

    if (index < 10) {
      console.log(`  ${guide.id || 'N/A'} | ${difficulty.padEnd(12)} | ${guide.title}`);
    }
  });

  // Write updated guides.json
  console.log('\nWriting updated guides.json...');
  fs.writeFileSync(
    guidesPath,
    JSON.stringify(guides, null, 2) + '\n',
    'utf8'
  );

  // Print statistics
  console.log('\nDifficulty Assignment Complete!');
  console.log('================================');
  console.log(`Beginner:      ${stats.beginner}`);
  console.log(`Intermediate:  ${stats.intermediate}`);
  console.log(`Advanced:      ${stats.advanced}`);
  console.log(`Total:         ${guides.length}`);
}

main();
