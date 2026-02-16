#!/usr/bin/env node

/**
 * Master Build Orchestrator Script
 * Coordinates all build tasks for the survival app
 *
 * Tasks:
 *  1. Minify CSS (css/main.css -> css/main.min.css)
 *  2. Validate guides.json entry count matches guides/ file count
 *  3. Validate all guide HTML files exist and have valid structure
 *  4. Report build statistics (file counts, total sizes)
 *  5. Report dead links in guides.json and HTML files
 *  6. Clean up temporary files
 *
 * Usage: node scripts/build.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const guidesDir = path.join(projectRoot, 'guides');
const cssDir = path.join(projectRoot, 'css');
const dataDir = path.join(projectRoot, 'data');
const guidesJsonPath = path.join(dataDir, 'guides.json');
const jsDir = path.join(projectRoot, 'js');
const tempStatsFile = path.join('/tmp', 'build_stats.json');

let buildErrors = [];
let buildWarnings = [];
let stats = {
  startTime: Date.now(),
  htmlGuideFiles: 0,
  cssSize: 0,
  jsSize: 0,
  guidesInJson: 0,
  cachedFiles: 0,
  deadLinks: []
};

/**
 * Print section header
 */
function printHeader(title) {
  console.log('');
  console.log(`Step: ${title}`);
  console.log('-'.repeat(50));
}

/**
 * Run CSS minification
 */
function minifyCSS() {
  printHeader('Minifying CSS');

  try {
    const sourceCssPath = path.join(cssDir, 'main.css');
    const minifiedCssPath = path.join(cssDir, 'main.min.css');

    if (!fs.existsSync(sourceCssPath)) {
      buildErrors.push('main.css not found in css/ directory');
      console.error('✗ main.css not found');
      return false;
    }

    // Read and minify
    const sourceCss = fs.readFileSync(sourceCssPath, 'utf8');
    const minifiedCss = minifyCSS_Internal(sourceCss);

    const sourceSize = Buffer.byteLength(sourceCss, 'utf8');
    const minifiedSize = Buffer.byteLength(minifiedCss, 'utf8');
    const compression = ((1 - minifiedSize / sourceSize) * 100).toFixed(1);

    // Write minified CSS
    fs.writeFileSync(minifiedCssPath, minifiedCss, 'utf8');

    stats.cssSize = minifiedSize;

    console.log(`✓ CSS minified successfully`);
    console.log(`  Source: ${(sourceSize / 1024).toFixed(2)} KB`);
    console.log(`  Minified: ${(minifiedSize / 1024).toFixed(2)} KB`);
    console.log(`  Compression: ${compression}%`);

    return true;
  } catch (error) {
    buildErrors.push(`CSS minification failed: ${error.message}`);
    console.error(`✗ CSS minification failed: ${error.message}`);
    return false;
  }
}

/**
 * Internal CSS minification function
 */
function minifyCSS_Internal(css) {
  // Remove CSS comments
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove whitespace at start/end of lines
  css = css.replace(/^\s+|\s+$/gm, '');
  // Remove newlines
  css = css.replace(/\n/g, ' ');
  // Remove spaces around special characters
  css = css.replace(/\s*([{}:;,>+~])\s*/g, '$1');
  // Remove trailing semicolon before closing brace
  css = css.replace(/;}/g, '}');
  // Collapse multiple spaces
  css = css.replace(/\s+/g, ' ');
  // Trim final result
  return css.trim();
}

/**
 * Validate guides.json structure and consistency
 */
