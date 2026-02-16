/**
 * Search Module - Quick search and autocomplete functionality
 * Features:
 * - Search titles, descriptions, and tags
 * - Highlight matched text
 * - Save recent searches to localStorage
 * - Show recent searches when focused with empty input
 * - Keyboard navigation with arrow keys and Enter
 * - Group results by category
 * - Configurable min characters and max results
 */

import * as storage from './storage.js';
import { escapeHtml } from './utils.js';

let searchInput = null;
let searchResults = null;
let guideData = [];
let currentActiveIndex = -1;
let isInteractingWithResults = false;

// Configuration - can be customized when initializing
let config = {
  minChars: 2,
  maxResults: 8
};

/**
 * Build the guide data array for searching
 * Accepts either a guides JSON array (preferred) or DOM card NodeList (legacy)
 * Also accepts enriched index format with keywords field
 * @param {Array|NodeList} source - Guide data array from guides.json/search-index.json or card elements from DOM
 */
function buildGuideData(source) {
  guideData = [];

  // Check if source is an array of guide objects (from guides.json or enriched search-index)
  if (Array.isArray(source)) {
    guideData = source.map(guide => ({
      title: guide.title || '',
      desc: guide.description || '',
      href: guide.url || `guides/${guide.id}.html`,
      tags: Array.isArray(guide.tags) ? guide.tags.join(' ') : (guide.tags || ''),
      keywords: Array.isArray(guide.keywords) ? guide.keywords.join(' ') : (guide.keywords || ''),
      section: guide.category || ''
    }));
  } else {
    // Legacy: build from DOM card elements
    source.forEach(card => {
      guideData.push({
        title: card.querySelector('h3')?.textContent || '',
        desc: card.querySelector('p')?.textContent || '',
        href: card.getAttribute('href'),
        tags: card.getAttribute('data-tags') || '',
        keywords: '',
        section: card.closest('[data-section]')?.getAttribute('data-section') || ''
      });
    });
  }
}

/**
 * Highlight text by wrapping matches with <mark> tags
 * Escapes HTML first to prevent XSS, then applies highlighting.
 * @param {string} text - The text to highlight in
 * @param {string} query - The search query
 * @returns {string} HTML with highlighted matches
 */
function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const safeText = escapeHtml(text);
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return safeText.replace(regex, '<mark class="search-highlight">$1</mark>');
}

/**
 * Get recent searches from storage (last 5)
 * @returns {Array<string>} Array of recent search queries
 */
function getRecentSearches() {
  return storage.get('compendium-recent-searches', []);
}

/**
 * Save search query to recent searches
 * @param {string} query - The search query to save
 */
function addRecentSearch(query) {
  if (!query || query.length < config.minChars) return;

  let searches = getRecentSearches();
  // Remove if already exists (to avoid duplicates)
  searches = searches.filter(s => s.toLowerCase() !== query.toLowerCase());
  // Add to front
  searches.unshift(query);
  // Keep only last 5
  searches = searches.slice(0, 5);

  storage.set('compendium-recent-searches', searches);
}

/**
 * Render recent searches in the dropdown
 */
function showRecentSearches() {
  const searches = getRecentSearches();

  if (searches.length === 0) {
    searchResults.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:0.85rem">No recent searches</div>';
    searchResults.classList.add('active');
    searchResults.setAttribute('role', 'listbox');
    searchInput.setAttribute('aria-expanded', 'true');
    return;
  }

  let html = '<div class="recent-searches">';
  html += '<div class="search-category-header">Recent Searches</div>';
  searches.forEach(search => {
    const safeSearch = escapeHtml(search);
    html += `<a href="#" class="search-recent-item" role="option" data-query="${safeSearch}">${safeSearch}</a>`;
  });
  html += '</div>';

  searchResults.innerHTML = html;
  searchResults.classList.add('active');
  searchResults.setAttribute('role', 'listbox');
  searchInput.setAttribute('aria-expanded', 'true');

  // Add click handlers for recent searches
  document.querySelectorAll('.search-recent-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const query = item.getAttribute('data-query');
      searchInput.value = query;
      performSearch(query);
    });
  });
}

/**
 * Group results by category/section
 * @param {Array} results - Array of search results
 * @returns {Object} Results grouped by section
 */
function groupByCategory(results) {
  const grouped = {};
  results.forEach(result => {
    const category = result.section || 'Other';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(result);
  });
  return grouped;
}

/**
 * Render search results with grouping and highlighting
 * @param {string} query - The search query
 * @param {Array} matches - The matched results to display (already sliced to maxResults)
 * @param {number} totalMatches - Total number of matches before truncation
 */
function renderResults(query, matches, totalMatches = 0) {
  if (matches.length === 0) {
    searchResults.innerHTML = '<div style="padding:12px;color:var(--muted)">No matches — try <a href="guides/search.html" style="color:var(--accent)">full-text search</a></div>';
    searchResults.classList.add('active');
    searchInput.setAttribute('aria-expanded', 'true');
    return;
  }

  const grouped = groupByCategory(matches);
  let html = '';

  // Render grouped results
  Object.entries(grouped).forEach(([category, items]) => {
    html += `<div class="search-category-header">${escapeHtml(category)}</div>`;
    items.forEach((item, index) => {
      const highlightedTitle = highlightText(item.title, query);
      const highlightedDesc = highlightText(item.desc, query);
      html += `<a href="${escapeHtml(item.href)}" class="search-result" role="option" data-index="${index}">
        <div class="search-result-content">
          <div class="search-result-title">${highlightedTitle}</div>
          <div class="search-result-desc">${highlightedDesc}</div>
        </div>
      </a>`;
    });
  });

  // Add "View all X results" link if results are truncated
  if (totalMatches > config.maxResults) {
    const remaining = totalMatches - config.maxResults;
    const encodedQuery = encodeURIComponent(query);
    html += `<a href="guides/search.html?q=${encodedQuery}" class="search-view-all">View all ${totalMatches} results →</a>`;
  }

  searchResults.innerHTML = html;
  searchResults.classList.add('active');
  searchResults.setAttribute('role', 'listbox');
  searchInput.setAttribute('aria-expanded', 'true');
  currentActiveIndex = -1;
  attachResultClickHandlers();
}

