/**
 * Recently Viewed Module - Tracks and displays recently viewed guides
 * Stores last 10 viewed guides and displays the last 5 as a "Continue Learning" section
 */

import * as storage from './storage.js';

const STORAGE_KEY = 'compendium-recently-viewed';
const MAX_VIEWS = 10;
const DISPLAY_COUNT = 5;

/**
 * Track a guide view
 * @param {string} guideId - The guide ID
 * @param {string} title - The guide title
 * @param {string} icon - The guide icon (emoji)
 */
export function trackView(guideId, title, icon, href) {
  const views = getRecentViews();

  // Remove if already in list (to move it to top)
  const filtered = views.filter(v => v.guideId !== guideId);

  // Add new view at the top with current timestamp
  const newView = {
    guideId,
    title,
    icon,
    href: href || null,
    timestamp: Date.now()
  };

  // Keep only the last MAX_VIEWS
  const updated = [newView, ...filtered].slice(0, MAX_VIEWS);

  storage.set(STORAGE_KEY, updated);
}

/**
 * Get recently viewed guides
 * @returns {Array} Array of recently viewed guide objects
 */
export function getRecentViews() {
  return storage.get(STORAGE_KEY, []);
}

/**
 * Format time ago text
 * @param {number} timestamp - Milliseconds since epoch
 * @returns {string} Human-readable time ago text
 */
function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return days === 1 ? 'yesterday' : `${days}d ago`;
  }
  if (hours > 0) {
    return hours === 1 ? '1h ago' : `${hours}h ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1m ago' : `${minutes}m ago`;
  }
  return 'just now';
}

/**
 * Create a recent card element
 * @param {Object} view - Recently viewed object
 * @returns {HTMLElement} Card element
 */
function createRecentCard(view) {
  const card = document.createElement('a');
  card.className = 'recent-card';
  // Use stored href from original card, fall back to guide ID pattern
  card.href = view.href || `guides/${view.guideId}.html`;
  card.setAttribute('data-guide', view.guideId);

  const timeAgo = formatTimeAgo(view.timestamp);

  card.innerHTML = `
    <span class="recent-icon">${view.icon}</span>
    <div class="recent-info">
      <h4>${view.title}</h4>
      <span class="time-ago">Last viewed ${timeAgo}</span>
    </div>
  `;

  return card;
}

/**
 * Render the recently viewed section
 */
function renderRecentlyViewed() {
  const views = getRecentViews().slice(0, DISPLAY_COUNT);

  // Find or create the section
  let section = document.getElementById('recently-viewed-section');

  if (views.length === 0) {
    // Hide section if no recent views
    if (section) {
      section.style.display = 'none';
    }
    return;
  }

  // Create section if it doesn't exist
  if (!section) {
    const guidesContainer = document.getElementById('guides-container');
    if (!guidesContainer) return;

    section = document.createElement('section');
    section.id = 'recently-viewed-section';
    section.className = 'recently-viewed';

    // Insert at the top of the guides container
    guidesContainer.insertAdjacentElement('beforebegin', section);
  }

  // Clear and rebuild
  section.innerHTML = `
    <h2 class="section-heading">📖 Continue Learning</h2>
    <div class="recent-cards"></div>
  `;

  const cardsContainer = section.querySelector('.recent-cards');
  for (const view of views) {
    const card = createRecentCard(view);
    cardsContainer.appendChild(card);
  }

  section.style.display = 'block';
}

/**
 * Initialize the recently viewed module
 * Renders the section and sets up event listeners
 */
export function init() {
  // Render on initialization
  renderRecentlyViewed();

  // Listen for card clicks to track views
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-guide]');
    if (card) {
      const guideId = card.getAttribute('data-guide');
      const title = card.querySelector('h3')?.textContent || 'Guide';
      const icon = card.querySelector('.icon')?.textContent || '📄';
      const href = card.getAttribute('href');

      trackView(guideId, title, icon, href);

      // Update recently viewed section
      renderRecentlyViewed();
    }
  });

  // Listen for cardsRerendered event and re-render
  window.addEventListener('cardsRerendered', () => {
    renderRecentlyViewed();
  });
}
