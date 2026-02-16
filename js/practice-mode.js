/**
 * Practice Mode Module - Track hands-on skill practice
 * Separate from reading progress, focuses on real-world practice
 */

import * as storage from './storage.js';

/**
 * Storage key prefix for practice data
 */
const PRACTICE_KEY = 'compendium-practice';
const PRACTICE_NOTES_KEY = 'compendium-practice-notes';

/**
 * Initialize practice mode module
 */
export function init() {
  // Event listeners are set up when cards are rendered
  document.addEventListener('cardsRendered', attachPracticeListeners);
  document.addEventListener('cardsRerendered', attachPracticeListeners);

  // Also set up if cards are already rendered
  if (document.querySelectorAll('.card[data-guide]').length > 0) {
    attachPracticeListeners();
  }
}

/**
 * Get all practice data from storage
 * @returns {Object} Practice data keyed by guide ID
 */
function getPracticeData() {
  return storage.get(PRACTICE_KEY, {});
}

/**
 * Save practice data to storage
 * @param {Object} practiceData - Practice data object
 */
function savePracticeData(practiceData) {
  storage.set(PRACTICE_KEY, practiceData);
}

/**
 * Mark a guide as practiced
 * @param {string} guideId - The guide ID
 * @param {string} notes - Optional notes about the practice
 * @returns {Object} Updated practice entry
 */
export function markPracticed(guideId, notes = '') {
  const practiceData = getPracticeData();

  if (!practiceData[guideId]) {
    practiceData[guideId] = {};
  }

  practiceData[guideId].practiced = true;
  practiceData[guideId].practiceDate = new Date().toISOString();

  if (notes) {
    practiceData[guideId].notes = notes;
  }

  savePracticeData(practiceData);
  updatePracticeUI(guideId);

  return practiceData[guideId];
}

/**
 * Unmark a guide as practiced
 * @param {string} guideId - The guide ID
 */
export function unmarkPracticed(guideId) {
  const practiceData = getPracticeData();

  if (practiceData[guideId]) {
    practiceData[guideId].practiced = false;
    delete practiceData[guideId].practiceDate;
    delete practiceData[guideId].notes;
  }

  savePracticeData(practiceData);
  updatePracticeUI(guideId);
}

/**
 * Get practice status for a specific guide
 * @param {string} guideId - The guide ID
 * @returns {Object|null} Practice entry or null if not practiced
 */
export function getPracticeStatus(guideId) {
  const practiceData = getPracticeData();
  return practiceData[guideId] || null;
}

/**
 * Get all practiced guides
 * @returns {Object} Object with guide IDs as keys, practice data as values
 */
export function getAllPracticed() {
  const practiceData = getPracticeData();
  const practiced = {};

  for (const [guideId, data] of Object.entries(practiceData)) {
    if (data.practiced) {
      practiced[guideId] = data;
    }
  }

  return practiced;
}

/**
 * Get practice count
 * @returns {number} Number of practiced guides
 */
export function getPracticeCount() {
  return Object.keys(getAllPracticed()).length;
}

/**
 * Get notes for a guide
 * @param {string} guideId - The guide ID
 * @returns {string|null} Notes or null
 */
export function getPracticeNotes(guideId) {
  const status = getPracticeStatus(guideId);
  return status?.notes || null;
}

/**
 * Set notes for a guide
 * @param {string} guideId - The guide ID
 * @param {string} notes - Notes to save
 */
export function setPracticeNotes(guideId, notes) {
  const practiceData = getPracticeData();

  if (!practiceData[guideId]) {
    practiceData[guideId] = { practiced: false };
  }

  practiceData[guideId].notes = storage.sanitize(notes);
  savePracticeData(practiceData);
}

/**
 * Clear all practice data
 */
export function clearAllPractice() {
  storage.set(PRACTICE_KEY, {});
  // Update all practice indicators
  document.querySelectorAll('.card[data-guide]').forEach(card => {
    updatePracticeUI(card.getAttribute('data-guide'));
  });
}

/**
 * Attach practice event listeners to cards
 */
function attachPracticeListeners() {
  document.querySelectorAll('.card[data-guide]').forEach(card => {
    const guideId = card.getAttribute('data-guide');

    // Initialize practice button if not already present
    let practiceBtn = card.querySelector('.practice-btn');
    if (!practiceBtn) {
      practiceBtn = createPracticeButton(guideId);
      card.appendChild(practiceBtn);
    }

    // Add click handler
    practiceBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePracticeStatus(guideId);
    });

    // Update UI to show current state
    updatePracticeUI(guideId);
  });
}

