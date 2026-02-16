/**
 * Tools Navigation Module
 * Creates an interactive "Tools & Interactive" section in the main navigation
 * Shows tool cards with descriptions and icons that link to interactive tools
 */

const TOOLS_DATA = [
  {
    id: 'scenario-planner',
    icon: '🎯',
    title: 'Scenario Planner',
    description: 'Describe a situation and get relevant guides, skills, and resources',
    file: 'tools/scenario-planner.html'
  },
  {
    id: 'tech-tree',
    icon: '🌳',
    title: 'Tech Tree',
    description: 'Interactive map of all 240+ guides with connections between topics',
    file: 'tools/tech-tree-v2.html'
  },
  {
    id: 'combo-projects',
    icon: '🔧',
    title: 'Combo Projects',
    description: '75 multi-skill projects combining carpentry, metalwork, food, and more',
    file: 'tools/combo-projects.html'
  },
  {
    id: 'quick-reference',
    icon: '📋',
    title: 'Quick Reference',
    description: 'Essential survival quick reference cards',
    file: 'tools/quick-reference-cards.html'
  },
  {
    id: 'skill-assessments',
    icon: '📊',
    title: 'Skill Assessments',
    description: 'Test your knowledge and track competency',
    file: 'tools/skill-assessments.html'
  },
  {
    id: 'visual-diagrams',
    icon: '📐',
    title: 'Visual Diagrams',
    description: 'Interactive visual guides and diagrams',
    file: 'tools/visual-diagrams.html'
  },
  {
    id: 'reference-tables',
    icon: '📊',
    title: 'Reference Tables',
    description: 'Browse reference spreadsheets and data tables',
    file: 'tools/reference-tables.html'
  },
  {
    id: 'what-can-i-build',
    icon: '🔨',
    title: 'What Can I Build?',
    description: 'Select materials and discover what projects you can create',
    file: 'tools/what-can-i-build.html'
  },
  {
    id: 'glossary',
    icon: '📖',
    title: 'Glossary',
    description: 'Search survival terminology and technical terms',
    file: 'tools/glossary.html'
  }
];

/**
 * Create the tools section with cards
 * @returns {HTMLElement} The tools section element
 */
function createToolsSection() {
  // Create section wrapper
  const section = document.createElement('section');
  section.id = 'sec-tools';
  section.className = 'tools-section';

  // Create section header
  const header = document.createElement('h2');
  header.className = 'section-heading';
  header.innerHTML = '🛠️ <span>Tools &amp; Interactive</span><span class="section-count">' + TOOLS_DATA.length + ' tools</span>';
  section.appendChild(header);

  // Create tools grid
  const grid = document.createElement('div');
  grid.className = 'tools-grid';

  // Create tool cards
  TOOLS_DATA.forEach(tool => {
    const card = document.createElement('a');
    card.href = tool.file;
    card.className = 'tool-card';
    card.title = tool.description;

    card.innerHTML = `
      <span class="tool-icon">${tool.icon}</span>
      <h3>${tool.title}</h3>
      <p>${tool.description}</p>
    `;

    grid.appendChild(card);
  });

  section.appendChild(grid);
  return section;
}

/**
 * Initialize the tools navigation section
 * Inserts the tools section into the guides container when appropriate
 * Shows only when "Tools" filter is active OR "All Guides" is selected
 */
export function init() {
  // Create the tools section
  const toolsSection = createToolsSection();

  // Get the guides container
  const guidesContainer = document.getElementById('guides-container');
  if (!guidesContainer) {
    return;
  }

  // Store reference to tools section for filter updates
  guidesContainer.toolsSection = toolsSection;

  // Initially show tools section if "all" filter is active
  const allFilterBtn = document.querySelector('[data-filter="all"]');
  if (allFilterBtn && allFilterBtn.classList.contains('active')) {
    guidesContainer.insertBefore(toolsSection, guidesContainer.firstChild);
  }

  // Listen for filter changes to show/hide tools section
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = e.target.getAttribute('data-filter');

      // Show tools section for "all" or "tools" filters
      if (filter === 'all' || filter === 'tools') {
        if (!toolsSection.parentElement) {
          guidesContainer.insertBefore(toolsSection, guidesContainer.firstChild);
        }
        // For "tools" filter, hide all guide cards
        if (filter === 'tools') {
          document.querySelectorAll('.card[data-guide]').forEach(card => {
            card.style.display = 'none';
          });
        }
      } else {
        // Hide tools section for other filters and show guide cards
        if (toolsSection.parentElement) {
          toolsSection.remove();
        }
        document.querySelectorAll('.card[data-guide]').forEach(card => {
          card.style.display = '';
        });
      }
    });
  });
}
