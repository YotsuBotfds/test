#!/usr/bin/env node

/**
 * Reading Time Calculator
 * Scans HTML files, counts words, and updates guides.json with reading time estimates
 * Assumes 200 words per minute reading speed
 */

const fs = require('fs');
const path = require('path');

const WORDS_PER_MINUTE = 200;
const GUIDES_DIR = path.join(__dirname, '../guides');
const GUIDES_JSON = path.join(__dirname, '../data/guides.json');

/**
 * Strip HTML tags and extract plain text
 * @param {string} html - HTML content
 * @returns {string} Plain text
 */
function stripHtmlTags(html) {
  // Remove script and style tags with their content
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  // Remove extra whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Count words in text
 * @param {string} text - Plain text
 * @returns {number} Word count
 */
function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Calculate reading time in minutes
 * @param {number} wordCount - Total words
 * @returns {number} Reading time in minutes (rounded up)
 */
function calculateReadingTime(wordCount) {
  if (wordCount === 0) return 0;
  return Math.ceil(wordCount / WORDS_PER_MINUTE);
}

/**
 * Get HTML file path from guide ID
 * @param {string} guideId - Guide ID (e.g., "SUR-01")
 * @returns {string|null} Path to HTML file or null
 */
function getHtmlFilePath(guideId) {
  // Try to find the HTML file matching the guide
  // File naming convention: guides/{id-lowercase}.html or guides/{title-lowercase}.html
  const idLower = guideId.toLowerCase().replace(/-/g, '-');
  const files = fs.readdirSync(GUIDES_DIR);

  for (const file of files) {
    if (file.endsWith('.html')) {
      const nameLower = path.basename(file, '.html').toLowerCase();
      // Match by ID pattern or file start
      if (nameLower.startsWith(idLower) || nameLower.includes(idLower.split('-')[1])) {
        return path.join(GUIDES_DIR, file);
      }
    }
  }

  return null;
}

/**
 * Main function
 */
async function main() {
  try {
    // Read guides.json
    const guidesData = JSON.parse(fs.readFileSync(GUIDES_JSON, 'utf8'));

    if (!Array.isArray(guidesData)) {
      console.error('Error: guides.json is not an array');
      process.exit(1);
    }

    const stats = {
      total: guidesData.length,
      processed: 0,
      skipped: 0,
      shortest: { title: '', time: Infinity },
      longest: { title: '', time: 0 },
      totalWords: 0,
      totalTime: 0,
    };

    console.log('Reading Time Calculator');
    console.log('========================\n');
    console.log(`Processing ${stats.total} guides...\n`);

    // Process each guide
    for (const guide of guidesData) {
      if (!guide.id || !guide.url) {
        console.warn(`Skipping guide: missing id or url`);
        stats.skipped++;
        continue;
      }

      // Find the HTML file
      let htmlPath = null;

      // First try: use the url field
      if (guide.url && guide.url.endsWith('.html')) {
        htmlPath = path.join(__dirname, '../', guide.url);
      }

      // Second try: search by ID
      if (!htmlPath || !fs.existsSync(htmlPath)) {
        htmlPath = getHtmlFilePath(guide.id);
      }

      if (!htmlPath || !fs.existsSync(htmlPath)) {
        console.warn(`⚠️  Skipping "${guide.title}": HTML file not found`);
        stats.skipped++;
        continue;
      }

      try {
        // Read HTML file
        const html = fs.readFileSync(htmlPath, 'utf8');

        // Extract plain text
        const plainText = stripHtmlTags(html);

        // Count words
        const wordCount = countWords(plainText);

        // Calculate reading time
        const readingTime = calculateReadingTime(wordCount);

        // Update guide object
        guide.readingTime = readingTime;
        guide.wordCount = wordCount;

        // Update statistics
        stats.processed++;
        stats.totalWords += wordCount;
        stats.totalTime += readingTime;

        if (readingTime < stats.shortest.time) {
          stats.shortest = { title: guide.title, time: readingTime, words: wordCount };
        }
        if (readingTime > stats.longest.time) {
          stats.longest = { title: guide.title, time: readingTime, words: wordCount };
        }

        console.log(`✓ "${guide.title}": ${wordCount} words → ${readingTime} min read`);
      } catch (error) {
        console.error(`✗ Error processing "${guide.title}": ${error.message}`);
        stats.skipped++;
      }
    }

    // Write updated guides.json
    fs.writeFileSync(GUIDES_JSON, JSON.stringify(guidesData, null, 2) + '\n');

    // Print statistics
    console.log('\n========================');
    console.log('Summary Statistics');
    console.log('========================');
    console.log(`Total guides: ${stats.total}`);
    console.log(`Processed: ${stats.processed}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`\nReading Time Stats:`);
    console.log(`  Shortest: "${stats.shortest.title}" - ${stats.shortest.time} min (${stats.shortest.words} words)`);
    console.log(`  Longest: "${stats.longest.title}" - ${stats.longest.time} min (${stats.longest.words} words)`);
    console.log(`  Average: ${Math.round(stats.totalTime / stats.processed)} min per guide`);
    console.log(`\nTotal Library Stats:`);
    console.log(`  Combined: ${stats.totalWords.toLocaleString()} words`);
    console.log(`  Total reading time: ${stats.totalTime} minutes (~${Math.round(stats.totalTime / 60)} hours)`);
    console.log(`\n✓ guides.json updated with readingTime field`);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
