#!/usr/bin/env node

/**
 * Bundle Size Tracking Script
 * Measures key asset sizes and checks against budgets
 *
 * Budget Thresholds:
 *  - Core shell (HTML + CSS + JS): < 100 KB
 *  - Individual guide: < 200 KB
 *  - Total data directory: < 1 MB
 *  - Average guide: < 100 KB
 *
 * Exit codes:
 *  0 = all sizes within budget
 *  1 = one or more budgets exceeded
 *
 * Usage: node scripts/check-sizes.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const guidesDir = path.join(projectRoot, 'guides');
const cssDir = path.join(projectRoot, 'css');
const dataDir = path.join(projectRoot, 'data');
const jsDir = path.join(projectRoot, 'js');
const indexHtmlPath = path.join(projectRoot, 'index.html');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.statSync(filePath).size;
    }
  } catch (error) {
    // Ignore errors
  }
  return 0;
}

/**
 * Get directory size recursively
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        totalSize += getDirectorySize(filePath);
      } else {
        totalSize += stat.size;
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}: ${error.message}`);
  }

  return totalSize;
}

/**
 * Get all guide files and their sizes
 */
function getGuideSizes() {
  const guides = [];

  try {
    const files = fs.readdirSync(guidesDir);

    for (const file of files) {
      if (file.endsWith('.html')) {
        const filePath = path.join(guidesDir, file);
        const size = getFileSize(filePath);
        guides.push({
          name: file,
          size: size
        });
      }
    }
  } catch (error) {
    console.error(`Error reading guides directory: ${error.message}`);
  }

  return guides.sort((a, b) => b.size - a.size);
}

/**
 * Get all JavaScript files and their sizes
 */
