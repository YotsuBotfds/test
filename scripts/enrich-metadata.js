#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GUIDES_JSON_PATH = path.join(__dirname, '../data/guides.json');
const TODAY = '2026-02-15';
const VERSION = '1.0';

// Read guides.json
console.log('Reading guides.json...');
const guideContent = fs.readFileSync(GUIDES_JSON_PATH, 'utf-8');
const guides = JSON.parse(guideContent);

console.log(`Processing ${guides.length} guides...`);

// Enrich metadata
const enrichedGuides = guides.map((guide, index) => {
  const enriched = { ...guide };

  // Ensure id is present
  if (!enriched.id) {
    console.warn(`Guide at index ${index} missing id`);
    enriched.id = `GD-${String(index + 1).padStart(3, '0')}`;
  }

  // Ensure title is present
  if (!enriched.title) {
    console.warn(`Guide ${enriched.id} missing title`);
    enriched.title = `Guide ${enriched.id}`;
  }

  // Ensure category is present
  if (!enriched.category) {
    // Try to infer from filename or tags
    if (enriched.url) {
      const filename = path.basename(enriched.url);
      const prefix = filename.split('-')[0];
      enriched.category = prefix || 'general';
    } else if (enriched.tags && enriched.tags.length > 0) {
      enriched.category = enriched.tags[0];
    } else {
      enriched.category = 'general';
    }
  }

  // Ensure tags is an array
  if (!enriched.tags || !Array.isArray(enriched.tags)) {
    enriched.tags = enriched.tags ? [enriched.tags] : [];
  }

  // Ensure description is present
  if (!enriched.description) {
    enriched.description = `Guide for ${enriched.title}`;
  }

  // Ensure icon is present
  if (!enriched.icon) {
    enriched.icon = '📖';
  }

  // Ensure file is present (map from url if needed)
  if (!enriched.file && enriched.url) {
    enriched.file = enriched.url;
  }
  if (!enriched.file) {
    enriched.file = `guides/${enriched.id.toLowerCase()}.html`;
  }

  // Ensure difficulty is present
  if (!enriched.difficulty) {
    enriched.difficulty = 'intermediate';
  }

  // Ensure readingTime is present
  if (!enriched.readingTime) {
    enriched.readingTime = 5;
  }

  // Add or update lastUpdated
  enriched.lastUpdated = TODAY;

  // Add or update version
  enriched.version = VERSION;

  return enriched;
});

// Sort fields in consistent order
const orderedGuides = enrichedGuides.map(guide => {
  const ordered = {};
  const fieldOrder = [
    'id',
    'title',
    'category',
    'tags',
    'description',
    'icon',
    'file',
    'url',
    'difficulty',
    'readingTime',
    'wordCount',
    'lastUpdated',
    'version'
  ];

  // Add fields in order
  for (const field of fieldOrder) {
    if (field in guide) {
      ordered[field] = guide[field];
    }
  }

  // Add any other fields not in the order list
  for (const field in guide) {
    if (!fieldOrder.includes(field)) {
      ordered[field] = guide[field];
    }
  }

  return ordered;
});

// Write updated guides.json
console.log('Writing enriched guides.json...');
fs.writeFileSync(
  GUIDES_JSON_PATH,
  JSON.stringify(orderedGuides, null, 2) + '\n'
);

console.log(`Successfully enriched ${orderedGuides.length} guides`);
console.log('\nMetadata added:');
console.log('  - lastUpdated: ' + TODAY);
console.log('  - version: ' + VERSION);
console.log('  - Ensured all guides have: id, title, category, tags, description, icon, file, difficulty, readingTime');