function validateGuidesJson() {
  printHeader('Validating guides.json');

  try {
    if (!fs.existsSync(guidesJsonPath)) {
      buildErrors.push('guides.json not found in data/ directory');
      console.error('✗ guides.json not found');
      return false;
    }

    const guidesData = JSON.parse(fs.readFileSync(guidesJsonPath, 'utf8'));

    if (!Array.isArray(guidesData)) {
      buildErrors.push('guides.json is not an array');
      console.error('✗ guides.json is not an array');
      return false;
    }

    stats.guidesInJson = guidesData.length;

    // Count actual HTML files
    const htmlFiles = fs.readdirSync(guidesDir)
      .filter(f => f.endsWith('.html'))
      .sort();

    stats.htmlGuideFiles = htmlFiles.length;

    // Check for mismatches
    if (guidesData.length !== htmlFiles.length) {
      const missing = guidesData.filter(g => {
        const file = g.url.replace('guides/', '');
        return !htmlFiles.includes(file);
      });

      const orphaned = htmlFiles.filter(f => {
        return !guidesData.some(g => g.url === `guides/${f}`);
      });

      if (missing.length > 0) {
        for (const guide of missing) {
          buildErrors.push(`Reference in guides.json points to missing file: ${guide.url}`);
        }
        console.error(`✗ ${missing.length} guide files referenced but missing`);
      }

      if (orphaned.length > 0) {
        for (const file of orphaned) {
          buildWarnings.push(`HTML file exists but not in guides.json: ${file}`);
        }
        console.warn(`⚠ ${orphaned.length} guide files not in guides.json`);
      }
    }

    // Validate structure of each entry
    let missingIds = 0;
    let missingTitles = 0;
    let missingUrls = 0;

    for (const guide of guidesData) {
      if (!guide.id || guide.id.trim() === '') {
        missingIds++;
      }
      if (!guide.title) {
        missingTitles++;
        buildWarnings.push(`Guide entry missing title`);
      }
      if (!guide.url) {
        missingUrls++;
        buildWarnings.push(`Guide missing url`);
      }
    }

    if (missingIds > 0) {
      buildWarnings.push(`${missingIds} guides missing id field`);
      console.warn(`⚠ ${missingIds} guides have missing or empty id field`);
    } else {
      console.log('✓ All guide entries have id field');
    }

    if (missingTitles > 0 || missingUrls > 0) {
      console.warn(`⚠ ${missingTitles} missing titles, ${missingUrls} missing urls`);
    } else {
      console.log('✓ All guide entries have title and url fields');
    }

    console.log(`✓ guides.json validated: ${guidesData.length} entries`);
    return true;
  } catch (error) {
    buildErrors.push(`Failed to validate guides.json: ${error.message}`);
    console.error(`✗ Validation failed: ${error.message}`);
    return false;
  }
}

/**
 * Validate HTML structure of all guide files
 */
function validateHTMLFiles() {
  printHeader('Validating HTML guide files');

  try {
    const htmlFiles = fs.readdirSync(guidesDir)
      .filter(f => f.endsWith('.html'))
      .sort();

    if (htmlFiles.length === 0) {
      buildErrors.push('No HTML guide files found in guides/ directory');
      console.error('✗ No HTML files found');
      return false;
    }

    let validCount = 0;
    let invalidCount = 0;

    for (const file of htmlFiles) {
      const filePath = path.join(guidesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Check basic structure
      const hasDoctype = /<!DOCTYPE html/i.test(content);
      const hasHtmlTag = /<html[^>]*>/i.test(content);
      const hasHead = /<head[^>]*>/i.test(content);
      const hasBody = /<body[^>]*>/i.test(content);
      const hasTitle = /<title[^>]*>/i.test(content);

      if (hasDoctype && hasHtmlTag && hasHead && hasBody && hasTitle) {
        validCount++;
      } else {
        invalidCount++;
        const missing = [];
        if (!hasDoctype) missing.push('DOCTYPE');
        if (!hasHtmlTag) missing.push('html tag');
        if (!hasHead) missing.push('head tag');
        if (!hasBody) missing.push('body tag');
        if (!hasTitle) missing.push('title tag');
        buildErrors.push(`Invalid HTML in ${file}: missing ${missing.join(', ')}`);
      }
    }

    console.log(`✓ Validated ${validCount} HTML files`);
    if (invalidCount > 0) {
      console.error(`✗ ${invalidCount} invalid HTML files`);
    }

    return invalidCount === 0;
  } catch (error) {
    buildErrors.push(`Failed to validate HTML files: ${error.message}`);
    console.error(`✗ Validation failed: ${error.message}`);
    return false;
  }
}

/**
 * Check for dead links in guides
 */
function checkDeadLinks() {
  printHeader('Checking for dead links');

  try {
    const htmlFiles = fs.readdirSync(guidesDir)
      .filter(f => f.endsWith('.html'))
      .sort();

    let totalBrokenLinks = [];

    for (const file of htmlFiles) {
      const filePath = path.join(guidesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Find all href attributes
      const hrefRegex = /href=["']([^"']+)["']/g;
      let match;

      while ((match = hrefRegex.exec(content)) !== null) {
        const href = match[1];

        // Skip external links, anchors, mailto, data URIs, javascript
        if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:') ||
            href.startsWith('data:') || href.startsWith('javascript:') || href.includes('${')) {
          continue;
        }

        // Resolve path
        let targetPath;
        if (href.startsWith('./')) {
          targetPath = path.join(projectRoot, href.substring(2));
        } else if (href.startsWith('../')) {
          // For relative paths like ../css/shared.css, resolve from guides directory
          targetPath = path.normalize(path.join(guidesDir, href));
        } else if (href.startsWith('/')) {
          targetPath = path.join(projectRoot, href.substring(1));
        } else {
          targetPath = path.join(guidesDir, href);
        }

        if (!fs.existsSync(targetPath)) {
          totalBrokenLinks.push({ file, href });
          buildWarnings.push(`Broken link in ${file}: ${href}`);
        }
      }
    }

    stats.deadLinks = totalBrokenLinks;

    if (totalBrokenLinks.length === 0) {
      console.log('✓ No dead links detected');
    } else {
      const toReport = totalBrokenLinks.slice(0, 10);
      for (const link of toReport) {
        console.warn(`⚠ Broken link in ${link.file}: ${link.href}`);
      }
      if (totalBrokenLinks.length > 10) {
        console.warn(`⚠ ... and ${totalBrokenLinks.length - 10} more broken links`);
      }
    }

    return true; // Don't fail build on dead links - just warn
  } catch (error) {
    buildWarnings.push(`Could not check dead links: ${error.message}`);
    console.warn(`⚠ Dead link check failed: ${error.message}`);
    return true; // Don't fail build on this
  }
}

/**
 * Check bundle sizes against budgets
 */
function checkBundleSizes() {
  printHeader('Checking Bundle Sizes');

  try {
    const { execSync } = require('child_process');
    const result = execSync('node scripts/check-sizes.js', {
      cwd: projectRoot,
      encoding: 'utf8'
    });
    console.log(result);
    return true;
  } catch (error) {
    // check-sizes.js may exit with code 1 if budgets are exceeded
    // We still want to show the output, but don't fail the build on this
    console.log(error.stdout || error.message);
    buildWarnings.push('One or more bundle size budgets exceeded');
    return true; // Don't fail build on size warnings
  }
}

/**
 * Gather build statistics
 */
function gatherStatistics() {
  printHeader('Build Statistics');

  try {
    // Count and size JS files
    let jsFiles = 0;
    let totalJsSize = 0;
    if (fs.existsSync(jsDir)) {
      const files = fs.readdirSync(jsDir);
      jsFiles = files.length;
      for (const file of files) {
        const filePath = path.join(jsDir, file);
        const stat = fs.statSync(filePath);
        totalJsSize += stat.size;
      }
    }

    stats.jsSize = totalJsSize;

    // Count cached files (from old build.sh logic)
    let cachedCount = 0;
    const dirsToCount = ['guides', 'tools', 'data', 'assets', 'shared'];
    for (const dirName of dirsToCount) {
      const dirPath = path.join(projectRoot, dirName);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        cachedCount += files.length;
      }
    }

    stats.cachedFiles = cachedCount;

    console.log(`HTML Guide Files: ${stats.htmlGuideFiles}`);
    console.log(`Guides in guides.json: ${stats.guidesInJson}`);
    console.log(`JavaScript Files: ${jsFiles} (${(totalJsSize / 1024).toFixed(2)} KB)`);
    console.log(`CSS Minified Size: ${(stats.cssSize / 1024).toFixed(2)} KB`);
    console.log(`Total Cached Files: ${stats.cachedFiles}`);
    console.log(`Dead Links Detected: ${stats.deadLinks.length}`);

  } catch (error) {
    console.warn(`⚠ Could not gather all statistics: ${error.message}`);
  }
}