function getJavaScriptSizes() {
  const jsFiles = [];

  try {
    if (fs.existsSync(jsDir)) {
      const files = fs.readdirSync(jsDir);

      for (const file of files) {
        if (file.endsWith('.js')) {
          const filePath = path.join(jsDir, file);
          const size = getFileSize(filePath);
          jsFiles.push({
            name: file,
            size: size
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error reading js directory: ${error.message}`);
  }

  return jsFiles.sort((a, b) => b.size - a.size);
}

/**
 * Color output based on budget compliance
 */
function colorizeSize(actual, budget) {
  if (actual > budget) {
    return `${colors.red}${formatBytes(actual)}${colors.reset}`;
  } else {
    return `${colors.green}${formatBytes(actual)}${colors.reset}`;
  }
}

/**
 * Check if size is within budget
 */
function isBudgetOk(actual, budget) {
  return actual <= budget;
}

/**
 * Print header
 */
function printHeader(text) {
  console.log('');
  console.log(`${colors.bold}${colors.cyan}${text}${colors.reset}`);
  console.log('-'.repeat(70));
}

/**
 * Main size check function
 */
function checkSizes() {
  console.log('');
  console.log('==========================================');
  console.log('Bundle Size Tracking');
  console.log('==========================================');

  let budgetExceeded = false;
  const budgets = {
    coreShell: 100 * 1024,      // 100 KB
    singleGuide: 200 * 1024,    // 200 KB
    avgGuide: 100 * 1024,       // 100 KB
    totalData: 1 * 1024 * 1024  // 1 MB
  };

  // ==================== CORE SHELL ====================
  printHeader('Core Shell (index.html + css + all js)');

  const indexSize = getFileSize(indexHtmlPath);
  const mainCssSize = getFileSize(path.join(cssDir, 'main.css'));
  const mainMinCssSize = getFileSize(path.join(cssDir, 'main.min.css'));

  const jsFiles = getJavaScriptSizes();
  const totalJsSize = jsFiles.reduce((sum, file) => sum + file.size, 0);

  // Use minified CSS if available, otherwise main CSS
  const cssSize = mainMinCssSize > 0 ? mainMinCssSize : mainCssSize;
  const coreShellSize = indexSize + cssSize + totalJsSize;

  console.log(`index.html:        ${formatBytes(indexSize)}`);
  console.log(`CSS (minified):    ${formatBytes(cssSize)}`);
  console.log(`JavaScript files:  ${formatBytes(totalJsSize)} (${jsFiles.length} files)`);
  console.log(`${colors.bold}Total Core Shell:  ${colorizeSize(coreShellSize, budgets.coreShell)}${colors.reset} / ${formatBytes(budgets.coreShell)}`);

  if (!isBudgetOk(coreShellSize, budgets.coreShell)) {
    budgetExceeded = true;
    console.log(`${colors.red}⚠ EXCEEDS BUDGET by ${formatBytes(coreShellSize - budgets.coreShell)}${colors.reset}`);
  } else {
    console.log(`${colors.green}✓ Within budget (${formatBytes(budgets.coreShell - coreShellSize)} remaining)${colors.reset}`);
  }

  // ==================== GUIDES ====================
  printHeader('Guide Files');

  const guides = getGuideSizes();

  if (guides.length === 0) {
    console.log('No guide files found');
  } else {
    // Calculate statistics
    const totalGuidesSize = guides.reduce((sum, g) => sum + g.size, 0);
    const avgGuideSize = totalGuidesSize / guides.length;
    const largestGuide = guides[0];
    const smallestGuide = guides[guides.length - 1];

    console.log(`Total guides:      ${guides.length}`);
    console.log(`Total size:        ${formatBytes(totalGuidesSize)}`);
    console.log(`Average size:      ${colorizeSize(avgGuideSize, budgets.avgGuide)} / ${formatBytes(budgets.avgGuide)}`);
    console.log(`Largest guide:     ${colorizeSize(largestGuide.size, budgets.singleGuide)} (${largestGuide.name})`);
    console.log(`Smallest guide:    ${formatBytes(smallestGuide.size)} (${smallestGuide.name})`);

    // Check average budget
    if (!isBudgetOk(avgGuideSize, budgets.avgGuide)) {
      budgetExceeded = true;
      console.log(`${colors.red}⚠ Average guide size EXCEEDS BUDGET${colors.reset}`);
    } else {
      console.log(`${colors.green}✓ Average guide within budget${colors.reset}`);
    }

    // Check largest guide budget
    if (!isBudgetOk(largestGuide.size, budgets.singleGuide)) {
      budgetExceeded = true;
      console.log(`${colors.red}⚠ Largest guide EXCEEDS BUDGET by ${formatBytes(largestGuide.size - budgets.singleGuide)}${colors.reset}`);
    } else {
      console.log(`${colors.green}✓ Largest guide within budget${colors.reset}`);
    }

    // List oversized guides
    const oversized = guides.filter(g => g.size > budgets.singleGuide);
    if (oversized.length > 0) {
      console.log(`\n${colors.yellow}Oversized guides (> ${formatBytes(budgets.singleGuide)}):${colors.reset}`);
      for (const guide of oversized.slice(0, 5)) {
        console.log(`  - ${guide.name}: ${colorizeSize(guide.size, budgets.singleGuide)}`);
      }
      if (oversized.length > 5) {
        console.log(`  ... and ${oversized.length - 5} more`);
      }
    }
  }

  // ==================== DATA DIRECTORY ====================
  printHeader('Data Directory');

  const totalDataSize = getDirectorySize(dataDir);

  console.log(`Total data size:   ${colorizeSize(totalDataSize, budgets.totalData)} / ${formatBytes(budgets.totalData)}`);

  if (!isBudgetOk(totalDataSize, budgets.totalData)) {
    budgetExceeded = true;
    console.log(`${colors.red}⚠ EXCEEDS BUDGET by ${formatBytes(totalDataSize - budgets.totalData)}${colors.reset}`);
  } else {
    console.log(`${colors.green}✓ Within budget (${formatBytes(budgets.totalData - totalDataSize)} remaining)${colors.reset}`);
  }

  // ==================== JAVASCRIPT BREAKDOWN ====================
  printHeader('JavaScript Files Breakdown');

  if (jsFiles.length === 0) {
    console.log('No JavaScript files found');
  } else {
    console.log(`${colors.bold}Top files:${colors.reset}`);
    for (const file of jsFiles.slice(0, 5)) {
      console.log(`  ${file.name.padEnd(30)} ${formatBytes(file.size)}`);
    }
    if (jsFiles.length > 5) {
      const remainingSize = jsFiles.slice(5).reduce((sum, f) => sum + f.size, 0);
      const remainingCount = jsFiles.length - 5;
      console.log(`  ${'... other files'.padEnd(30)} ${formatBytes(remainingSize)} (${remainingCount} files)`);
    }
  }

  // ==================== SUMMARY ====================
  console.log('');
  console.log('==========================================');
  console.log('Summary');
  console.log('==========================================');

  if (budgetExceeded) {
    console.log(`${colors.red}✗ One or more budgets exceeded${colors.reset}`);
    console.log('');
    console.log('Budget thresholds:');
    console.log(`  Core shell:      < ${formatBytes(budgets.coreShell)}`);
    console.log(`  Single guide:    < ${formatBytes(budgets.singleGuide)}`);
    console.log(`  Avg guide:       < ${formatBytes(budgets.avgGuide)}`);
    console.log(`  Total data:      < ${formatBytes(budgets.totalData)}`);
  } else {
    console.log(`${colors.green}✓ All budgets within limits${colors.reset}`);
  }

  console.log('==========================================');
  console.log('');

  return budgetExceeded ? 1 : 0;
}

// Run size checks
const exitCode = checkSizes();
process.exit(exitCode);
