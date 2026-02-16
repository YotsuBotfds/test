#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GUIDES_DIR = path.join(__dirname, '../guides');
const GUIDES_JSON_PATH = path.join(__dirname, '../data/guides.json');
const BASE_URL = 'https://zerotoherohero.com/';

// Read guides.json
console.log('Reading guides.json...');
const guideContent = fs.readFileSync(GUIDES_JSON_PATH, 'utf-8');
const guides = JSON.parse(guideContent);

// Create a map of filename to guide metadata
const guideMap = {};
guides.forEach(guide => {
  if (guide.file) {
    const filename = path.basename(guide.file);
    guideMap[filename] = guide;
  }
});

console.log(`Found ${guides.length} guides in guides.json`);
console.log(`Mapped ${Object.keys(guideMap).length} guides by filename`);

// Read all HTML files in guides directory
console.log(`\nScanning ${GUIDES_DIR} for HTML files...`);
const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.html'));
console.log(`Found ${files.length} HTML files`);

let updated = 0;
let skipped = 0;

files.forEach(filename => {
  const filepath = path.join(GUIDES_DIR, filename);
  const guide = guideMap[filename];

  if (!guide) {
    console.warn(`  ⊘ No metadata found for ${filename}`);
    return;
  }

  try {
    let content = fs.readFileSync(filepath, 'utf-8');

    // Check if metadata comment already exists (skip if already processed by this script)
    if (content.includes('<!-- Guide SEO:')) {
      console.log(`  ✓ ${filename} - already has SEO metadata`);
      skipped++;
      return;
    }

    // Extract title from guide data
    const title = guide.title || 'Guide';
    const description = guide.description || 'Survival guide for the Zero to Hero Compendium';
    const lastUpdated = guide.lastUpdated || new Date().toISOString().split('T')[0];
    const category = guide.category || 'survival';
    const difficulty = guide.difficulty || 'intermediate';

    // Build canonical URL
    const canonicalUrl = `${BASE_URL}guides/${filename}`;

    // Create breadcrumb data
    const breadcrumbData = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        {
          '@type': 'ListItem',
          'position': 1,
          'name': 'Home',
          'item': BASE_URL
        },
        {
          '@type': 'ListItem',
          'position': 2,
          'name': 'Guides',
          'item': `${BASE_URL}guides/`
        },
        {
          '@type': 'ListItem',
          'position': 3,
          'name': title,
          'item': canonicalUrl
        }
      ]
    };

    // Create Article schema
    const articleData = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': title,
      'description': description,
      'dateModified': lastUpdated,
      'author': {
        '@type': 'Organization',
        'name': 'Zero to Hero Compendium'
      }
    };

    // Create meta tags for head
    const metaTags = `<meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${canonicalUrl}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="article">`;

    // Create JSON-LD scripts
    const jsonLdBreadcrumb = `<script type="application/ld+json">${JSON.stringify(breadcrumbData)}</script>`;
    const jsonLdArticle = `<script type="application/ld+json">${JSON.stringify(articleData)}</script>`;

    // Find the head section to insert meta tags
    // Handle different head closing patterns
    const headCloseMatch = content.match(/<\/head>/i);
    if (headCloseMatch) {
      const headCloseIndex = content.indexOf(headCloseMatch[0]);
      // Insert meta tags and JSON-LD before </head>
      content = content.substring(0, headCloseIndex) +
                metaTags +
                jsonLdBreadcrumb +
                jsonLdArticle +
                content.substring(headCloseIndex);
    } else {
      console.warn(`  ⊘ ${filename} - could not find </head> tag`);
      return;
    }

    // Add SEO metadata comment
    const metadataComment = `<!-- Guide SEO: ${title} | Category: ${category} | Difficulty: ${difficulty} | Updated: ${lastUpdated} -->`;

    // Insert comment after DOCTYPE
    const doctypeMatch = content.match(/<!DOCTYPE[^>]*>/i);
    if (doctypeMatch) {
      const insertPos = doctypeMatch[0].length;
      content = content.substring(0, insertPos) + '\n' + metadataComment + '\n' + content.substring(insertPos);
    }

    // Write back
    fs.writeFileSync(filepath, content, 'utf-8');
    console.log(`  ✓ ${filename} - SEO metadata added`);
    updated++;
  } catch (err) {
    console.error(`  ✗ Error processing ${filename}: ${err.message}`);
  }
});

console.log(`\n=== Summary ===`);
console.log(`Updated: ${updated} files`);
console.log(`Skipped: ${skipped} files (already have SEO metadata)`);
console.log(`Not found: ${files.length - updated - skipped} files`);

// Helper function to escape HTML special characters
function escapeHtml(text) {
  const div = { innerHTML: text };
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
