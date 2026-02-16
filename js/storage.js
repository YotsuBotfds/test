/**
 * Storage Module - localStorage abstraction layer
 * Provides a clean interface for all localStorage operations
 */

import { sanitize } from './utils.js';

// Re-export sanitize for backward compatibility
export { sanitize };

/**
 * Get a value from localStorage
 * @param {string} key - The storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} The stored value or default
 */
export function get(key, defaultValue = null) {
  const value = localStorage.getItem(key);
  if (value === null) return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Set a value in localStorage
 * @param {string} key - The storage key
 * @param {*} value - The value to store
 */
export function set(key, value) {
  if (typeof value === 'string') {
    localStorage.setItem(key, value);
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

/**
 * Remove a value from localStorage
 * @param {string} key - The storage key to remove
 */
export function remove(key) {
  localStorage.removeItem(key);
}

/**
 * Get all keys starting with a prefix
 * @param {string} prefix - The prefix to match
 * @returns {Array<string>} Array of matching keys
 */
export function getAllWithPrefix(prefix) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Clear all keys with a specific prefix
 * @param {string} prefix - The prefix to clear
 */
export function clearPrefix(prefix) {
  const keys = getAllWithPrefix(prefix);
  keys.forEach(key => remove(key));
}

/**
 * Get theme preference
 * @returns {string} 'dark' or 'light'
 */
export function getTheme() {
  return get('compendium-theme', 'dark');
}

/**
 * Set theme preference
 * @param {string} theme - 'dark' or 'light'
 */
export function setTheme(theme) {
  set('compendium-theme', theme);
}

/**
 * Get reading progress
 * @returns {Object} Progress object keyed by guide ID
 */
export function getProgress() {
  return get('compendium-progress', {});
}

/**
 * Set reading progress
 * @param {Object} progress - Progress object
 */
export function setProgress(progress) {
  set('compendium-progress', progress);
}

/**
 * Get achievements
 * @returns {Object} Achievements object keyed by achievement ID
 */
export function getAchievements() {
  return get('compendium-achievements', {});
}

/**
 * Set achievements
 * @param {Object} achievements - Achievements object
 */
export function setAchievements(achievements) {
  set('compendium-achievements', achievements);
}

/**
 * Get notes for a specific guide
 * @param {string} guideId - The guide ID
 * @returns {string|null} The notes content or null
 */
export function getNotes(guideId) {
  return get(`compendium-notes-${guideId}`, null);
}

/**
 * Set notes for a specific guide
 * @param {string} guideId - The guide ID
 * @param {string} notes - The notes content
 */
export function setNotes(guideId, notes) {
  // Sanitize notes to prevent XSS attacks
  const sanitizedNotes = sanitize(notes);
  set(`compendium-notes-${guideId}`, sanitizedNotes);
}

/**
 * Get set of completed guide IDs
 * @returns {Set<string>} Set of completed guide IDs
 */
export function getCompletedGuides() {
  const progress = getProgress();
  const completed = new Set();
  for (const [guideId, data] of Object.entries(progress)) {
    if (data && data.completed) {
      completed.add(guideId);
    }
  }
  return completed;
}

/**
 * Mark a guide as completed in progress
 * @param {string} guideId - The guide ID to mark as completed
 */
export function addCompletedGuide(guideId) {
  const progress = getProgress();
  if (!progress[guideId]) {
    progress[guideId] = {};
  }
  progress[guideId].completed = true;
  progress[guideId].lastUpdated = new Date().toISOString();
  setProgress(progress);
}

/**
 * Get all notes
 * @returns {Object} Object with guide IDs as keys and notes as values
 */
export function getAllNotes() {
  const notes = {};
  const keys = getAllWithPrefix('compendium-notes-');
  keys.forEach(key => {
    const guideId = key.replace('compendium-notes-', '');
    notes[guideId] = get(key);
  });
  return notes;
}
