#!/usr/bin/env node

/**
 * New Guide Scaffolding Script
 * Creates a new guide HTML file and adds entry to guides.json
 *
 * Usage: node scripts/new-guide.js "Guide Title" [--category=survival] [--tags=water,essential] [--difficulty=intermediate] [--icon=📖]
 *
 * Options:
 *   --category     Category for the guide (default: general)
 *   --tags         Comma-separated tags (e.g., water,essential)
 *   --difficulty   Difficulty level: beginner|intermediate|advanced|expert (default: intermediate)
 *   --icon         Emoji icon for the guide (default: auto-assigned)
 *
 * Example:
 *   node scripts/new-guide.js "Water Purification" --category=survival --tags=water,essential --difficulty=beginner --icon=💧
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const guidesDir = path.join(projectRoot, 'guides');
const guidesJsonPath = path.join(projectRoot, 'data', 'guides.json');

// Category to icon mapping
const categoryIcons = {
  'survival': '🔥',
  'medical': '🏥',
  'agriculture': '🌾',
  'building': '🔨',
  'crafts': '⚒️',
  'metalworking': '⚒️',
  'communications': '📡',
  'defense': '🛡️',
  'sciences': '🔬',
  'chemistry': '🏭',
  'power-generation': '⚡',
  'transportation': '🚗',
  'society': '🏛️',
  'resource-management': '📦',
  'salvage': '♻️',
  'tools': '🛠️',
  'reference': '📚',
  'specialized': '🔧',
  'primitive-technology': '🪨',
  'culture-knowledge': '📖',
  'biology': '🧬',
  'utility': '⚙️',
  'general': '📖'
};

const difficultyLevels = {
  'beginner': '●○○○○',
  'intermediate': '●●●○○',
  'advanced': '●●●●○',
  'expert': '●●●●●'
};

/**
 * Parse command line arguments
 * @returns {Object} { title: string, category?: string, tags?: string[], difficulty?: string, icon?: string }
 */
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('ERROR: Guide title is required');
    console.error('');
    console.error('Usage: node scripts/new-guide.js "Guide Title" [--category=category] [--tags=tag1,tag2] [--difficulty=intermediate] [--icon=📖]');
    console.error('');
    console.error('Example:');
    console.error('  node scripts/new-guide.js "Water Purification" --category=survival --tags=water,essential --difficulty=beginner');
    process.exit(1);
  }

  const title = args[0];
  const options = { title, difficulty: 'intermediate' };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--category=')) {
      options.category = arg.replace('--category=', '');
    } else if (arg.startsWith('--tags=')) {
      const tagString = arg.replace('--tags=', '');
      options.tags = tagString.split(',').map(t => t.trim());
    } else if (arg.startsWith('--difficulty=')) {
      options.difficulty = arg.replace('--difficulty=', '');
    } else if (arg.startsWith('--icon=')) {
      options.icon = arg.replace('--icon=', '');
    }
  }

  return options;
}

/**
 * Generate slug from title
 * @param {string} title - Guide title
 * @returns {string} URL-safe slug
 */
function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, '');  // Remove leading/trailing hyphens
}

/**
 * Get next available guide ID
 * @param {Array} guidesData - Current guides from guides.json
 * @returns {string} Next guide ID (SUR-XX format)
 */
