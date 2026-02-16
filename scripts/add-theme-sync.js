#!/usr/bin/env node

/**
 * Script to add theme-sync.js reference to all guide pages
 *
 * This script:
 * 1. Scans all HTML files in guides/ directory
 * 2. Checks if theme-sync.js is already referenced
 * 3. Adds the script tag if missing
 *
 * Usage: node scripts/add-theme-sync.js
 */

const fs = require('fs');
const path = require('path');

const guidesDir = path.join(__dirname, '..', 'guides');
const themeScriptTag = '<script src="../shared/theme-sync.js"><\/script>';
const themeScriptTagRelative = '<script src="./theme-sync.js"><\/script>';

let filesUpdated = 0;
let filesSkipped = 0;
let errors = 0;

/**
 * Process a single HTML file
 */
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if theme-sync.js is already referenced
    if (content.includes('theme-sync.js')) {
      filesSkipped++;
      return;
    }

    // Find the </body> tag to insert the script before it
    const bodyCloseIndex = content.lastIndexOf('</body>');

    if (bodyCloseIndex === -1) {
      console.warn(`Warning: No </body> tag found in ${filePath}`);
      errors++;
      return;
    }

    // Insert the script tag before </body>
    const updatedContent =
      content.slice(0, bodyCloseIndex) +
      themeScriptTag +
      content.slice(bodyCloseIndex);

    fs.writeFileSync(filePath, updatedContent, 'utf8');
    filesUpdated++;
    console.log(`Updated: ${path.relative(guidesDir, filePath)}`);
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    errors++;
  }
}

/**
 * Recursively scan directory for HTML files
 */
function scanDirectory(dir) {
  try {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Skip css and other non-guide directories
        if (!file.startsWith('.') && file !== 'css' && file !== 'js') {
          scanDirectory(filePath);
        }
      } else if (file.endsWith('.html')) {
        processFile(filePath);
      }
    });
  } catch (err) {
    console.error(`Error scanning directory ${dir}:`, err.message);
    errors++;
  }
}

// Main execution
console.log('Adding theme-sync.js to guide pages...\n');
scanDirectory(guidesDir);

console.log('\n--- Summary ---');
console.log(`Updated: ${filesUpdated} files`);
console.log(`Skipped: ${filesSkipped} files (already have theme-sync.js)`);
console.log(`Errors: ${errors} files`);

if (errors === 0) {
  console.log('\nAll guide pages updated successfully!');
  process.exit(0);
} else {
  console.log('\nSome errors occurred. Please review above.');
  process.exit(1);
}
