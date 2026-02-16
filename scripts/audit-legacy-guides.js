#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Legacy guide files to audit
const legacyFiles = [
  'con-01-shelter-building.html',
  'con-02-carpentry-woodworking.html',
  'con-03-clay-earthworks.html',
  'con-04-energy-systems.html',
  'cra-01-forging-metalwork.html',
  'cra-02-pottery-ceramics.html',
  'cra-03-cordage-textiles.html',
  'cra-04-soap-making.html',
  'cra-05-weaving-textiles.html',
  'cra-06-knot-tying-rigging.html',
  'cra-07-primitive-weapons.html',
  'fod-01-food-preservation.html',
  'fod-02-trapping-hunting.html',
  'fod-03-agriculture-basics.html',
  'fod-04-animal-husbandry.html',
  'sur-01-water-purification.html',
  'sur-02-fire-starting.html',
  'sur-03-herbal-medicine.html',
  'sur-05-sanitation-hygiene.html'
];

// Extract title and h1 from HTML
function extractTitleAndH1(htmlPath) {
  try {
    const content = fs.readFileSync(htmlPath, 'utf-8');
    
    // Extract <title> content
    const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' - Zero to Hero Survival Compendium', '').trim() : null;
    
    // Extract first <h1> content
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const h1 = h1Match ? h1Match[1].trim() : null;
    
    return { title, h1 };
  } catch (err) {
    console.error(`Error reading ${htmlPath}:`, err.message);
    return { title: null, h1: null };
  }
}

// Case-insensitive substring match
function findMatch(legacyTitle, legacyH1, manifestEntries) {
  if (!legacyTitle && !legacyH1) return null;
  
  const searchText = (legacyTitle || legacyH1).toLowerCase();
  
  for (const entry of manifestEntries) {
    const entryTitle = (entry.title || '').toLowerCase();
    
    // Check for substring match (either direction)
    if (
      entryTitle.includes(searchText) ||
      searchText.includes(entryTitle)
    ) {
      return entry;
    }
  }
  
  return null;
}

// Main execution
async function main() {
  const guidesDir = path.join(__dirname, '..', 'guides');
  const dataDir = path.join(__dirname, '..', 'data');
  const guidesJsonPath = path.join(dataDir, 'guides.json');
  
  // Load manifest
  let manifestEntries = [];
  try {
    const guidesData = JSON.parse(fs.readFileSync(guidesJsonPath, 'utf-8'));
    manifestEntries = guidesData.guides || [];
  } catch (err) {
    console.error('Error loading guides.json:', err.message);
    process.exit(1);
  }
  
  // Audit each legacy file
  const report = [];
  let keepCount = 0;
  let archiveCount = 0;
  
  for (const file of legacyFiles) {
    const filePath = path.join(guidesDir, file);
    
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${file}`);
      continue;
    }
    
    const { title, h1 } = extractTitleAndH1(filePath);
    const matchedEntry = findMatch(title, h1, manifestEntries);
    
    const recommendation = matchedEntry ? 'archive' : 'keep';
    
    if (recommendation === 'archive') {
      archiveCount++;
    } else {
      keepCount++;
    }
    
    report.push({
      file,
      title,
      h1,
      matchedEntry: matchedEntry ? {
        id: matchedEntry.id,
        title: matchedEntry.title,
        file: matchedEntry.file
      } : null,
      recommendation
    });
  }
  
  // Write report
  const reportPath = path.join(dataDir, 'legacy-guide-audit.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Print summary
  console.log('\n========================================');
  console.log('LEGACY GUIDE AUDIT REPORT');
  console.log('========================================\n');
  console.log(`Total files audited: ${legacyFiles.length}`);
  console.log(`Files to archive: ${archiveCount}`);
  console.log(`Files to keep: ${keepCount}`);
  console.log(`\nDetailed report: ${reportPath}`);
  
  // Print details
  console.log('\n--- Files to Archive (matched to manifest) ---');
  report.filter(r => r.recommendation === 'archive').forEach(r => {
    console.log(`  ${r.file}`);
    console.log(`    Title: ${r.title}`);
    if (r.matchedEntry) {
      console.log(`    -> Matched: ${r.matchedEntry.title} (${r.matchedEntry.file})`);
    }
  });
  
  console.log('\n--- Files to Keep (unique content) ---');
  report.filter(r => r.recommendation === 'keep').forEach(r => {
    console.log(`  ${r.file}`);
    console.log(`    Title: ${r.title}`);
  });
  
  console.log('\n========================================\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
