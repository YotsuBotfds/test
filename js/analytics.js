/**
 * Privacy-Respecting Local Analytics Module
 * All data is stored locally in localStorage
 * No data is sent to external servers
 *
 * Tracks:
 * - Most viewed guides (guide ID + view count)
 * - Search terms used (term + count, last 100)
 * - Achievement unlock dates
 * - Session duration (based on page visibility)
 * - Page load times (using performance.now())
 * - Daily active usage (date stamps)
 */

import * as storage from './storage.js';

// Analytics storage keys
const STORAGE_KEY_GUIDE_VIEWS = 'analytics-guide-views';
const STORAGE_KEY_SEARCH_TERMS = 'analytics-search-terms';
const STORAGE_KEY_ACHIEVEMENTS = 'analytics-achievements';
const STORAGE_KEY_SESSIONS = 'analytics-sessions';
const STORAGE_KEY_DAILY_USAGE = 'analytics-daily-usage';
const STORAGE_KEY_PAGE_LOAD = 'analytics-page-load';

// Session tracking
let sessionStartTime = 0;
let sessionVisibleTime = 0;
let lastVisibilityTime = 0;
let isSessionActive = true;

/**
 * Initialize analytics tracking
 */
export function init() {
  // Record session start
  sessionStartTime = performance.now();
  lastVisibilityTime = sessionStartTime;

  // Track page load time
  trackPageLoadTime();

  // Track daily active usage
  recordDailyActive();

  // Listen for visibility changes (for session tracking)
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Track guide views (intercept link clicks)
  setupGuideViewTracking();

  // Track search queries
  setupSearchTracking();
}

/**
 * Track page load time using performance API
 */
function trackPageLoadTime() {
  if (window.performance && window.performance.timing) {
    const perfTiming = window.performance.timing;
    const pageLoadTime = perfTiming.loadEventEnd - perfTiming.navigationStart;

    if (pageLoadTime > 0 && pageLoadTime < 30000) { // Reasonable bounds
      const loadTimes = storage.get(STORAGE_KEY_PAGE_LOAD, []);
      loadTimes.push({
        timestamp: new Date().toISOString(),
        loadTime: Math.round(pageLoadTime)
      });

      // Keep only last 100 load times
      if (loadTimes.length > 100) {
        loadTimes.shift();
      }

      storage.set(STORAGE_KEY_PAGE_LOAD, loadTimes);
    }
  }
}

/**
 * Handle page visibility changes for session tracking
 */
function handleVisibilityChange() {
  const now = performance.now();
  const timeSinceLastChange = now - lastVisibilityTime;

  if (document.hidden) {
    // Page is hidden - record visible time
    if (isSessionActive) {
      sessionVisibleTime += timeSinceLastChange;
      isSessionActive = false;
    }
  } else {
    // Page is visible again - reset timer
    isSessionActive = true;
  }

  lastVisibilityTime = now;
}

/**
 * Record that user was active today
 */
function recordDailyActive() {
  const today = new Date().toISOString().split('T')[0];
  const dailyUsage = storage.get(STORAGE_KEY_DAILY_USAGE, []);

  // Check if today is already recorded
  if (!dailyUsage.includes(today)) {
    dailyUsage.push(today);

    // Keep only last 365 days
    if (dailyUsage.length > 365) {
      dailyUsage.shift();
    }

    storage.set(STORAGE_KEY_DAILY_USAGE, dailyUsage);
  }
}

/**
 * Setup tracking of guide views from card clicks
 */
function setupGuideViewTracking() {
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-guide]');
    if (card) {
      const guideId = card.getAttribute('data-guide');
      trackGuideView(guideId);
    }
  });

  // Also track navigation to guide pages via keyboard
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) {
      const guideId = e.target.getAttribute('data-guide');
      if (guideId) {
        trackGuideView(guideId);
      }
    }
  });
}

/**
 * Track a guide view
 * @param {string} guideId - The guide ID being viewed
 */
