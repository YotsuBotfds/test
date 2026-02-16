/**
 * Offline Manager UI Module
 * Creates and manages the offline download manager modal interface
 */

import * as offlineManager from './offline-manager.js';

let isModalOpen = false;
let currentProgress = {};

/**
 * Initialize the offline manager UI
 */
export function initUI() {
  createModalHTML();
  attachEventListeners();
  setupProgressListener();
}

/**
 * Create the modal HTML structure
 */
function createModalHTML() {
  // Check if modal already exists
  if (document.getElementById('offline-manager-modal')) {
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'offline-manager-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'offline-manager-title');
  modal.setAttribute('aria-hidden', 'true');

  modal.innerHTML = `
    <div class="offline-manager-overlay" onclick="if(event.target === this) offlineManagerUI.closeModal()"></div>
    <div class="offline-manager-content">
      <div class="offline-manager-header">
        <h2 id="offline-manager-title">📥 Manage Offline Downloads</h2>
        <button class="offline-manager-close" onclick="offlineManagerUI.closeModal()" aria-label="Close offline manager">×</button>
      </div>

      <div class="offline-manager-body">
        <div class="offline-info-bar">
          <div class="offline-info-item">
            <span class="offline-info-label">Total Storage Used:</span>
            <span class="offline-info-value" id="total-storage">0 KB</span>
          </div>
          <div class="offline-info-item">
            <span class="offline-info-label">Categories Cached:</span>
            <span class="offline-info-value" id="categories-cached">0</span>
          </div>
        </div>

        <div class="offline-manager-tabs">
          <button class="offline-tab-btn active" data-tab="categories">Categories</button>
          <button class="offline-tab-btn" data-tab="help">Help</button>
        </div>

        <div id="categories-tab" class="offline-tab-content active">
          <div class="offline-actions">
            <button class="offline-action-btn cache-all-btn" id="cache-all-btn" onclick="offlineManagerUI.cacheAll()">
              💾 Cache All
            </button>
            <button class="offline-action-btn clear-all-btn" id="clear-all-btn" onclick="offlineManagerUI.clearAll()">
              🗑️ Clear All
            </button>
          </div>

          <div class="offline-categories-list" id="categories-list">
            <!-- Categories will be populated here -->
          </div>
        </div>

        <div id="help-tab" class="offline-tab-content">
          <div class="offline-help-content">
            <h3>How to Use Offline Mode</h3>
            <ul>
              <li><strong>Select Categories:</strong> Toggle the switch next to each category to download it for offline use</li>
              <li><strong>Monitor Progress:</strong> Watch the progress bar while guides are being cached</li>
              <li><strong>View Badges:</strong> Cached guides will show an "Available Offline" badge</li>
              <li><strong>Storage Size:</strong> Total storage shows how much space is used</li>
              <li><strong>Quick Actions:</strong> Use "Cache All" to download everything, or "Clear All" to remove all offline guides</li>
            </ul>
            <p><strong>Note:</strong> Offline guides are stored in your browser's cache. Clearing browser data will remove them.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  populateCategories();
}

/**
 * Populate categories list
 */
async function populateCategories() {
  const list = document.getElementById('categories-list');
  if (!list) return;

  const categories = offlineManager.getCategoryList();

  if (categories.length === 0) {
    list.innerHTML = '<div class="offline-empty">No categories available</div>';
    return;
  }

  list.innerHTML = categories
    .map(cat => createCategoryItemHTML(cat))
    .join('');

  // Attach event listeners to toggles
  document.querySelectorAll('.offline-toggle').forEach(toggle => {
    toggle.addEventListener('change', handleToggleChange);
  });
}

/**
 * Create category item HTML
 */
function createCategoryItemHTML(category) {
  const sizeText = offlineManager.formatBytes(category.estimatedSize);
  const cachedSizeText = offlineManager.formatBytes(category.cachedSize);

  return `
    <div class="offline-category-item" data-category="${category.id}">
      <div class="offline-category-header">
        <div class="offline-category-info">
          <h4 class="offline-category-name">${category.name}</h4>
          <p class="offline-category-meta">
            ${category.guideCount} guide${category.guideCount !== 1 ? 's' : ''} • ${sizeText}
          </p>
        </div>
        <div class="offline-category-controls">
          <label class="offline-toggle-switch">
            <input
              type="checkbox"
              class="offline-toggle"
              data-category="${category.id}"
              ${category.isCached ? 'checked' : ''}
              aria-label="Toggle offline cache for ${category.name}"
            />
            <span class="offline-toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="offline-category-progress" data-category="${category.id}" style="display: none;">
        <div class="offline-progress-bar">
          <div class="offline-progress-fill" style="width: 0%"></div>
        </div>
        <p class="offline-progress-text">Downloading... <span class="offline-progress-percent">0%</span></p>
      </div>

      <div class="offline-category-cached" data-category="${category.id}" ${!category.isCached ? 'style="display: none;"' : ''}>
        <p class="offline-cached-text">
          ✓ Cached: ${offlineManager.formatBytes(category.cachedSize)} (${category.cachedCount} items)
        </p>
      </div>
    </div>
  `;
}

/**
 * Handle toggle change
 */
async function handleToggleChange(event) {
  const toggle = event.target;
  const category = toggle.dataset.category;
  const isChecked = toggle.checked;
  const categoryItem = toggle.closest('.offline-category-item');

  if (isChecked) {
    // Cache the category
    showProgress(category);
    toggle.disabled = true;

    await offlineManager.cacheCategory(category);

    toggle.disabled = false;
    hideProgress(category);
    updateCachedIndicator(category, true);
    updateTotalStorage();
  } else {
    // Uncache the category
    await offlineManager.uncacheCategory(category);
    updateCachedIndicator(category, false);
    updateTotalStorage();
  }
}

/**
 * Show progress bar for category
 */
function showProgress(category) {
  const progressDiv = document.querySelector(
    `.offline-category-progress[data-category="${category}"]`
  );
  if (progressDiv) {
    progressDiv.style.display = 'block';
  }
}

/**
 * Hide progress bar for category
 */
function hideProgress(category) {
  const progressDiv = document.querySelector(
    `.offline-category-progress[data-category="${category}"]`
  );
  if (progressDiv) {
    progressDiv.style.display = 'none';
  }
}

/**
 * Update cached indicator
 */
function updateCachedIndicator(category, isCached) {
  const cachedDiv = document.querySelector(
    `.offline-category-cached[data-category="${category}"]`
  );
  if (cachedDiv) {
    if (isCached) {
      cachedDiv.style.display = 'block';
      // Update size info
      const categories = offlineManager.getCategoryList();
      const cat = categories.find(c => c.id === category);
      if (cat) {
        cachedDiv.innerHTML = `
          <p class="offline-cached-text">
            ✓ Cached: ${offlineManager.formatBytes(cat.cachedSize)} (${cat.cachedCount} items)
          </p>
        `;
      }
    } else {
      cachedDiv.style.display = 'none';
    }
  }
}

/**
 * Update total storage display
 */
export function updateTotalStorage() {
  const total = offlineManager.getTotalStorageUsed();
  const totalEl = document.getElementById('total-storage');
  if (totalEl) {
    totalEl.textContent = offlineManager.formatBytes(total);
  }

  // Update cached categories count
  const categories = offlineManager.getCategoryList();
  const cachedCount = categories.filter(c => c.isCached).length;
  const cachedEl = document.getElementById('categories-cached');
  if (cachedEl) {
    cachedEl.textContent = cachedCount;
  }
}

/**
 * Setup progress listener
 */
function setupProgressListener() {
  document.addEventListener('offline-manager:progress', (event) => {
    const { category, current, total, percentage } = event.detail;

    const progressBar = document.querySelector(
      `.offline-category-progress[data-category="${category}"] .offline-progress-fill`
    );
    const progressPercent = document.querySelector(
      `.offline-category-progress[data-category="${category}"] .offline-progress-percent`
    );

    if (progressBar) {
      progressBar.style.width = percentage + '%';
    }

    if (progressPercent) {
      progressPercent.textContent = percentage + '%';
    }
  });
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
  // Tab switching
  const tabButtons = document.querySelectorAll('.offline-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      switchTab(tabName);
    });
  });

  // Keyboard shortcut: Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalOpen) {
      closeModal();
    }
  });
}

/**
 * Switch tab
 */
function switchTab(tabName) {
  // Remove active class from all tabs and contents
  document.querySelectorAll('.offline-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelectorAll('.offline-tab-content').forEach(content => {
    content.classList.remove('active');
  });

  // Add active class to clicked tab
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

/**
 * Open modal
 */
export function openModal() {
  const modal = document.getElementById('offline-manager-modal');
  if (modal) {
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('active');
    isModalOpen = true;
    document.body.style.overflow = 'hidden';

    // Refresh data
    updateTotalStorage();
    populateCategories();
  }
}

/**
 * Close modal
 */
export function closeModal() {
  const modal = document.getElementById('offline-manager-modal');
  if (modal) {
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('active');
    isModalOpen = false;
    document.body.style.overflow = 'auto';
  }
}

/**
 * Cache all categories
 */
export async function cacheAll() {
  const btn = document.getElementById('cache-all-btn');
  if (btn) {
    btn.disabled = true;
  }

  const toggles = document.querySelectorAll('.offline-toggle:not(:checked)');

  for (const toggle of toggles) {
    toggle.click();
    // Wait a bit between clicks to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (btn) {
    btn.disabled = false;
  }
}

/**
 * Clear all caches
 */
export async function clearAll() {
  const confirmed = confirm(
    'Are you sure you want to clear all offline downloads? This cannot be undone.'
  );

  if (!confirmed) {
    return;
  }

  const btn = document.getElementById('clear-all-btn');
  if (btn) {
    btn.disabled = true;
  }

  const toggles = document.querySelectorAll('.offline-toggle:checked');

  for (const toggle of toggles) {
    toggle.click();
    // Wait a bit between clicks
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (btn) {
    btn.disabled = false;
  }
}

/**
 * Add offline badge to cached guides (called from main app)
 */
export async function updateGuideOfflineBadges() {
  try {
    const cachedGuides = await offlineManager.getCachedGuides();
    const cards = document.querySelectorAll('.card[data-guide]');

    cards.forEach(card => {
      const guideId = card.dataset.guide;

      if (cachedGuides[guideId]) {
        // Remove old badge if exists
        const oldBadge = card.querySelector('.offline-badge');
        if (oldBadge) {
          oldBadge.remove();
        }

        // Add offline badge
        const badge = document.createElement('div');
        badge.className = 'offline-badge';
        badge.setAttribute('title', 'This guide is available offline');
        badge.innerHTML = '📡';

        card.appendChild(badge);
      } else {
        // Remove badge if not cached
        const badge = card.querySelector('.offline-badge');
        if (badge) {
          badge.remove();
        }
      }
    });
  } catch (error) {
    console.error('Failed to update offline badges:', error);
  }
}
