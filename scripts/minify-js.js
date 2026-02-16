#!/usr/bin/env node

/**
 * JavaScript Minification Script
 * Minifies all .js files from js/ directory and writes to js/dist/
 *
 * Usage: node scripts/minify-js.js
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const projectRoot = path.resolve(__dirname, '..');
const jsSourceDir = path.join(projectRoot, 'js');
const jsDistDir = path.join(projectRoot, 'js', 'dist');

// Create dist directory if it doesn't exist
if (!fs.existsSync(jsDistDir)) {
  fs.mkdirSync(jsDistDir, { recursive: true });
}

/**
 * Minify JavaScript using Terser
 * @param {string} code - Raw JavaScript code
 * @returns {Promise<string>} Minified JavaScript
 */
async function minifyJS(code) {
  try {
    const result = await minify(code, {
      compress: {
        passes: 2,
        unused: true,
        dead_code: true,
        drop_console: ['log'],
      },
      mangle: true,
      output: {
        comments: false,
      },
    });

    if (result.error) {
      throw result.error;
    }

    return result.code;
  } catch (error) {
    throw new Error(`Minification error: ${error.message}`);
  }
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Process all JS files in the source directory
 */
async function processFiles() {
  try {
    // Get all .js files from js/ directory (excluding subdirectories)
    const files = fs.readdirSync(jsSourceDir).filter(file => {
      const fullPath = path.join(jsSourceDir, file);
      return fs.statSync(fullPath).isFile() && file.endsWith('.js');
    });

    if (files.length === 0) {
      console.log('No JavaScript files found in js/ directory');
      return;
    }

    console.log(`Found ${files.length} JavaScript files to minify\n`);

    let totalUnminified = 0;
    let totalMinified = 0;
    const results = [];

    // Process each file
    for (const file of files) {
      const sourcePath = path.join(jsSourceDir, file);
      const distPath = path.join(jsDistDir, file);

      try {
        // Read source file
        const code = fs.readFileSync(sourcePath, 'utf8');
        const unminifiedSize = Buffer.byteLength(code, 'utf8');

        // Minify
        const minifiedCode = await minifyJS(code);
        const minifiedSize = Buffer.byteLength(minifiedCode, 'utf8');

        // Write minified file
        fs.writeFileSync(distPath, minifiedCode, 'utf8');

        const savings = unminifiedSize - minifiedSize;
        const savingsPercent = ((savings / unminifiedSize) * 100).toFixed(1);

        results.push({
          file,
          unminified: unminifiedSize,
          minified: minifiedSize,
          savings,
          savingsPercent,
        });

        totalUnminified += unminifiedSize;
        totalMinified += minifiedSize;

        console.log(
          `✓ ${file.padEnd(30)} ${formatBytes(unminifiedSize).padStart(10)} → ${formatBytes(minifiedSize).padStart(10)} (${savingsPercent}% saved)`
        );
      } catch (error) {
        console.error(`✗ Error minifying ${file}: ${error.message}`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('MINIFICATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total files processed: ${results.length}`);
    console.log(`Total unminified size: ${formatBytes(totalUnminified)}`);
    console.log(`Total minified size:   ${formatBytes(totalMinified)}`);

    const totalSavings = totalUnminified - totalMinified;
    const totalSavingsPercent = ((totalSavings / totalUnminified) * 100).toFixed(1);
    console.log(`Total savings:         ${formatBytes(totalSavings)} (${totalSavingsPercent}%)`);
    console.log('\nMinified files written to: ' + jsDistDir);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the minification
processFiles();
