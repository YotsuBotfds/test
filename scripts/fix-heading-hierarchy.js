#!/usr/bin/env node

/**
 * Fix heading hierarchy violations in guide HTML files
 * - Detects heading-level skips (e.g., H1→H3)
 * - Adjusts headings to maintain proper nesting
 * - Wraps standalone emoji characters with aria-hidden="true"
 */

const fs = require('fs');
const path = require('path');
const { readdirSync } = require('fs');

// Configuration
const GUIDES_DIR = path.join(__dirname, '../guides');
const EMOJI_PATTERN = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

/**
 * Parse HTML and extract heading information
 * @param {string} html - HTML content
 * @returns {Array} Array of heading objects with position info
 */
function parseHeadings(html) {
  const headings = [];
  const regex = /<h([1-6])([^>]*)>(.*?)<\/h\1>/gis;
  let match;

  while ((match = regex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1]),
      attributes: match[2],
      content: match[3],
      fullMatch: match[0],
      position: match.index,
      endPosition: match.index + match[0].length,
    });
  }

  return headings;
}

/**
 * Check if content contains only emoji or leading/trailing emoji
 * @param {string} content - HTML content
 * @returns {boolean} True if standalone emoji detected
 */
function hasStandaloneEmoji(content) {
  return /^\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*$|^\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s+|^\s+[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*$/u.test(content);
}

/**
 * Wrap standalone emoji with aria-hidden span
 * @param {string} content - Heading content
 * @returns {string} Content with aria-hidden emoji
 */
function wrapEmojiDecorations(content) {
  // Wrap emoji that appear at the start followed by space or text
  // This regex looks for emoji characters followed by space or word character
  return content.replace(
    /^([\u{1F300}-\u{1F9FF}\u{1F000}-\u{1F02F}]+)(\s+)/u,
    '<span aria-hidden="true">$1</span>$2'
  ).replace(
    /(\s+)([\u{1F300}-\u{1F9FF}\u{1F000}-\u{1F02F}]+)(\s+)/gu,
    '$1<span aria-hidden="true">$2</span>$3'
  ).replace(
    /(\s+)([\u{1F300}-\u{1F9FF}\u{1F000}-\u{1F02F}]+)$/u,
    '$1<span aria-hidden="true">$2</span>'
  );
}

/**
 * Fix heading hierarchy in array of headings
 * @param {Array} headings - Array of heading objects
 * @returns {Array} Fixed headings
 */
function fixHeadingHierarchy(headings) {
  if (headings.length === 0) return headings;

  const fixed = [];
  let previousLevel = 0;

  for (const heading of headings) {
    let newLevel = heading.level;

    // If there's a skip in levels, adjust to next valid level
    if (previousLevel > 0 && heading.level > previousLevel + 1) {
      newLevel = previousLevel + 1;
    }

    // Update heading object
    fixed.push({
      ...heading,
      originalLevel: heading.level,
      newLevel: newLevel,
      contentFixed: wrapEmojiDecorations(heading.content),
    });

    previousLevel = newLevel;
  }

  return fixed;
}

/**
 * Generate new heading HTML
 * @param {Object} heading - Fixed heading object
 * @returns {string} New heading HTML
 */
function generateHeadingHTML(heading) {
  if (heading.originalLevel === heading.newLevel) {
    // No change needed, but emoji still needs wrapping
    return `<h${heading.newLevel}${heading.attributes}>${heading.contentFixed}</h${heading.newLevel}>`;
  }

  // Level changed, update tag
  return `<h${heading.newLevel}${heading.attributes}>${heading.contentFixed}</h${heading.newLevel}>`;
}

/**
 * Apply fixes to HTML content
 * @param {string} html - Original HTML
 * @param {Array} fixedHeadings - Array of fixed heading objects
 * @returns {string} Fixed HTML
 */
function applyFixes(html, fixedHeadings) {
  let result = html;
  const replacements = [];

  // Build replacements in reverse order to avoid offset issues
  for (const heading of fixedHeadings) {
    replacements.push({
      from: heading.position,
      to: heading.endPosition,
      original: heading.fullMatch,
      replacement: generateHeadingHTML(heading),
    });
  }

  // Apply replacements from end to start to avoid position shifts
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { from, to, replacement } = replacements[i];
    result = result.substring(0, from) + replacement + result.substring(to);
  }

  return result;
}