/**
 * Create a practice button element
 * @param {string} guideId - The guide ID
 * @returns {HTMLElement} Practice button element
 */
function createPracticeButton(guideId) {
  const btn = document.createElement('button');
  btn.className = 'practice-btn';
  btn.setAttribute('aria-label', 'Mark as practiced');
  btn.setAttribute('title', 'I\'ve practiced this skill');
  btn.setAttribute('type', 'button');

  // Create icon and text
  const icon = document.createElement('span');
  icon.className = 'practice-icon';
  icon.setAttribute('aria-hidden', 'true');

  btn.appendChild(icon);

  return btn;
}

/**
 * Update practice UI for a card
 * @param {string} guideId - The guide ID
 */
function updatePracticeUI(guideId) {
  const card = document.querySelector(`[data-guide="${guideId}"]`);
  if (!card) return;

  const practiceBtn = card.querySelector('.practice-btn');
  if (!practiceBtn) return;

  const status = getPracticeStatus(guideId);
  const isPracticed = status?.practiced === true;

  if (isPracticed) {
    practiceBtn.classList.add('practiced');
    practiceBtn.setAttribute('aria-label', 'Mark as not practiced');

    // Update icon to show practiced status
    const icon = practiceBtn.querySelector('.practice-icon');
    if (icon) {
      const practiceDate = status.practiceDate ? new Date(status.practiceDate) : new Date();
      const formattedDate = formatDate(practiceDate);
      icon.textContent = '✋';
      practiceBtn.setAttribute('title', `Practiced on ${formattedDate}`);
    }
  } else {
    practiceBtn.classList.remove('practiced');
    practiceBtn.setAttribute('aria-label', 'Mark as practiced');

    const icon = practiceBtn.querySelector('.practice-icon');
    if (icon) {
      icon.textContent = '🔨';
      practiceBtn.setAttribute('title', 'I\'ve practiced this skill');
    }
  }
}

/**
 * Toggle practice status for a guide
 * @param {string} guideId - The guide ID
 */
function togglePracticeStatus(guideId) {
  const status = getPracticeStatus(guideId);

  if (status?.practiced === true) {
    unmarkPracticed(guideId);
  } else {
    markPracticed(guideId);
  }
}

/**
 * Format a date for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted date
 */
function formatDate(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  }
}

/**
 * Filter cards by practice status
 * @param {Array<HTMLElement>} cards - Card elements to filter
 * @param {string} filterType - 'practiced' or 'unpracticed'
 */
export function filterByPracticeStatus(cards, filterType) {
  cards.forEach(card => {
    const guideId = card.getAttribute('data-guide');
    const status = getPracticeStatus(guideId);
    const isPracticed = status?.practiced === true;

    let show = true;
    if (filterType === 'practiced') {
      show = isPracticed;
    } else if (filterType === 'unpracticed') {
      show = !isPracticed;
    }

    card.style.display = show ? '' : 'none';
  });
}

/**
 * Get statistics about practice progress
 * @returns {Object} Practice statistics
 */
export function getPracticeStats() {
  const allGuides = document.querySelectorAll('.card[data-guide]');
  const practiced = getAllPracticed();

  return {
    totalGuides: allGuides.length,
    totalPracticed: Object.keys(practiced).length,
    percentagePracticed: allGuides.length > 0 ? Math.round((Object.keys(practiced).length / allGuides.length) * 100) : 0,
    recentPractice: getRecentPractice(practiced, 7),
    thisWeekPractice: getWeekPractice(practiced)
  };
}

/**
 * Get guides practiced in the last N days
 * @param {Object} practiced - Practiced guides object
 * @param {number} days - Number of days to check
 * @returns {Array} Array of practiced guide IDs
 */
function getRecentPractice(practiced, days = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return Object.entries(practiced)
    .filter(([_, data]) => {
      if (!data.practiceDate) return false;
      return new Date(data.practiceDate) >= cutoffDate;
    })
    .map(([guideId, _]) => guideId);
}

/**
 * Get guides practiced this week (Monday-Sunday)
 * @param {Object} practiced - Practiced guides object
 * @returns {Array} Array of practiced guide IDs
 */
function getWeekPractice(practiced) {
  const today = new Date();
  const firstDayOfWeek = new Date(today);
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  firstDayOfWeek.setDate(diff);
  firstDayOfWeek.setHours(0, 0, 0, 0);

  return Object.entries(practiced)
    .filter(([_, data]) => {
      if (!data.practiceDate) return false;
      return new Date(data.practiceDate) >= firstDayOfWeek;
    })
    .map(([guideId, _]) => guideId);
}
