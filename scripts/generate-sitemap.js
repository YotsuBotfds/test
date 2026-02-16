#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GUIDES_JSON_PATH = path.join(__dirname, '../data/guides.json');
const GUIDES_DIR = path.join(__dirname, '../guides');
const OUTPUT_PATH = path.join(__dirname, '../sitemap.xml');
const BASE_URL = 'https://zerotoherohero.com/';

console.log('Generating sitemap.xml...');

// Read guides.json
let guides = [];
try {
  const guideContent = fs.readFileSync(GUIDES_JSON_PATH, 'utf-8');
  guides = JSON.parse(guideContent);
  console.log(`✓ Read ${guides.length} guides from guides.json`);
} catch (err) {
  console.error(`✗ Error reading guides.json: ${err.message}`);
  process.exit(1);
}

// Build URL entries
const urlEntries = [];

// Add index.html
urlEntries.push({
  loc: `${BASE_URL}index.html`,
  lastmod: new Date().toISOString().split('T')[0],
  priority: '1.0'
});

// Add reading order guide
urlEntries.push({
  loc: `${BASE_URL}guides/reading-order.html`,
  lastmod: new Date().toISOString().split('T')[0],
  priority: '0.9'
});

// Add emergency quick reference
urlEntries.push({
  loc: `${BASE_URL}guides/quick-reference.html`,
  lastmod: new Date().toISOString().split('T')[0],
  priority: '0.9'
});

// Add all guides from guides.json
guides.forEach(guide => {
  if (guide.url || guide.file) {
    const url = guide.url || guide.file;
    const lastmod = guide.lastUpdated || new Date().toISOString().split('T')[0];

    urlEntries.push({
      loc: `${BASE_URL}${url}`,
      lastmod: lastmod,
      priority: '0.8'
    });
  }
});

// Check for any tools/*.html files
console.log('Scanning for tools/*.html files...');
const toolsDir = path.join(__dirname, '../tools');
if (fs.existsSync(toolsDir)) {
  const toolFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith('.html'));
  console.log(`✓ Found ${toolFiles.length} tool files`);

  toolFiles.forEach(file => {
    // Skip progress.html and stats.html if already added
    const toolUrl = `${BASE_URL}tools/${file}`;
    if (!urlEntries.some(entry => entry.loc === toolUrl)) {
      urlEntries.push({
        loc: toolUrl,
        lastmod: new Date().toISOString().split('T')[0],
        priority: '0.7'
      });
    }
  });
}

// Generate XML
let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

urlEntries.forEach(entry => {
  xml += '  <url>\n';
  xml += `    <loc>${escapeXml(entry.loc)}</loc>\n`;
  xml += `    <lastmod>${entry.lastmod}</lastmod>\n`;
  xml += `    <priority>${entry.priority}</priority>\n`;
  xml += '  </url>\n';
});

xml += '</urlset>\n';

// Write sitemap.xml
try {
  fs.writeFileSync(OUTPUT_PATH, xml, 'utf-8');
  console.log(`✓ Sitemap generated: ${OUTPUT_PATH}`);
  console.log(`✓ Total URLs in sitemap: ${urlEntries.length}`);
} catch (err) {
  console.error(`✗ Error writing sitemap.xml: ${err.message}`);
  process.exit(1);
}

// Helper function to escape XML special characters
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