function trackGuideView(guideId) {
  if (!guideId) return;

  const views = storage.get(STORAGE_KEY_GUIDE_VIEWS, {});

  if (!views[guideId]) {
    views[guideId] = {
      count: 0,
      firstViewed: new Date().toISOString(),
      lastViewed: null
    };
  }

  views[guideId].count += 1;
  views[guideId].lastViewed = new Date().toISOString();

  storage.set(STORAGE_KEY_GUIDE_VIEWS, views);
}

/**
 * Setup tracking of search terms
 */
function setupSearchTracking() {
  // Track the search bar
  const mainSearch = document.getElementById('search');
  if (mainSearch) {
    mainSearch.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query.length >= 2) {
        trackSearchTerm(query);
      }
    });
  }
}

/**
 * Track a search term (with debouncing to avoid excessive storage writes)
 * @param {string} term - The search term
 */
function trackSearchTerm(term) {
  if (!term || term.length < 2) return;

  const terms = storage.get(STORAGE_KEY_SEARCH_TERMS, []);

  // Check if term already exists in the list
  const existingIndex = terms.findIndex(t => t.term.toLowerCase() === term.toLowerCase());

  if (existingIndex >= 0) {
    // Update existing term
    terms[existingIndex].count += 1;
    terms[existingIndex].lastSearched = new Date().toISOString();
  } else {
    // Add new term
    terms.push({
      term: term,
      count: 1,
      firstSearched: new Date().toISOString(),
      lastSearched: new Date().toISOString()
    });
  }

  // Keep only last 100 unique search terms
  if (terms.length > 100) {
    // Sort by count and keep top 100
    terms.sort((a, b) => b.count - a.count);
    terms.splice(100);
  }

  storage.set(STORAGE_KEY_SEARCH_TERMS, terms);
}

/**
 * Track achievement unlock
 * @param {string} achievementId - The achievement ID
 * @param {string} unlockedAt - ISO timestamp of when it was unlocked
 */
export function trackAchievementUnlock(achievementId, unlockedAt = null) {
  if (!achievementId) return;

  const achievements = storage.get(STORAGE_KEY_ACHIEVEMENTS, {});

  if (!achievements[achievementId]) {
    achievements[achievementId] = {
      unlockedAt: unlockedAt || new Date().toISOString()
    };

    storage.set(STORAGE_KEY_ACHIEVEMENTS, achievements);
  }
}

/**
 * Record end of session (call before page unload)
 */
export function recordSessionEnd() {
  const now = performance.now();

  // Add final visible time
  if (isSessionActive) {
    sessionVisibleTime += (now - lastVisibilityTime);
  }

  // Only record if session was at least 5 seconds long
  if (sessionVisibleTime >= 5000) {
    const sessions = storage.get(STORAGE_KEY_SESSIONS, []);

    sessions.push({
      timestamp: new Date().toISOString(),
      duration: Math.round(sessionVisibleTime),
      totalTime: Math.round(now - sessionStartTime)
    });

    // Keep only last 1000 sessions
    if (sessions.length > 1000) {
      sessions.shift();
    }

    storage.set(STORAGE_KEY_SESSIONS, sessions);
  }
}

/**
 * Track a custom event
 * @param {string} category - Event category (e.g., 'engagement', 'user-action')
 * @param {string} action - Event action (e.g., 'guide-view', 'search')
 * @param {string} label - Optional event label
 */
export function trackEvent(category, action, label = null) {
  // This is a flexible tracking method for future expansion
  // Events could be stored separately if needed
  console.debug(`[Analytics] ${category}/${action}${label ? '/' + label : ''}`);
}

/**
 * Get all analytics data
 * @returns {Object} Complete analytics object
 */
