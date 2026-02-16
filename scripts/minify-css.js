#!/usr/bin/env node

/**
 * CSS Minification Script
 * Minifies css/main.css and writes to css/main.min.css
 *
 * Usage: node scripts/minify-css.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceCssPath = path.join(projectRoot, 'css', 'main.css');
const minifiedCssPath = path.join(projectRoot, 'css', 'main.min.css');

/**
 * Minify CSS by removing unnecessary whitespace, comments, and optimizing syntax
 * @param {string} css - Raw CSS content
 * @returns {string} Minified CSS
 */
function minifyCSS(css) {
  // Remove CSS comments
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove whitespace at start/end of lines
  css = css.replace(/^\s+|\s+$/gm, '');

  // Remove newlines
  css = css.replace(/\n/g, ' ');

  // Remove spaces around special characters
  css = css.replace(/\s*([{}:;,>+~])\s*/g, '$1');

  // Remove spaces after commas in selectors/values
  css = css.replace(/,(?=\s*[\w\[])/g, ',');

  // Remove trailing semicolon before closing brace
  css = css.replace(/;}/g, '}');

  // Collapse multiple spaces
  css = css.replace(/\s+/g, ' ');

  // Trim final result
  css = css.trim();

  return css;
}

try {
  // Check if source file exists
  if (!fs.existsSync(sourceCssPath)) {
    console.error(`ERROR: Source CSS file not found: ${sourceCssPath}`);
    process.exit(1);
  }

  // Read source CSS
  const sourceCss = fs.readFileSync(sourceCssPath, 'utf8');
  const originalSize = Buffer.byteLength(sourceCss, 'utf8');

  // Minify
  const minifiedCss = minifyCSS(sourceCss);
  const minifiedSize = Buffer.byteLength(minifiedCss, 'utf8');

  // Write minified CSS
  fs.writeFileSync(minifiedCssPath, minifiedCss, 'utf8');

  // Calculate compression ratio
  const compressionRatio = ((1 - minifiedSize / originalSize) * 100).toFixed(1);

  console.log('✓ CSS Minification complete');
  console.log(`  Source: ${(originalSize / 1024).toFixed(2)} KB`);
  console.log(`  Minified: ${(minifiedSize / 1024).toFixed(2)} KB`);
  console.log(`  Compression: ${compressionRatio}%`);
  console.log(`  Output: ${minifiedCssPath}`);

  process.exit(0);
} catch (error) {
  console.error('ERROR: CSS minification failed');
  console.error(error.message);
  process.exit(1);
}
