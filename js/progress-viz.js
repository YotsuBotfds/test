/**
 * Category Progress Visualization Module
 * Displays progress bars showing completion percentage per category
 */

import * as storage from './storage.js';

/**
 * Category color mapping for progress bars
 */
const categoryColors = {
  'survival': '#ff6b6b',         // red
  'medical': '#ff9999',          // light red
  'agriculture': '#53d8a8',      // green
  'building': '#8b7355',         // brown
  'crafts': '#b19cd9',           // purple
  'communications': '#4a9eff',   // blue
  'defense': '#ff8c42',          // orange
  'sciences': '#7ec8e3',         // cyan
  'chemistry': '#ffd700',        // gold
  'society': '#a78bfa',          // violet
  'tools': '#6ee7b7',            // teal
  'salvage': '#9ca3af',          // gray
  'reference': '#d4a574',        // gold
  'specialized': '#b19cd9',      // purple
  'metalworking': '#c084fc',     // light purple
  'primitive-technology': '#92400e', // brown
  'power-generation': '#fbbf24',   // amber
  'transportation': '#60a5fa',   // light blue
  'resource-management': '#a78bfa', // violet
  'culture-knowledge': '#d4a574', // gold
  'biology': '#86efac',          // light green
  'utility': '#cbd5e1'           // slate
};

/**
 * Motivational messages at different milestone percentages
 */
const milestoneMessages = {
  25: '🌱 Growing strong!',
  50: '⚡ Halfway there!',
  75: '🎯 Almost mastered!',
  100: '🏆 Category complete!'
};

/**
 * Get all guides data
 */
async function fetchGuidesData() {
  try {
    const response = await fetch('data/guides.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch guides: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching guides.json:', error);
    throw error;
  }
}

/**
 * Group guides by category and count read/total
 * @param {Array} guides - All guides
 * @param {Object} progress - Progress data keyed by guide ID
 * @returns {Object} Category statistics
 */
function calculateCategoryStats(guides, progress) {
  const stats = {};

  for (const guide of guides) {
    const category = guide.category || 'uncategorized';

    if (!stats[category]) {
      stats[category] = {
        name: getCategoryName(category),
        icon: getCategoryIcon(category),
        total: 0,
        read: 0,
        percentage: 0
      };
    }

    stats[category].total++;

    // Check if guide is marked as completed in progress
    if (progress[guide.id]?.completed) {
      stats[category].read++;
    }
  }

  // Calculate percentages
  for (const category in stats) {
    const stat = stats[category];
    stat.percentage = stat.total > 0 ? Math.round((stat.read / stat.total) * 100) : 0;
  }

  return stats;
}

/**
 * Get category display name
 */
function getCategoryName(category) {
  const categoryMap = {
    'survival': 'Immediate Survival',
    'medical': 'Medical & Health',
    'agriculture': 'Food & Agriculture',
    'building': 'Building & Engineering',
    'crafts': 'Crafts & Trade Skills',
    'communications': 'Communications',
    'defense': 'Security & Defense',
    'sciences': 'Foundational Sciences',
    'chemistry': 'Industrial Chemistry',
    'society': 'Society & Culture',
    'tools': 'Tools & Interactive',
    'salvage': 'Scavenging & Salvage',
    'reference': 'Master Reference',
    'specialized': 'Specialized',
    'metalworking': 'Metalworking',
    'primitive-technology': 'Primitive Technology',
    'power-generation': 'Power Generation',
    'transportation': 'Transportation',
    'resource-management': 'Resource Management',
    'culture-knowledge': 'Culture & Knowledge',
    'biology': 'Biology',
    'utility': 'Utilities'
  };

  return categoryMap[category] || category;
}

/**
 * Get category icon
 */
