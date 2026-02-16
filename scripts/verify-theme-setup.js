#!/usr/bin/env node

/**
 * Verification Script for Dark Mode Setup
 *
 * This script verifies that:
 * 1. All guide pages reference theme-sync.js
 * 2. shared.css has proper light/dark theme variables
 * 3. theme-sync.js file exists and is properly formatted
 *
 * Usage: node scripts/verify-theme-setup.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const errors = [];

function test(description, fn) {
  try {
    fn();
    console.log(`✓ ${description}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${description}`);
    console.log(`  Error: ${err.message}`);
    errors.push(`${description}: ${err.message}`);
    failed++;
  }
}

// Test 1: theme-sync.js file exists
test('theme-sync.js file exists', () => {
  const filePath = path.join(__dirname, '..', 'shared', 'theme-sync.js');
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }
});

// Test 2: theme-sync.js contains localStorage logic
test('theme-sync.js contains localStorage logic', () => {
  const filePath = path.join(__dirname, '..', 'shared', 'theme-sync.js');
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('localStorage') || !content.includes('compendium-theme')) {
    throw new Error('Missing localStorage or compendium-theme reference');
  }
});

// Test 3: theme-sync.js contains theme toggle function
test('theme-sync.js contains toggleTheme function', () => {
  const filePath = path.join(__dirname, '..', 'shared', 'theme-sync.js');
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('function toggleTheme')) {
    throw new Error('toggleTheme function not found');
  }
});

// Test 4: theme-sync.js sets data-theme attribute
test('theme-sync.js applies data-theme attribute', () => {
  const filePath = path.join(__dirname, '..', 'shared', 'theme-sync.js');
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('data-theme')) {
    throw new Error('data-theme attribute not found');
  }
});

// Test 5: shared.css has light theme selector
test('shared.css has [data-theme="light"] selector', () => {
  const filePath = path.join(__dirname, '..', 'guides', 'css', 'shared.css');
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('[data-theme="light"]')) {
    throw new Error('[data-theme="light"] selector not found');
  }
});

// Test 6: shared.css light theme has proper variables
test('shared.css light theme has background variable', () => {
  const filePath = path.join(__dirname, '..', 'guides', 'css', 'shared.css');
  const content = fs.readFileSync(filePath, 'utf8');
  const lightThemeMatch = content.match(/\[data-theme="light"\]\s*\{[\s\S]*?--bg:\s*#[0-9a-f]+/i);
  if (!lightThemeMatch) {
    throw new Error('Light theme background variable not found');
  }
});

// Test 7: shared.css has transitions
test('shared.css has theme transition styles', () => {
  const filePath = path.join(__dirname, '..', 'guides', 'css', 'shared.css');
  const content = fs.readFileSync(filePath, 'utf8');
  const hasTransition = (content.includes('transition: background-color 0.2s, color 0.2s') ||
                        content.includes('transition: background-color') &&
                        content.includes('color 0.2s'));
  if (!hasTransition) {
    throw new Error('Theme transition styles not found');
  }
});

// Test 8: Sample guide pages have theme-sync.js reference
test('Sample guide pages reference theme-sync.js', () => {
  const guidesDir = path.join(__dirname, '..', 'guides');
  const sampleGuides = fs.readdirSync(guidesDir)
    .filter(f => f.endsWith('.html'))
    .slice(0, 5);

  if (sampleGuides.length === 0) {
    throw new Error('No guide files found');
  }

  sampleGuides.forEach(guide => {
    const filePath = path.join(guidesDir, guide);
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('theme-sync.js')) {
      throw new Error(`${guide} does not reference theme-sync.js`);
    }
  });
});

// Test 9: Count total guide pages with theme-sync.js
test('All guide pages (262) reference theme-sync.js', () => {
  const guidesDir = path.join(__dirname, '..', 'guides');
  const allGuides = fs.readdirSync(guidesDir)
    .filter(f => f.endsWith('.html'));

  let withThemeSync = 0;
  allGuides.forEach(guide => {
    const filePath = path.join(guidesDir, guide);
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('theme-sync.js')) {
      withThemeSync++;
    }
  });

  if (withThemeSync !== allGuides.length) {
    throw new Error(`Only ${withThemeSync} of ${allGuides.length} guides have theme-sync.js`);
  }
});

// Test 10: index.html has theme-toggle button
test('index.html has theme-toggle button', () => {
  const filePath = path.join(__dirname, '..', 'index.html');
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('theme-toggle') || !content.includes('id="theme-toggle"')) {
    throw new Error('Theme toggle button not found in index.html');
  }
});

// Test 11: main.css has light theme variables
test('main.css has [data-theme="light"] styles', () => {
  const filePath = path.join(__dirname, '..', 'css', 'main.css');
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('[data-theme="light"]')) {
    throw new Error('[data-theme="light"] not found in main.css');
  }
});

// Test 12: ui.js has theme initialization
test('ui.js has initializeThemeToggle function', () => {
  const filePath = path.join(__dirname, '..', 'js', 'ui.js');
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('initializeThemeToggle')) {
    throw new Error('initializeThemeToggle function not found');
  }
});

// Summary
console.log('\n=== THEME SETUP VERIFICATION ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log('\nAll tests passed! Dark mode setup is complete.');
  process.exit(0);
} else {
  console.log('\nErrors found:');
  errors.forEach(err => {
    console.log(`  - ${err}`);
  });
  process.exit(1);
}
