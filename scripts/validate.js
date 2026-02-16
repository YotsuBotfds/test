#!/usr/bin/env node

/**
 * HTML Validation Script
 * Validates all guide HTML files for basic structure and consistency
 * Checks for broken internal links and missing guide entries
 *
 * Usage: node scripts/validate.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const guidesDir = path.join(projectRoot, 'guides');
const dataDir = path.join(projectRoot, 'data');
const guidesJsonPath = path.join(dataDir, 'guides.json');

let errors = [];
let warnings = [];
let validGuideCount = 0;

/**
 * Check if HTML file has basic valid structure
 * @param {string} filePath - Path to HTML file
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateHTMLStructure(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Check for DOCTYPE
    if (!content.includes('<!DOCTYPE html') && !content.includes('<!doctype html')) {
      return { valid: false, error: 'Missing DOCTYPE declaration' };
    }

    // Check for html tag
    if (!/<html[^>]*>/i.test(content)) {
      return { valid: false, error: 'Missing <html> tag' };
    }

    // Check for head tag
    if (!/<head[^>]*>/i.test(content)) {
      return { valid: false, error: 'Missing <head> tag' };
    }

    // Check for body tag
    if (!/<body[^>]*>/i.test(content)) {
      return { valid: false, error: 'Missing <body> tag' };
    }

    // Check for title tag
    if (!/<title[^>]*>/i.test(content)) {
      return { valid: false, error: 'Missing <title> tag' };
    }

    // Check for closing tags
    if (!/<\/html>/i.test(content)) {
      return { valid: false, error: 'Missing closing </html> tag' };
    }

    if (!/<\/body>/i.test(content)) {
      return { valid: false, error: 'Missing closing </body> tag' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Failed to read file: ${error.message}` };
  }
}

/**
 * Find broken internal links in HTML file
 * @param {string} filePath - Path to HTML file
 * @param {string} content - HTML content
 * @returns {Array} Array of broken link objects
 */
function findBrokenLinks(filePath, content) {
  const brokenLinks = [];
  const fileName = path.basename(filePath);

  // Find all href attributes
  const hrefRegex = /href=["']([^"']+)["']/g;
  let match;

  while ((match = hrefRegex.exec(content)) !== null) {
    const href = match[1];

    // Skip external links, anchors, and mailto
    if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) {
      continue;
    }

    // Skip data URIs
    if (href.startsWith('data:')) {
      continue;
    }

    // Skip template literals
    if (href.includes('${') || href.includes('}}')) {
      continue;
    }

    // Skip javascript: links
    if (href.startsWith('javascript:')) {
      continue;
    }

    // Resolve relative path
    let targetPath;
    if (href.startsWith('./')) {
      targetPath = path.join(projectRoot, href.substring(2));
    } else if (href.startsWith('../')) {
      targetPath = path.normalize(path.join(path.dirname(filePath), href));
    } else if (href.startsWith('/')) {
      targetPath = path.join(projectRoot, href.substring(1));
    } else {
      // Relative to guides directory
      targetPath = path.join(guidesDir, href);
    }

    // Check if target exists
    if (!fs.existsSync(targetPath)) {
      brokenLinks.push({ href, targetPath, fileName });
    }
  }

  return brokenLinks;
}

/**
 * Main validation routine
 */