export function getAnalytics() {
  return {
    guideViews: storage.get(STORAGE_KEY_GUIDE_VIEWS, {}),
    searchTerms: storage.get(STORAGE_KEY_SEARCH_TERMS, []),
    achievements: storage.get(STORAGE_KEY_ACHIEVEMENTS, {}),
    sessions: storage.get(STORAGE_KEY_SESSIONS, []),
    dailyUsage: storage.get(STORAGE_KEY_DAILY_USAGE, []),
    pageLoadTimes: storage.get(STORAGE_KEY_PAGE_LOAD, [])
  };
}

/**
 * Get guide view statistics
 * @returns {Object} Object with guide IDs and view counts
 */
export function getGuideStats() {
  const views = storage.get(STORAGE_KEY_GUIDE_VIEWS, {});
  return Object.entries(views)
    .map(([guideId, data]) => ({
      guideId,
      ...data
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get top search terms
 * @param {number} limit - Number of top terms to return
 * @returns {Array} Array of search term objects
 */
export function getTopSearchTerms(limit = 20) {
  const terms = storage.get(STORAGE_KEY_SEARCH_TERMS, []);
  return terms
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get session statistics
 * @returns {Object} Session statistics
 */
export function getSessionStats() {
  const sessions = storage.get(STORAGE_KEY_SESSIONS, []);

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalSessionTime: 0,
      averageSessionTime: 0,
      longestSession: 0,
      shortestSession: 0
    };
  }

  const totalTime = sessions.reduce((sum, s) => sum + s.duration, 0);
  const durations = sessions.map(s => s.duration);

  return {
    totalSessions: sessions.length,
    totalSessionTime: totalTime,
    averageSessionTime: Math.round(totalTime / sessions.length),
    longestSession: Math.max(...durations),
    shortestSession: Math.min(...durations)
  };
}

/**
 * Get page load statistics
 * @returns {Object} Page load time statistics
 */
export function getLoadStats() {
  const loadTimes = storage.get(STORAGE_KEY_PAGE_LOAD, []);

  if (loadTimes.length === 0) {
    return {
      averageLoadTime: 0,
      fastestLoad: 0,
      slowestLoad: 0,
      totalMeasurements: 0
    };
  }

  const times = loadTimes.map(t => t.loadTime);

  return {
    averageLoadTime: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    fastestLoad: Math.min(...times),
    slowestLoad: Math.max(...times),
    totalMeasurements: times.length
  };
}

/**
 * Get daily active usage stats
 * @returns {Object} Daily usage statistics
 */
export function getDailyUsageStats() {
  const dailyUsage = storage.get(STORAGE_KEY_DAILY_USAGE, []);
  const lastDays = dailyUsage.slice(-30); // Last 30 days

  return {
    activeDaysTotal: dailyUsage.length,
    activeDaysLast30: lastDays.length,
    lastActiveDate: dailyUsage.length > 0 ? dailyUsage[dailyUsage.length - 1] : null,
    firstActiveDate: dailyUsage.length > 0 ? dailyUsage[0] : null,
    dates: dailyUsage
  };
}

/**
 * Clear all analytics data
 */
export function clearAnalytics() {
  storage.remove(STORAGE_KEY_GUIDE_VIEWS);
  storage.remove(STORAGE_KEY_SEARCH_TERMS);
  storage.remove(STORAGE_KEY_ACHIEVEMENTS);
  storage.remove(STORAGE_KEY_SESSIONS);
  storage.remove(STORAGE_KEY_DAILY_USAGE);
  storage.remove(STORAGE_KEY_PAGE_LOAD);
}

/**
 * Export analytics as JSON
 * @returns {string} JSON string of all analytics
 */
export function exportAnalyticsJSON() {
  const data = getAnalytics();
  return JSON.stringify(data, null, 2);
}

/**
 * Get approximate storage size used by analytics
 * @returns {number} Estimated bytes used
 */
export function getStorageSize() {
  const data = getAnalytics();
  const jsonStr = JSON.stringify(data);
  // Rough estimate: each character is ~1 byte, plus some overhead
  return jsonStr.length + 200;
}

// Record session end when page unloads
window.addEventListener('beforeunload', recordSessionEnd);
