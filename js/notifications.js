/**
 * Guide Update Notifications Module
 * Tracks guide updates and new guides since last visit
 * Shows badges and "What's New" section
 */

const STORAGE_KEY_LAST_VISIT = 'app_last_visit_date';
const STORAGE_KEY_GUIDE_READS = 'guide_last_read_dates';

// Store previous visit date before overwriting so What's New can use it
let previousVisitDate = null;

/**
 * Initialize the notifications system
 * Saves the previous visit date for What's New checks,
 * then updates to today AFTER cards have rendered.
 */
export async function init() {
  // Save the previous visit date BEFORE overwriting
  previousVisitDate = localStorage.getItem(STORAGE_KEY_LAST_VISIT);

  // Defer updating the visit date until after cards render (so What's New works)
  window.addEventListener('cardsRendered', () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(STORAGE_KEY_LAST_VISIT, today);
  }, { once: true });
}

/**
 * Get the last visit date (uses the saved previous date, not the current one)
 * @returns {string|null} Date in YYYY-MM-DD format or null if first visit
 */
function getLastVisitDate() {
  // Use saved previous visit date if available (before it was overwritten)
  return previousVisitDate || localStorage.getItem(STORAGE_KEY_LAST_VISIT);
}

/**
 * Get last read dates for guides
 * @returns {Object} Object mapping guide IDs to last read dates
 */
function getGuideReadDates() {
  const stored = localStorage.getItem(STORAGE_KEY_GUIDE_READS);
  return stored ? JSON.parse(stored) : {};
}

/**
 * Update last read date for a guide
 * @param {string} guideId - Guide ID
 */
export function markGuideAsRead(guideId) {
  const today = new Date().toISOString().split('T')[0];
  const dates = getGuideReadDates();
  dates[guideId] = today;
  localStorage.setItem(STORAGE_KEY_GUIDE_READS, JSON.stringify(dates));
}

/**
 * Get new guides (added since last visit)
 * @param {Array} allGuides - All guides from guides.json
 * @returns {Array} Array of new guide objects
 */
export function getNewGuides(allGuides) {
  const lastVisit = getLastVisitDate();

  // If first visit, no guides are "new"
  if (!lastVisit) {
    return [];
  }

  return allGuides.filter(guide => {
    // Compare lastUpdated dates
    const guideDate = guide.lastUpdated || '2026-01-01';
    return guideDate > lastVisit;
  });
}

/**
 * Get updated guides (modified since last read)
 * @param {Array} allGuides - All guides from guides.json
 * @returns {Array} Array of updated guide objects
 */
export function getUpdatedGuides(allGuides) {
  const guideDates = getGuideReadDates();

  return allGuides.filter(guide => {
    const guideLastUpdated = guide.lastUpdated || '2026-01-01';
    const lastReadDate = guideDates[guide.id];

    // If never read, don't mark as updated
    if (!lastReadDate) {
      return false;
    }

    // Check if guide was updated after last read
    return guideLastUpdated > lastReadDate;
  });
}

/**
 * Create What's New section HTML
 * @param {Array} allGuides - All guides from guides.json
 * @returns {HTMLElement|null} Section element or null if no new/updated guides
 */
