#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Clean guides.json manifest by removing entries whose files don't exist.
 * 
 * This script:
 * 1. Reads data/guides.json
 * 2. Checks each entry's `file` field against the filesystem
 * 3. Separates entries into valid and stale arrays
 * 4. Writes valid entries back to data/guides.json
 * 5. Writes stale entries to data/archived-manifest-entries.json for reference
 * 6. Prints a summary
 */

const baseDir = path.dirname(path.dirname(path.resolve(__filename)));
const guidesJsonPath = path.join(baseDir, 'data', 'guides.json');
const archivedJsonPath = path.join(baseDir, 'data', 'archived-manifest-entries.json');

console.log(`Base directory: ${baseDir}`);
console.log(`Reading: ${guidesJsonPath}`);

// Read the guides.json file
let guides;
try {
  const content = fs.readFileSync(guidesJsonPath, 'utf8');
  guides = JSON.parse(content);
} catch (err) {
  console.error(`Error reading guides.json: ${err.message}`);
  process.exit(1);
}

console.log(`\nTotal entries in manifest: ${guides.length}`);

// Separate valid and stale entries
const valid = [];
const stale = [];

guides.forEach((entry) => {
  const filePath = path.join(baseDir, entry.file);
  
  if (fs.existsSync(filePath)) {
    valid.push(entry);
  } else {
    stale.push(entry);
  }
});

console.log(`\nValidation results:`);
console.log(`  Valid entries (files exist): ${valid.length}`);
console.log(`  Stale entries (files missing): ${stale.length}`);

// Write valid entries back to guides.json
try {
  const validJson = JSON.stringify(valid, null, 2);
  fs.writeFileSync(guidesJsonPath, validJson, 'utf8');
  console.log(`\nWrote ${valid.length} valid entries to: ${guidesJsonPath}`);
} catch (err) {
  console.error(`Error writing guides.json: ${err.message}`);
  process.exit(1);
}

// Write stale entries to archived-manifest-entries.json for reference
try {
  const staleJson = JSON.stringify(stale, null, 2);
  fs.writeFileSync(archivedJsonPath, staleJson, 'utf8');
  console.log(`Wrote ${stale.length} archived entries to: ${archivedJsonPath}`);
} catch (err) {
  console.error(`Error writing archived-manifest-entries.json: ${err.message}`);
  process.exit(1);
}

// Print summary of stale entries
if (stale.length > 0) {
  console.log(`\nStale entries that were archived:`);
  stale.forEach((entry) => {
    console.log(`  - ${entry.file} (id: ${entry.id})`);
  });
}

console.log(`\nCleanup complete!`);
console.log(`Expected final count: 256 entries`);
console.log(`Actual final count: ${valid.length} entries`);
if (valid.length === 256) {
  console.log(`✓ Count verification PASSED`);
} else {
  console.log(`✗ Count verification FAILED (expected 256, got ${valid.length})`);
}