/**
 * Process a single guide file
 * @param {string} filePath - Path to guide HTML file
 * @returns {Object} Processing result
 */
function processGuide(filePath) {
  const fileName = path.basename(filePath);

  try {
    let html = fs.readFileSync(filePath, 'utf8');

    // Parse original headings
    const headings = parseHeadings(html);

    if (headings.length === 0) {
      return { file: fileName, status: 'no-headings', count: 0, fixed: 0 };
    }

    // Fix hierarchy
    const fixed = fixHeadingHierarchy(headings);

    // Count how many levels changed
    const changedCount = fixed.filter(h => h.originalLevel !== h.newLevel).length;
    const emojiCount = fixed.filter(h => h.content !== h.contentFixed).length;

    // Apply fixes to HTML
    const fixedHtml = applyFixes(html, fixed);

    // Write back to file
    fs.writeFileSync(filePath, fixedHtml, 'utf8');

    return {
      file: fileName,
      status: 'fixed',
      count: headings.length,
      fixed: changedCount,
      emojiWrapped: emojiCount,
    };
  } catch (error) {
    return { file: fileName, status: 'error', error: error.message };
  }
}

/**
 * Main function - process all guides
 */
function main() {
  console.log('Fixing heading hierarchy in guides...\n');

  // Find all guide HTML files
  const allFiles = readdirSync(GUIDES_DIR);
  const guideFiles = allFiles
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(GUIDES_DIR, f));
  console.log(`Found ${guideFiles.length} guide files\n`);

  const results = {
    total: guideFiles.length,
    fixed: 0,
    skipped: 0,
    errors: 0,
    totalHeadings: 0,
    totalFixed: 0,
    totalEmojiWrapped: 0,
    details: [],
  };

  // Process each guide
  for (const filePath of guideFiles) {
    const result = processGuide(filePath);
    results.details.push(result);

    if (result.status === 'fixed') {
      results.fixed++;
      results.totalHeadings += result.count;
      results.totalFixed += result.fixed;
      results.totalEmojiWrapped += result.emojiWrapped;
      if (result.fixed > 0 || result.emojiWrapped > 0) {
        console.log(
          `[FIXED] ${result.file} (H${result.count}, fixed ${result.fixed}, emoji ${result.emojiWrapped})`
        );
      }
    } else if (result.status === 'no-headings') {
      results.skipped++;
    } else if (result.status === 'error') {
      results.errors++;
      console.error(`[ERROR] ${result.file}: ${result.error}`);
    }
  }

  // Summary
  console.log(`\nSummary:`);
  console.log(`  Total guides: ${results.total}`);
  console.log(`  Processed: ${results.fixed}`);
  console.log(`  Skipped (no headings): ${results.skipped}`);
  console.log(`  Errors: ${results.errors}`);
  console.log(`  Total headings found: ${results.totalHeadings}`);
  console.log(`  Heading levels fixed: ${results.totalFixed}`);
  console.log(`  Emoji wrapped: ${results.totalEmojiWrapped}`);

  // Show guides with hierarchy fixes
  const withFixes = results.details.filter(d => d.fixed > 0);
  if (withFixes.length > 0) {
    console.log(`\nGuides with hierarchy fixes:`);
    for (const detail of withFixes) {
      console.log(`  - ${detail.file} (${detail.fixed} level adjustments)`);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { parseHeadings, fixHeadingHierarchy, applyFixes, processGuide };
