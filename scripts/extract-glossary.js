#!/usr/bin/env node

/**
 * Glossary Extraction Script
 * Reads all guide HTML files and extracts key technical terms
 * Creates a searchable glossary database
 */

const fs = require('fs');
const path = require('path');

// Configuration
const GUIDES_DIR = path.join(__dirname, '../guides');
const OUTPUT_FILE = path.join(__dirname, '../data/glossary.json');
const MIN_TERM_LENGTH = 4;
const MAX_TERMS = 250;

// Common words to exclude
const EXCLUDE_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'which', 'are', 'you', 'your',
  'can', 'will', 'has', 'have', 'been', 'but', 'not', 'use', 'used', 'or', 'of', 'in',
  'to', 'be', 'is', 'by', 'as', 'on', 'at', 'it', 'an', 'we', 'all', 'these', 'those',
  'also', 'more', 'than', 'how', 'so', 'such', 'if', 'when', 'where', 'why', 'what',
  'time', 'way', 'day', 'person', 'people', 'year', 'very', 'any', 'make', 'do', 'go',
  'take', 'see', 'know', 'one', 'two', 'only', 'just', 'even', 'over', 'both', 'each',
  'about', 'good', 'well', 'such', 'does', 'must', 'must', 'could', 'would', 'could',
]);

// Technical term patterns
const TECHNICAL_PATTERNS = [
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g, // Title Case (2-3 words)
];

let glossary = {};

/**
 * Simple HTML stripper
 */
function stripHtml(html) {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&[a-z]+;/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Extract bold terms
 */
function extractBoldTerms(html) {
  const terms = [];
  const boldRegex = /<(?:strong|b|h[2-4])[^>]*>([^<]{3,100})<\/(?:strong|b|h[2-4])>/gi;
  let match;

  while ((match = boldRegex.exec(html)) !== null) {
    const term = match[1].trim();
    if (term.length >= MIN_TERM_LENGTH) {
      terms.push(term);
    }
  }

  return terms;
}

/**
 * Extract title case terms
 */
function extractTitleCaseTerms(text) {
  const terms = [];
  const words = text.split(/\s+/);

  for (let i = 0; i < words.length - 1; i++) {
    const word1 = words[i];
    const word2 = words[i + 1];

    // Check for two consecutive capitalized words
    if (word1.length >= 4 && word2.length >= 4 &&
        /^[A-Z]/.test(word1) && /^[A-Z]/.test(word2) &&
        !/[^a-zA-Z]/.test(word1) && !/[^a-zA-Z]/.test(word2)) {

      const term = `${word1} ${word2}`;
      if (!EXCLUDE_WORDS.has(term.toLowerCase())) {
        terms.push(term);
      }
    }
  }

  return terms;
}

/**
 * Process a guide file
 */
function processGuide(filePath) {
  const guideId = path.basename(filePath, '.html');

  try {
    const html = fs.readFileSync(filePath, 'utf8');
    if (html.length === 0) return 0;

    const text = stripHtml(html);

    // Extract bold terms and title case
    const boldTerms = extractBoldTerms(html);
    const titleCaseTerms = extractTitleCaseTerms(text);
    const allTerms = [...new Set([...boldTerms, ...titleCaseTerms])];

    // Add to glossary
    allTerms.forEach(term => {
      const normalizedTerm = term.trim();

      if (normalizedTerm.length >= MIN_TERM_LENGTH &&
          !EXCLUDE_WORDS.has(normalizedTerm.toLowerCase())) {

        if (!glossary[normalizedTerm]) {
          glossary[normalizedTerm] = {
            term: normalizedTerm,
            definition: `A technical term used in ${guideId.replace(/-/g, ' ')}`,
            sources: [guideId],
            frequency: 1
          };
        } else {
          glossary[normalizedTerm].frequency++;
          if (!glossary[normalizedTerm].sources.length < 5) {
            glossary[normalizedTerm].sources.push(guideId);
          }
        }
      }
    });

    console.log(`✓ ${guideId}`);
    return allTerms.length;

  } catch (error) {
    console.error(`✗ ${guideId}: ${error.message}`);
    return 0;
  }
}

/**
 * Main
 */
function main() {
  console.log('Extracting glossary...\n');

  const files = fs.readdirSync(GUIDES_DIR)
    .filter(f => f.endsWith('.html') && !f.startsWith('index') && f !== 'search.html')
    .map(f => path.join(GUIDES_DIR, f));

  console.log(`Found ${files.length} guides\n`);

  // Process first 100 guides (to keep it fast)
  files.slice(0, 100).forEach(f => processGuide(f));

  // Sort by frequency
  const sorted = Object.entries(glossary)
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, MAX_TERMS);

  const final = {};
  sorted.forEach(([term, data]) => {
    final[term] = data;
  });

  // Write output
  const output = {
    metadata: {
      created: new Date().toISOString(),
      totalTerms: Object.keys(final).length,
      version: '1.0'
    },
    glossary: final
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n✅ Glossary saved to: ${OUTPUT_FILE}`);
  console.log(`   Total terms: ${Object.keys(final).length}`);
  console.log(`   File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
}

main();