function getNextGuideId(guidesData) {
  // Find highest ID number
  let maxNum = 0;
  for (const guide of guidesData) {
    const match = guide.id?.match(/^SUR-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `SUR-${String(nextNum).padStart(2, '0')}`;
}

/**
 * Create HTML template for new guide
 * @param {string} title - Guide title
 * @param {string} id - Guide ID
 * @param {string} icon - Icon emoji
 * @param {string} difficulty - Difficulty level
 * @returns {string} HTML content
 */
function createHTMLTemplate(title, id, icon, difficulty) {
  return `<!DOCTYPE html><html lang=en><head><meta charset=utf-8><meta content="width=device-width, initial-scale=1.0" name=viewport><title>${title}</title><link rel=stylesheet href=../css/main.css><style>.nav-top{margin-bottom:30px}.nav-top a{display:inline-block;padding:10px 20px;background-color:var(--card);color:var(--accent2);text-decoration:none;border-radius:4px;border:1px solid var(--border);margin-right:10px;transition:all .3s ease}.nav-top a:hover{background-color:var(--accent);color:var(--bg)}.info-box{background-color:var(--surface);padding:20px;border-radius:8px;border-left:4px solid var(--accent2);margin:20px 0}.step-by-step{background-color:var(--surface);padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid var(--accent)}.step{margin-bottom:15px;display:flex;gap:15px}.step-num{background-color:var(--accent);color:var(--bg);width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;flex-shrink:0}.step-content{flex:1}</style></head><body><main role="main"><a class=skip-link href=#main-content> Skip to main content </a><div class=container><a class=back-link href=../index.html aria-label="Back to guide list"> ← Back to Index </a><header><h1> ${title} </h1><div class=top-controls><button class=theme-toggle aria-label="Toggle dark/light theme" id=theme-toggle title="Toggle dark/light mode"> ☀️ </button><button class=mark-read-btn aria-label="Mark this guide as read" id=mark-read-btn title="Mark this guide as completed"> Mark as Read </button></div><div class=guide-metadata><span class=difficulty> Difficulty: ${difficulty} </span><span class=read-time> 📖 ~15 min read </span></div><p> TODO: Add guide description here </p></header><div class=toc role="navigation" aria-label="Table of contents"><h2> Table of Contents </h2><ul><li><a href=#section-1> Section 1 </a></li><li><a href=#section-2> Section 2 </a></li><li><a href=#section-3> Section 3 </a></li></ul></div><section id=section-1><h2> Section 1 </h2><p> Add your content here. Use h3 headings for subsections, and maintain consistent formatting with other guides. </p><div class=info-box><strong> Key Point: </strong> Highlight important information in info boxes like this. </div></section><section id=section-2><h2> Section 2 </h2><p> Second major section of your guide. Use step-by-step blocks for procedures: </p><div class=step-by-step><div class=step><div class=step-num> 1 </div><div class=step-content><strong> Step one: </strong> Description of the first step. </div></div><div class=step><div class=step-num> 2 </div><div class=step-content><strong> Step two: </strong> Description of the second step. </div></div><div class=step><div class=step-num> 3 </div><div class=step-content><strong> Step three: </strong> Description of the third step. </div></div></div></section><section id=section-3><h2> Section 3 </h2><p> Third major section. Add subsections with h3 tags for better organization. </p><h3> Subsection </h3><p> Subsection content goes here. </p></section><footer><p> Guide ID: ${id} | Survival Compendium </p><p style="margin-top: 10px; font-size: 0.9em;"> Last updated: ${new Date().getFullYear()} </p><p style="margin-top: 10px; color: var(--muted); font-size: 0.85em;"> This compendium is self-contained and requires no external resources. All information is stored locally. </p></footer></div><button id=back-to-top title="Back to top"> ↑ </button><script>(function(){const savedTheme=localStorage.getItem('compendium-theme')||'dark';document.documentElement.setAttribute('data-theme',savedTheme);const themeToggle=document.getElementById('theme-toggle');if(themeToggle){themeToggle.textContent=savedTheme==='dark'?'☀️':'🌙';themeToggle.addEventListener('click',function(){const current=document.documentElement.getAttribute('data-theme');const next=current==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',next);localStorage.setItem('compendium-theme',next);themeToggle.textContent=next==='dark'?'☀️':'🌙';})}const guideId=location.pathname.split('/').pop().replace('.html','');const progress=JSON.parse(localStorage.getItem('compendium-progress')||'{}');const markBtn=document.getElementById('mark-read-btn');if(markBtn){if(progress[guideId]){markBtn.textContent='✓ Completed';markBtn.classList.add('completed')}markBtn.addEventListener('click',function(){progress[guideId]={completed:true,date:new Date().toISOString()};localStorage.setItem('compendium-progress',JSON.stringify(progress));markBtn.textContent='✓ Completed';markBtn.classList.add('completed')})}const backToTop=document.getElementById('back-to-top');if(backToTop){window.addEventListener('scroll',function(){backToTop.style.display=window.scrollY>300?'block':'none'});backToTop.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'})})}})();</script></main></body></html>`;
}

/**
 * Main execution
 */
function main() {
  const options = parseArgs();

  // Validate inputs
  if (!options.title || options.title.trim().length === 0) {
    console.error('ERROR: Guide title cannot be empty');
    process.exit(1);
  }

  // Validate difficulty
  if (options.difficulty && !difficultyLevels[options.difficulty]) {
    console.warn(`Warning: Unknown difficulty level "${options.difficulty}". Using "intermediate".`);
    options.difficulty = 'intermediate';
  }

  // Generate slug and filename
  const slug = generateSlug(options.title);
  if (!slug) {
    console.error('ERROR: Could not generate valid filename from title');
    process.exit(1);
  }

  const htmlFileName = `${slug}.html`;
  const htmlFilePath = path.join(guidesDir, htmlFileName);

  // Check if file already exists
  if (fs.existsSync(htmlFilePath)) {
    console.error(`ERROR: Guide file already exists: ${htmlFileName}`);
    process.exit(1);
  }

  // Load current guides.json
  let guidesData = [];
  try {
    if (fs.existsSync(guidesJsonPath)) {
      guidesData = JSON.parse(fs.readFileSync(guidesJsonPath, 'utf8'));
    }
  } catch (error) {
    console.error(`ERROR: Failed to read guides.json: ${error.message}`);
    process.exit(1);
  }

  if (!Array.isArray(guidesData)) {
    console.error('ERROR: guides.json is not an array');
    process.exit(1);
  }

  // Generate new guide ID
  const guideId = getNextGuideId(guidesData);

  // Determine icon
  const icon = options.icon || categoryIcons[options.category] || categoryIcons['general'];
  const difficultyDisplay = difficultyLevels[options.difficulty] || difficultyLevels['intermediate'];

  // Create HTML file
  try {
    const htmlContent = createHTMLTemplate(options.title, guideId, icon, difficultyDisplay);
    fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');
    console.log(`✓ Created guide file: ${htmlFileName}`);
  } catch (error) {
    console.error(`ERROR: Failed to create HTML file: ${error.message}`);
    process.exit(1);
  }

  // Create guides.json entry
  const newGuideEntry = {
    id: guideId,
    title: options.title,
    description: 'TODO: Add description',
    url: `guides/${htmlFileName}`,
    icon: icon,
    category: options.category || 'general',
    tags: options.tags || [],
    difficulty: options.difficulty || 'intermediate'
  };

  // Add to guides.json
  guidesData.push(newGuideEntry);

  try {
    fs.writeFileSync(guidesJsonPath, JSON.stringify(guidesData, null, 2) + '\n', 'utf8');
    console.log(`✓ Added entry to guides.json with ID: ${guideId}`);
  } catch (error) {
    console.error(`ERROR: Failed to update guides.json: ${error.message}`);
    // Clean up HTML file on failure
    try {
      fs.unlinkSync(htmlFilePath);
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }

  // Print success message
  console.log('');
  console.log('='.repeat(60));
  console.log('Guide Created Successfully!');
  console.log('='.repeat(60));
  console.log(`Title:       ${options.title}`);
  console.log(`Slug:        ${slug}`);
  console.log(`ID:          ${guideId}`);
  console.log(`Category:    ${options.category || 'general'}`);
  console.log(`Difficulty:  ${options.difficulty || 'intermediate'}`);
  console.log(`Tags:        ${options.tags && options.tags.length > 0 ? options.tags.join(', ') : 'none'}`);
  console.log(`File:        guides/${htmlFileName}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit the guide file: guides/${htmlFileName}`);
  console.log('     - Add content to each section');
  console.log('     - Update table of contents');
  console.log('     - Add related guide links');
  console.log('  2. Update the description in data/guides.json (currently "TODO: Add description")');
  console.log('  3. Verify the icon and category are appropriate');
  console.log('  4. Run: npm run build (if available) or node scripts/validate.js');
  console.log('');

  process.exit(0);
}

main();
