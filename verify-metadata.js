#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const guides = require('./data/guides.json');
const requiredFields = ['id', 'title', 'category', 'tags', 'description', 'icon', 'file', 'difficulty', 'readingTime', 'lastUpdated', 'version'];

console.log('METADATA VERIFICATION REPORT\n');

let allValid = true;
let missingFields = {};

guides.forEach((guide, idx) => {
  requiredFields.forEach(field => {
    if (!(field in guide)) {
      allValid = false;
      if (!missingFields[field]) missingFields[field] = [];
      missingFields[field].push(`${guide.id || `[index ${idx}]`}`);
    }
  });
});

console.log(`Total guides: ${guides.length}`);
console.log(`Guides with complete metadata: ${allValid ? guides.length : guides.length - Object.keys(missingFields).length}`);

if (allValid) {
  console.log('\n✓ ALL GUIDES HAVE COMPLETE METADATA\n');
} else {
  console.log('\n✗ Some guides missing fields:');
  for (const [field, ids] of Object.entries(missingFields)) {
    console.log(`  ${field}: ${ids.length} guides`);
  }
}

// Check version uniformity
const versions = new Set(guides.map(g => g.version));
const lastUpdated = new Set(guides.map(g => g.lastUpdated));

console.log(`\nVersion uniformity: ${versions.size === 1 ? '✓' : '✗'}`);
console.log(`  Versions found: ${Array.from(versions).join(', ')}`);

console.log(`\nLastUpdated uniformity: ${lastUpdated.size === 1 ? '✓' : '✗'}`);
console.log(`  Dates found: ${Array.from(lastUpdated).join(', ')}`);

// Sample metadata structure
console.log(`\n\nSAMPLE METADATA ENTRY:\n`);
console.log(JSON.stringify(guides[0], null, 2));

// Show difficulty distribution
const difficulties = {};
guides.forEach(g => {
  difficulties[g.difficulty] = (difficulties[g.difficulty] || 0) + 1;
});

console.log(`\n\nDIFFICULTY DISTRIBUTION:`);
for (const [level, count] of Object.entries(difficulties)) {
  console.log(`  ${level}: ${count} guides`);
}

// Show category distribution
const categories = {};
guides.forEach(g => {
  categories[g.category] = (categories[g.category] || 0) + 1;
});

console.log(`\n\nCATEGORY DISTRIBUTION (top 10):`);
const topCategories = Object.entries(categories)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
topCategories.forEach(([cat, count]) => {
  console.log(`  ${cat}: ${count} guides`);
});