function getCategoryIcon(category) {
  const iconMap = {
    'survival': '🔥',
    'medical': '🏥',
    'agriculture': '🌾',
    'building': '🔨',
    'crafts': '⚒️',
    'communications': '📡',
    'defense': '🛡️',
    'sciences': '🔬',
    'chemistry': '🏭',
    'society': '🏛️',
    'tools': '🛠️',
    'salvage': '♻️',
    'reference': '📚',
    'specialized': '🔧',
    'metalworking': '⚒️',
    'primitive-technology': '🪨',
    'power-generation': '⚡',
    'transportation': '🚗',
    'resource-management': '📦',
    'culture-knowledge': '📖',
    'biology': '🧬',
    'utility': '⚙️'
  };

  return iconMap[category] || '📄';
}

/**
 * Get milestone message for a percentage
 */
function getMilestoneMessage(percentage) {
  for (const milestone of [100, 75, 50, 25]) {
    if (percentage >= milestone) {
      return milestoneMessages[milestone];
    }
  }
  return '';
}

/**
 * Create a progress item element
 */
function createProgressItem(category, stats) {
  const item = document.createElement('div');
  item.className = 'progress-item';
  item.setAttribute('data-category', category);

  const color = categoryColors[category] || '#d4a574';
  const milestone = getMilestoneMessage(stats.percentage);

  item.innerHTML = `
    <div class="progress-header">
      <span class="progress-category-name">
        <span class="progress-icon">${stats.icon}</span>
        ${stats.name}
      </span>
      <span class="progress-count">${stats.read}/${stats.total}</span>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${stats.percentage}%; background-color: ${color};"></div>
      </div>
      <div class="progress-text">${stats.percentage}%</div>
    </div>
    ${milestone ? `<div class="progress-milestone">${milestone}</div>` : ''}
  `;

  return item;
}

/**
 * Create and render the progress visualization section
 */
async function renderProgressVisualization() {
  try {
    // Fetch guides and progress data
    const guides = await fetchGuidesData();
    const progress = storage.getProgress();

    // Calculate stats
    const stats = calculateCategoryStats(guides, progress);

    // Create or get the progress section
    let progressSection = document.getElementById('category-progress');
    if (!progressSection) {
      progressSection = document.createElement('section');
      progressSection.id = 'category-progress';
      progressSection.className = 'category-progress';

      // Insert before guides-container
      const guidesContainer = document.getElementById('guides-container');
      if (guidesContainer) {
        guidesContainer.parentNode.insertBefore(progressSection, guidesContainer);
      } else {
        document.body.appendChild(progressSection);
      }
    }

    // Clear existing content
    progressSection.innerHTML = '';

    // Add title
    const title = document.createElement('h2');
    title.className = 'progress-section-title';
    title.textContent = '📈 Your Progress';
    progressSection.appendChild(title);

    // Define category order (same as cards.js)
    const categoryOrder = [
      'survival',
      'medical',
      'agriculture',
      'building',
      'crafts',
      'metalworking',
      'communications',
      'defense',
      'sciences',
      'chemistry',
      'power-generation',
      'transportation',
      'society',
      'resource-management',
      'salvage',
      'tools',
      'reference',
      'specialized',
    ];

    // Get ordered categories
    const orderedCategories = [
      ...categoryOrder.filter((cat) => cat in stats),
      ...Object.keys(stats)
        .filter((cat) => !categoryOrder.includes(cat) && cat !== 'uncategorized')
        .sort(),
    ];

    // Render progress items in order
    for (const category of orderedCategories) {
      const progressItem = createProgressItem(category, stats[category]);
      progressSection.appendChild(progressItem);
    }

  } catch (error) {
    console.error('Error rendering progress visualization:', error);
  }
}

/**
 * Update progress visualization (called when progress changes)
 */
export async function updateProgressVisualization() {
  await renderProgressVisualization();
}

/**
 * Initialize the progress visualization module
 */
export async function init() {
  try {
    // Render initial visualization
    await renderProgressVisualization();

    // Update when progress is updated (listen for storage changes)
    window.addEventListener('storage', async (event) => {
      if (event.key === 'compendium-progress') {
        await updateProgressVisualization();
      }
    });

    // Also listen for custom progress update events
    window.addEventListener('progressUpdated', async () => {
      await updateProgressVisualization();
    });

  } catch (error) {
    console.error('Failed to initialize progress visualization:', error);
  }
}
