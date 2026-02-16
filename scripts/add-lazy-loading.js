#!/usr/bin/env node

/**
 * Add lazy loading to guide images
 * Adds loading="lazy" attribute to img tags in guide HTML files
 *
 * Usage: node scripts/add-lazy-loading.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const guidesDir = path.join(projectRoot, 'guides');

/**
 * Add loading="lazy" to img tags that don't already have it
 * @param {string} htmlContent - Raw HTML content
 * @returns {string} Modified HTML content with lazy loading
 */
function addLazyLoading(htmlContent) {
  // Match img tags but avoid ones that already have loading attribute
  // This regex looks for <img tags that don't already have loading attribute
  const imgRegex = /<img([^>]*?)(?<!loading\s*=\s*['"]\w+['"]\s)>/g;

  let modifiedContent = htmlContent;
  let matches = 0;

  // Replace all img tags without loading attribute
  modifiedContent = modifiedContent.replace(imgRegex, (match) => {
    // Check if the img tag already has a loading attribute
    if (/loading\s*=\s*['"][^'"]*['"]/.test(match)) {
      return match;
    }

    // Add loading="lazy" before the closing >
    matches++;
    return match.replace(/\>$/, ' loading="lazy">');
  });

  return { content: modifiedContent, count: matches };
}

/**
 * Process all guide HTML files
 */
async function processGuides() {
  try {
    // Get all .html files from guides/ directory
    const files = fs.readdirSync(guidesDir).filter(file => {
      const fullPath = path.join(guidesDir, file);
      return fs.statSync(fullPath).isFile() && file.endsWith('.html');
    });

    if (files.length === 0) {
      console.log('No HTML guide files found in guides/ directory');
      return;
    }

    console.log(`Processing ${files.length} guide HTML files\n`);

    let totalImagesModified = 0;
    const results = [];

    // Process each file
    for (const file of files) {
      const guidePath = path.join(guidesDir, file);

      try {
        // Read the guide file
        const htmlContent = fs.readFileSync(guidePath, 'utf8');

        // Add lazy loading
        const { content: modifiedContent, count: imagesAdded } = addLazyLoading(htmlContent);

        // Only write if changes were made
        if (imagesAdded > 0) {
          fs.writeFileSync(guidePath, modifiedContent, 'utf8');
          totalImagesModified += imagesAdded;

          results.push({
            file,
            imagesModified: imagesAdded,
          });

          console.log(`✓ ${file.padEnd(40)} ${imagesAdded} image(s) updated`);
        } else {
          // Still log files with no images (for transparency)
          console.log(`• ${file.padEnd(40)} no images to update`);
        }
      } catch (error) {
        console.error(`✗ Error processing ${file}: ${error.message}`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('LAZY LOADING SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total files processed: ${files.length}`);
    console.log(`Files with images updated: ${results.length}`);
    console.log(`Total images modified: ${totalImagesModified}`);
    console.log('\nLazy loading attributes added to guide images.');
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the script
processGuides();