export function createWhatsNewSection(allGuides) {
  const newGuides = getNewGuides(allGuides);
  const updatedGuides = getUpdatedGuides(allGuides);

  const totalCount = newGuides.length + updatedGuides.length;

  if (totalCount === 0) {
    return null;
  }

  const section = document.createElement('div');
  section.className = 'whats-new-section';
  section.id = 'whats-new-section';

  // Header with count
  const header = document.createElement('div');
  header.className = 'whats-new-header';
  header.innerHTML = `
    <div class="whats-new-title">
      <span class="whats-new-icon">✨</span>
      <span>What's New</span>
      <span class="whats-new-count">${totalCount}</span>
    </div>
    <button class="whats-new-toggle" aria-expanded="true" aria-controls="whats-new-content">
      <span class="toggle-icon">▼</span>
    </button>
  `;
  section.appendChild(header);

  // Collapsible content
  const content = document.createElement('div');
  content.className = 'whats-new-content';
  content.id = 'whats-new-content';

  // Check localStorage to determine initial state
  const isCollapsed = localStorage.getItem('whats-new-collapsed') === 'true';
  if (!isCollapsed) {
    // Default to expanded on first visit, add expanded class
    content.classList.add('expanded');
  } else {
    // Keep collapsed if user previously collapsed it
    header.querySelector('.whats-new-toggle').setAttribute('aria-expanded', 'false');
  }

  // New guides list
  if (newGuides.length > 0) {
    const newSection = document.createElement('div');
    newSection.className = 'whats-new-category';
    newSection.innerHTML = `
      <h3 class="whats-new-category-title">
        <span class="category-icon">🆕</span>
        <span>New Guides (${newGuides.length})</span>
      </h3>
      <ul class="whats-new-list">
        ${newGuides.map(guide => `
          <li class="whats-new-item">
            <span class="item-icon">${guide.icon || '📘'}</span>
            <span class="item-title">${guide.title}</span>
            <span class="item-badge">New</span>
          </li>
        `).join('')}
      </ul>
    `;
    content.appendChild(newSection);
  }

  // Updated guides list
  if (updatedGuides.length > 0) {
    const updatedSection = document.createElement('div');
    updatedSection.className = 'whats-new-category';
    updatedSection.innerHTML = `
      <h3 class="whats-new-category-title">
        <span class="category-icon">🔄</span>
        <span>Updated Guides (${updatedGuides.length})</span>
      </h3>
      <ul class="whats-new-list">
        ${updatedGuides.map(guide => `
          <li class="whats-new-item">
            <span class="item-icon">${guide.icon || '📘'}</span>
            <span class="item-title">${guide.title}</span>
            <span class="item-badge">Updated</span>
          </li>
        `).join('')}
      </ul>
    `;
    content.appendChild(updatedSection);
  }

  section.appendChild(content);

  // Add toggle functionality
  const toggleBtn = header.querySelector('.whats-new-toggle');
  toggleBtn.addEventListener('click', () => {
    const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', !isExpanded);
    content.classList.toggle('expanded');

    // After first collapse interaction, save to localStorage
    if (isExpanded) {
      // User is collapsing it
      localStorage.setItem('whats-new-collapsed', 'true');
    } else {
      // User is expanding it after a previous collapse
      localStorage.removeItem('whats-new-collapsed');
    }
  });

  return section;
}

/**
 * Add update badge to a card element
 * @param {HTMLElement} card - Card element
 * @param {Object} guide - Guide data object
 * @param {Array} allGuides - All guides for context
 */
export function addBadgesToCard(card, guide, allGuides = []) {
  const guideDates = getGuideReadDates();
  const lastReadDate = guideDates[guide.id];

  // Check if guide is updated since last read
  if (lastReadDate) {
    const guideLastUpdated = guide.lastUpdated || '2026-01-01';
    if (guideLastUpdated > lastReadDate) {
      const badge = document.createElement('span');
      badge.className = 'notification-badge badge-updated';
      badge.textContent = 'Updated';
      badge.title = `Updated on ${guideLastUpdated}`;
      card.appendChild(badge);
    }
  }

  // Check if guide is new since last visit
  const lastVisit = getLastVisitDate();
  if (lastVisit) {
    const guideDate = guide.lastUpdated || '2026-01-01';
    if (guideDate > lastVisit) {
      const badge = document.createElement('span');
      badge.className = 'notification-badge badge-new';
      badge.textContent = 'New';
      badge.title = `Added on ${guideDate}`;
      card.appendChild(badge);
    }
  }
}

/**
 * Show a toast notification
 * @param {string} message - Toast message text
 * @param {number} duration - How long to show in milliseconds (default: 3000)
 * @param {boolean} includeAction - Whether to show an action button (optional)
 * @param {string} actionText - Text for action button (optional)
 * @param {Function} onAction - Callback when action button is clicked (optional)
 */
export function showToast(message, duration = 3000, includeAction = false, actionText = '', onAction = null) {
  // Remove existing toast if present
  const existingToast = document.querySelector('.toast.visible');
  if (existingToast) {
    existingToast.classList.remove('visible');
    setTimeout(() => existingToast.remove(), 300);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');

  let innerHTML = message;
  if (includeAction && actionText) {
    innerHTML += `<button class="toast-action">${actionText}</button>`;
  }
  toast.innerHTML = innerHTML;

  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Add action listener if provided
  if (includeAction && onAction) {
    const actionBtn = toast.querySelector('.toast-action');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => {
        onAction();
        hideToast(toast);
      });
    }
  }

  // Auto-hide after duration
  const timeoutId = setTimeout(() => {
    hideToast(toast);
  }, duration);

  // Store timeout ID on toast for manual dismissal
  toast._timeoutId = timeoutId;
}

/**
 * Hide and remove a toast element
 * @param {HTMLElement} toast - Toast element to hide
 */
function hideToast(toast) {
  if (!toast || !document.body.contains(toast)) return;

  // Clear any pending timeout
  if (toast._timeoutId) {
    clearTimeout(toast._timeoutId);
  }

  toast.classList.remove('visible');
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.remove();
    }
  }, 300);
}
