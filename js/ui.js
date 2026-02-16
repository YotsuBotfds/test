/**
 * UI Module - Theme toggle, filters, and back-to-top button
 */

import * as storage from './storage.js';
import { decorativeEmoji } from './utils.js';

/**
 * Initialize theme toggle
 */
export function initializeThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  const savedTheme = storage.getTheme();
  document.documentElement.setAttribute('data-theme', savedTheme);
  // Use decorative emoji since theme toggle is a purely visual control
  toggle.innerHTML = decorativeEmoji(savedTheme === 'dark' ? '☀️' : '🌙');
  toggle.setAttribute('aria-label', `Switch to ${savedTheme === 'dark' ? 'light' : 'dark'} theme`);

  toggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    storage.setTheme(next);
    toggle.innerHTML = decorativeEmoji(next === 'dark' ? '☀️' : '🌙');
    toggle.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} theme`);
  });
}

/**
 * Initialize filter buttons
 * Re-queries cards from the DOM on each click so it works with dynamically rendered cards.
 */
export function initializeFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');

      // Re-query cards fresh from the DOM each time (handles dynamic re-renders)
      const cards = document.querySelectorAll('.card[data-guide]');
      const progress = storage.getProgress();

      let visibleCount = 0;

      cards.forEach(card => {
        const tags = card.getAttribute('data-tags') || '';
        const guideId = card.getAttribute('data-guide');
        const category = card.getAttribute('data-category') || '';
        const difficulty = card.getAttribute('data-difficulty') || '';
        const isRead = progress[guideId]?.completed;
        let show = true;

        if (filter === 'all') show = true;
        else if (filter === 'critical') show = tags.includes('critical');
        else if (filter === 'essential') show = tags.includes('essential');
        else if (filter === 'rebuild') show = tags.includes('rebuild');
        else if (filter === 'new') show = tags.includes('new');
        else if (filter === 'unread') show = !isRead;
        else if (filter === 'completed') show = isRead;
        else if (filter === 'beginner') show = difficulty === 'beginner';
        else if (filter === 'intermediate') show = difficulty === 'intermediate';
        else if (filter === 'advanced') show = difficulty === 'advanced';
        else if (filter === 'tools') show = category === 'tools';

        // Use class-based approach for animated transitions
        if (show) {
          card.classList.remove('card-hidden');
          card.classList.add('card-visible');
          visibleCount++;
        } else {
          card.classList.remove('card-visible');
          card.classList.add('card-hidden');
        }
      });

      // Hide/show section headings based on whether they have visible cards
      updateSectionHeadingVisibility();

      // Inject empty state message if no cards are visible
      showEmptyStateIfNeeded(filter);

      // Announce filter change to screen readers
      const guidesContainer = document.getElementById('guides-container');
      if (guidesContainer) {
        guidesContainer.setAttribute('aria-live', 'polite');
        guidesContainer.setAttribute('aria-label', `Showing ${visibleCount} guides filtered by ${filter}`);
      }
    });

    // Add keyboard support for filter buttons
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });
}

/**
 * Show empty state message if no cards match the current filter
 * @param {string} filter - The active filter name
 */
function showEmptyStateIfNeeded(filter) {
  const guidesContainer = document.getElementById('guides-container');
  if (!guidesContainer) return;

  // Remove any existing empty state
  const existingEmpty = guidesContainer.querySelector('.empty-state');
  if (existingEmpty) {
    existingEmpty.remove();
  }

  // Check if any cards are visible
  const visibleCards = guidesContainer.querySelectorAll('.card-visible');
  if (visibleCards.length > 0) return; // Cards are visible, don't show empty state

  // Empty state messages
  const emptyMessages = {
    'completed': '📖 No completed guides yet — start with the Reading Order!',
    'unread': '🎉 You\'ve read everything! Amazing!',
    'new': '✨ No new guides since your last visit.',
    'critical': '✅ No critical guides match the current view.',
    'essential': '🎯 No essential guides in this view.',
    'beginner': '🌱 No beginner guides in this view.',
    'intermediate': '⚡ No intermediate guides in this view.',
    'advanced': '🏆 No advanced guides in this view.',
    'default': 'No guides match this filter.'
  };

  const message = emptyMessages[filter] || emptyMessages['default'];

  // Create and insert empty state element
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.setAttribute('role', 'status');
  emptyState.textContent = message;

  guidesContainer.appendChild(emptyState);
}

/**
 * Update section heading visibility based on whether they have any visible cards.
 * Works with both flat card layout (legacy) and card-section containers (virtual scroll).
 */
function updateSectionHeadingVisibility() {
  const container = document.getElementById('guides-container');
  if (!container) return;

  const children = Array.from(container.children);
  let currentHeading = null;
  let currentSection = null;

  for (const child of children) {
    if (child.classList.contains('section-heading') || child.tagName === 'H2') {
      // Before moving to next section, update the previous heading
      if (currentHeading && currentSection) {
        const visibleCards = currentSection.querySelectorAll('.card:not([style*="display: none"])');
        currentHeading.style.display = visibleCards.length > 0 ? '' : 'none';
        currentSection.style.display = visibleCards.length > 0 ? '' : 'none';
      }
      currentHeading = child;
      currentSection = null;
    } else if (child.classList.contains('card-section')) {
      currentSection = child;
    } else if (child.classList.contains('card')) {
      // Legacy flat layout fallback
      if (!currentSection) {
        if (child.style.display !== 'none' && currentHeading) {
          currentHeading.style.display = '';
        }
      }
    }
  }

  // Handle the last section
  if (currentHeading && currentSection) {
    const visibleCards = currentSection.querySelectorAll('.card:not([style*="display: none"])');
    currentHeading.style.display = visibleCards.length > 0 ? '' : 'none';
    currentSection.style.display = visibleCards.length > 0 ? '' : 'none';
  }

  // Also hide the "What's New" section if present and filter is active
  const whatsNewSection = container.querySelector('.whats-new-section');
  if (whatsNewSection) {
    const activeFilter = document.querySelector('.filter-btn.active');
    const filter = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
    whatsNewSection.style.display = filter === 'all' ? '' : 'none';
  }
}

/**
 * Initialize back-to-top button
 */
export function initializeBackToTop() {
  const backBtn = document.getElementById('back-to-top');
  if (!backBtn) return;

  window.addEventListener('scroll', () => {
    backBtn.style.display = window.scrollY > window.innerHeight ? 'block' : 'none';
  });

  backBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/**
 * Update progress display
 * @param {NodeList} cards - Card elements from DOM
 */
export function updateProgressDisplay(cards) {
  const progress = storage.getProgress();
  let readCount = 0;

  cards.forEach(card => {
    const guideId = card.getAttribute('data-guide');
    const check = card.querySelector('.read-check');
    if (progress[guideId] && progress[guideId].completed) {
      if (check) check.classList.add('done');
      readCount++;
    }
  });

  const progressCount = document.getElementById('progress-count');
  const totalGuides = document.getElementById('total-guides');
  if (progressCount) progressCount.textContent = readCount;
  if (totalGuides) totalGuides.textContent = cards.length;
}
