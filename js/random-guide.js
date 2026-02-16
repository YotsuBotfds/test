/**
 * Random Guide Suggestion Module
 * Provides "I'm Feeling Lucky" functionality for discovering random guides
 * Weighted toward unread guides (80% chance unread, 20% any)
 */

import * as storage from './storage.js';
import * as cards from './cards.js';
import { escapeHtml } from './utils.js';

let allGuidesData = [];

/**
 * Fetch guides data
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

// escapeHtml imported from utils.js

/**
 * Get a random guide with weighted preference for unread guides
 * @param {Object} options - Filter options
 * @param {string} options.category - Filter by category (optional)
 * @param {string} options.difficulty - Filter by difficulty (optional)
 * @returns {Object|null} Random guide object or null if no guides match
 */
export function getRandomGuide(options = {}) {
  if (allGuidesData.length === 0) {
    console.warn('No guides data available');
    return null;
  }

  const progress = storage.getProgress();

  // Filter guides based on options
  let filtered = allGuidesData;

  if (options.category) {
    filtered = filtered.filter(g => g.category === options.category);
  }

  if (options.difficulty) {
    filtered = filtered.filter(g => g.difficulty === options.difficulty);
  }

  if (filtered.length === 0) {
    console.warn('No guides match the selected filters');
    return null;
  }

  // Separate unread and read guides
  const unreadGuides = filtered.filter(g => !progress[g.id]?.completed);
  const readGuides = filtered.filter(g => progress[g.id]?.completed);

  // Choose guide with weighted probability
  let selectedGuide;
  const useUnread = Math.random() < 0.8; // 80% chance to pick unread

  if (useUnread && unreadGuides.length > 0) {
    selectedGuide = unreadGuides[Math.floor(Math.random() * unreadGuides.length)];
  } else if (readGuides.length > 0) {
    selectedGuide = readGuides[Math.floor(Math.random() * readGuides.length)];
  } else if (unreadGuides.length > 0) {
    selectedGuide = unreadGuides[Math.floor(Math.random() * unreadGuides.length)];
  } else {
    selectedGuide = filtered[Math.floor(Math.random() * filtered.length)];
  }

  return selectedGuide;
}

/**
 * Create a preview card element for a guide
 * @param {Object} guide - Guide data object
 * @returns {HTMLElement} Preview card element
 */
function createPreviewCard(guide) {
  const card = document.createElement('div');
  card.className = 'random-guide-preview-card';

  const progress = storage.getProgress();
  const isRead = progress[guide.id]?.completed;

  let html = '';

  // Icon and title
  if (guide.icon) {
    html += `<div class="random-guide-icon">${guide.icon}</div>`;
  }

  html += `<div class="random-guide-content">`;
  html += `<h3 class="random-guide-title">${escapeHtml(guide.title)}</h3>`;

  // Status badge
  if (isRead) {
    html += `<span class="random-guide-badge-read" aria-label="Guide already read">Already Read</span>`;
  } else {
    html += `<span class="random-guide-badge-unread" aria-label="Unread guide">Unread</span>`;
  }

  // Description
  if (guide.description) {
    html += `<p class="random-guide-description">${escapeHtml(guide.description)}</p>`;
  }

  // Meta information
  html += `<div class="random-guide-meta">`;

  if (guide.difficulty) {
    const diffLabel = guide.difficulty.charAt(0).toUpperCase() + guide.difficulty.slice(1);
    html += `<span class="random-guide-difficulty difficulty-${guide.difficulty}">${diffLabel}</span>`;
  }

  if (guide.readingTime) {
    html += `<span class="random-guide-reading-time">~${guide.readingTime} min</span>`;
  }

  html += `</div>`;
  html += `</div>`;

  card.innerHTML = html;
  return card;
}

/**
 * Show random guide modal with preview and navigation buttons
 */
export function showRandomGuideModal(options = {}) {
  const guide = getRandomGuide(options);

  if (!guide) {
    alert('No guides found matching your criteria');
    return;
  }

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'random-guide-modal';
  modal.className = 'random-guide-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'random-guide-title');

  // Create modal content wrapper
  const content = document.createElement('div');
  content.className = 'random-guide-modal-content';

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'random-guide-close-btn';
  closeBtn.setAttribute('aria-label', 'Close random guide modal');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    modal.remove();
    document.body.style.overflow = '';
  });

  content.appendChild(closeBtn);

  // Create preview card
  const previewCard = createPreviewCard(guide);
  content.appendChild(previewCard);

  // Create buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'random-guide-buttons';

  // Go to Guide button
  const goBtn = document.createElement('button');
  goBtn.className = 'random-guide-btn random-guide-btn-primary';
  goBtn.textContent = 'Go to Guide';
  goBtn.addEventListener('click', () => {
    modal.remove();
    document.body.style.overflow = '';
    window.location.href = guide.url || `guides/${guide.id}.html`;
  });

  // Try Another button
  const tryAnotherBtn = document.createElement('button');
  tryAnotherBtn.className = 'random-guide-btn random-guide-btn-secondary';
  tryAnotherBtn.textContent = 'Try Another';
  tryAnotherBtn.addEventListener('click', () => {
    modal.remove();
    document.body.style.overflow = '';
    showRandomGuideModal(options); // Show another random guide
  });

  buttonsContainer.appendChild(goBtn);
  buttonsContainer.appendChild(tryAnotherBtn);
  content.appendChild(buttonsContainer);

  modal.appendChild(content);

  // Add to page
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // Focus the primary button for accessibility
  goBtn.focus();

  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Close when clicking outside modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      document.body.style.overflow = '';
    }
  });
}

/**
 * Initialize the random guide module
 */
export async function init() {
  try {
    allGuidesData = await fetchGuidesData();

    // Set up the random guide button
    const randomGuideBtn = document.getElementById('random-guide-btn');
    if (randomGuideBtn) {
      randomGuideBtn.addEventListener('click', () => {
        showRandomGuideModal();
      });
    }
  } catch (error) {
    console.error('Failed to initialize random guide module:', error);
  }
}