/**
 * Attach click handlers and navigate-to handlers for results
 */
function attachResultClickHandlers() {
  document.querySelectorAll('.search-result').forEach(result => {
    result.addEventListener('click', (e) => {
      if (e.button === 0) { // Left click only
        const href = result.getAttribute('href');
        addRecentSearch(searchInput.value);
        // Let the link navigate normally
      }
    });
  });
}

/**
 * Perform the actual search with weighted scoring
 * Scoring weights: title (3x) > tags (2x) > description (1.5x) > keywords (1x)
 * @param {string} query - The search query
 */
function performSearch(query) {
  const q = query.toLowerCase().trim();

  if (q.length < config.minChars) {
    searchResults.classList.remove('active');
    searchInput.setAttribute('aria-expanded', 'false');
    return;
  }

  // Score all guides and filter those with matches
  const scoredMatches = guideData
    .map(g => {
      const qLower = q.toLowerCase();
      const titleLower = g.title.toLowerCase();
      const descLower = g.desc.toLowerCase();
      const tagsLower = g.tags.toLowerCase();
      const keywordsLower = g.keywords.toLowerCase();

      let score = 0;

      // Title match: 3x weight
      if (titleLower.includes(qLower)) {
        score += 3;
      }

      // Tags match: 2x weight
      if (tagsLower.includes(qLower)) {
        score += 2;
      }

      // Description match: 1.5x weight
      if (descLower.includes(qLower)) {
        score += 1.5;
      }

      // Keywords match: 1x weight
      if (keywordsLower.includes(qLower)) {
        score += 1;
      }

      return { ...g, score };
    })
    .filter(g => g.score > 0)
    .sort((a, b) => b.score - a.score);

  // Calculate total matches before truncation
  const totalMatches = scoredMatches.length;
  const displayMatches = scoredMatches.slice(0, config.maxResults);

  renderResults(q, displayMatches, totalMatches);
}

/**
 * Handle keyboard navigation
 * Arrow Up/Down: move through results
 * Enter: select current result
 * Escape: close dropdown
 */
function handleKeyboardNavigation(e) {
  const results = document.querySelectorAll('.search-result');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    currentActiveIndex = Math.min(currentActiveIndex + 1, results.length - 1);
    updateActiveResult(results);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    currentActiveIndex = Math.max(currentActiveIndex - 1, -1);
    updateActiveResult(results);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentActiveIndex >= 0 && results[currentActiveIndex]) {
      const href = results[currentActiveIndex].getAttribute('href');
      addRecentSearch(searchInput.value);
      window.location.href = href;
    } else if (searchInput.value.length >= config.minChars) {
      // If no active selection, redirect to full search
      addRecentSearch(searchInput.value);
      window.location.href = 'guides/search.html?q=' + encodeURIComponent(searchInput.value);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    searchResults.classList.remove('active');
    searchInput.setAttribute('aria-expanded', 'false');
  }
}

/**
 * Update visual active state for keyboard navigation
 * @param {NodeList} results - All search result elements
 */
function updateActiveResult(results) {
  results.forEach((result, index) => {
    result.classList.remove('active');
    if (index === currentActiveIndex) {
      result.classList.add('active');
      result.scrollIntoView({ block: 'nearest' });
    }
  });
}

/**
 * Initialize search functionality
 * @param {Array|NodeList} source - Guide data array from guides.json or card elements from DOM
 * @param {Object} customConfig - Optional configuration {minChars, maxResults}
 */
export function initializeSearch(source, customConfig = {}) {
  // Try the main hero search bar first, fall back to quick-search variant
  searchInput = document.getElementById('search') || document.getElementById('quick-search-input');
  searchResults = document.getElementById('search-results') || document.getElementById('quick-search-results');

  if (!searchInput || !searchResults) return;

  // Apply custom configuration
  config = { ...config, ...customConfig };

  buildGuideData(source);

  // Input event - perform search as user types
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value;
    performSearch(query);
  });

  // Focus event - show recent searches if input is empty
  searchInput.addEventListener('focus', (e) => {
    const query = e.target.value.trim();
    if (query.length === 0) {
      showRecentSearches();
    } else if (query.length >= config.minChars) {
      searchResults.classList.add('active');
    }
  });

  // Detect pointer interaction with results (to prevent blur from closing dropdown)
  searchResults.addEventListener('pointerdown', () => {
    isInteractingWithResults = true;
  });

  // Blur event - hide results only if not interacting with them
  searchInput.addEventListener('blur', () => {
    if (!isInteractingWithResults) {
      searchResults.classList.remove('active');
      searchInput.setAttribute('aria-expanded', 'false');
    }
    isInteractingWithResults = false;
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', handleKeyboardNavigation);
}

/**
 * Focus the search input
 */
export function focusSearch() {
  if (searchInput) {
    searchInput.focus();
  }
}