function validate() {
  console.log('========================================');
  console.log('HTML Validation Script');
  console.log('========================================');
  console.log('');

  // Step 1: Check all guide HTML files exist and are valid
  console.log('Step 1: Validating guide HTML files...');

  if (!fs.existsSync(guidesDir)) {
    console.error(`ERROR: Guides directory not found: ${guidesDir}`);
    process.exit(1);
  }

  const htmlFiles = fs.readdirSync(guidesDir)
    .filter(f => f.endsWith('.html'))
    .sort();

  if (htmlFiles.length === 0) {
    errors.push('No HTML guide files found in guides/ directory');
    console.error('  ERROR: No HTML files found');
  } else {
    for (const file of htmlFiles) {
      const filePath = path.join(guidesDir, file);
      const validation = validateHTMLStructure(filePath);

      if (!validation.valid) {
        errors.push(`Invalid HTML structure in ${file}: ${validation.error}`);
        console.error(`  ✗ ${file}: ${validation.error}`);
      } else {
        validGuideCount++;
      }
    }

    console.log(`  ✓ Validated ${validGuideCount} guide files`);
  }

  // Step 2: Check for broken internal links
  console.log('');
  console.log('Step 2: Checking for broken internal links...');

  let totalBrokenLinks = [];
  for (const file of htmlFiles) {
    const filePath = path.join(guidesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const brokenLinks = findBrokenLinks(filePath, content);
    totalBrokenLinks = totalBrokenLinks.concat(brokenLinks);
  }

  if (totalBrokenLinks.length === 0) {
    console.log('  ✓ No broken internal links detected');
  } else {
    // Report only first 10 broken links to avoid spam
    const linksToReport = totalBrokenLinks.slice(0, 10);
    for (const link of linksToReport) {
      errors.push(`Broken link in ${link.fileName}: ${link.href}`);
      console.error(`  ✗ Broken link in ${link.fileName}: ${link.href}`);
    }

    if (totalBrokenLinks.length > 10) {
      console.error(`  ✗ ... and ${totalBrokenLinks.length - 10} more broken links`);
    }
  }

  // Step 3: Check guides.json references
  console.log('');
  console.log('Step 3: Checking guides.json consistency...');

  if (!fs.existsSync(guidesJsonPath)) {
    errors.push('guides.json file not found');
    console.error(`  ERROR: ${guidesJsonPath} not found`);
  } else {
    try {
      const guidesData = JSON.parse(fs.readFileSync(guidesJsonPath, 'utf8'));

      if (!Array.isArray(guidesData)) {
        errors.push('guides.json is not an array');
        console.error('  ERROR: guides.json is not an array');
      } else {
        const guidesInJson = new Set();
        const missingFiles = [];

        for (const guide of guidesData) {
          if (guide.url) {
            const guideFile = guide.url.replace('guides/', '');
            guidesInJson.add(guideFile);

            // Check if file exists
            const filePath = path.join(guidesDir, guideFile);
            if (!fs.existsSync(filePath)) {
              missingFiles.push(guide.url);
              errors.push(`Guide file missing: ${guide.url} (referenced by ${guide.title})`);
              console.error(`  ✗ Missing: ${guide.url}`);
            }
          }
        }

        // Check for HTML files not in guides.json
        const htmlFilesSet = new Set(htmlFiles);
        const orphanedFiles = [...htmlFilesSet].filter(f => !guidesInJson.has(f));

        if (orphanedFiles.length > 0) {
          for (const file of orphanedFiles) {
            warnings.push(`Guide file exists but not referenced in guides.json: ${file}`);
            console.warn(`  ⚠ Orphaned: ${file} (not in guides.json)`);
          }
        }

        if (missingFiles.length === 0 && orphanedFiles.length === 0) {
          console.log(`  ✓ guides.json references ${guidesInJson.size} guide files`);
          console.log(`  ✓ All referenced guides exist`);
        }
      }
    } catch (error) {
      errors.push(`Invalid JSON in guides.json: ${error.message}`);
      console.error(`  ERROR: Invalid JSON: ${error.message}`);
    }
  }

  // Step 4: Report summary
  console.log('');
  console.log('========================================');

  if (errors.length > 0) {
    console.error(`VALIDATION ERRORS: ${errors.length}`);
    errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${err}`);
    });
  }

  if (warnings.length > 0) {
    console.warn(`VALIDATION WARNINGS: ${warnings.length}`);
    warnings.forEach((warn, idx) => {
      console.warn(`  ${idx + 1}. ${warn}`);
    });
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✓ All validation checks passed');
    console.log('========================================');
    process.exit(0);
  } else if (errors.length === 0) {
    console.log('✓ No critical errors found (warnings only)');
    console.log('========================================');
    process.exit(0);
  } else {
    console.log('========================================');
    process.exit(1);
  }
}

// Run validation
validate();