/**
 * Clean up temporary files
 */
function cleanup() {
  try {
    if (fs.existsSync(tempStatsFile)) {
      fs.unlinkSync(tempStatsFile);
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Main build process
 */
function build() {
  console.log('==========================================');
  console.log('Build Pipeline - Master Orchestrator');
  console.log('==========================================');

  // Run all build tasks
  const tasks = [
    { name: 'CSS Minification', fn: minifyCSS },
    { name: 'guides.json Validation', fn: validateGuidesJson },
    { name: 'HTML Structure Validation', fn: validateHTMLFiles },
    { name: 'Dead Link Detection', fn: checkDeadLinks },
    { name: 'Bundle Size Check', fn: checkBundleSizes }
  ];

  let successCount = 0;
  for (const task of tasks) {
    const result = task.fn();
    if (result) successCount++;
  }

  // Gather statistics
  gatherStatistics();

  // Print summary
  console.log('');
  console.log('==========================================');
  console.log('Build Summary');
  console.log('==========================================');

  if (buildErrors.length > 0) {
    console.error(`ERROR: ${buildErrors.length} critical issues found`);
    buildErrors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${err}`);
    });
  }

  if (buildWarnings.length > 0) {
    console.warn(`WARNING: ${buildWarnings.length} warnings`);
    buildWarnings.slice(0, 5).forEach((warn, idx) => {
      console.warn(`  ${idx + 1}. ${warn}`);
    });
    if (buildWarnings.length > 5) {
      console.warn(`  ... and ${buildWarnings.length - 5} more warnings`);
    }
  }

  console.log('');

  if (buildErrors.length === 0) {
    console.log('✓ Build completed successfully');
    console.log(`  Tasks completed: ${successCount}/${tasks.length}`);
    console.log(`  Build time: ${Date.now() - stats.startTime}ms`);
    console.log('==========================================');
    cleanup();
    process.exit(0);
  } else {
    console.error('✗ Build failed with errors');
    console.log('==========================================');
    cleanup();
    process.exit(1);
  }
}

// Start build
build();
