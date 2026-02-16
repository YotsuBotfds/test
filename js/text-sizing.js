/**
 * Text Sizing Module
 * Provides A+/A- buttons for text size scaling
 * Stores preference in localStorage
 */

import * as storage from './storage.js';

// Text size presets: [normal, medium, large, x-large]
const TEXT_SIZES = {
  normal: { label: 'A', fontSize: '100%', level: 0 },
  medium: { label: 'A+', fontSize: '112.5%', level: 1 },
  large: { label: 'A++', fontSize: '125%', level: 2 },
  xlarge: { label: 'A+++', fontSize: '150%', level: 3 }
};

const STORAGE_KEY = 'text-size-level';
const DEFAULT_LEVEL = 0;

/**
 * Apply text size to html element
 * @param {number} level - Size level (0-3)
 */
function applySizeLevel(level) {
  const validLevel = Math.max(0, Math.min(3, level));
  const sizeKey = Object.keys(TEXT_SIZES)[validLevel];
  const size = TEXT_SIZES[sizeKey];

  document.documentElement.style.fontSize = size.fontSize;

  // Store preference
  storage.set(STORAGE_KEY, validLevel);

  // Update button states
  updateButtonStates(validLevel);
}

/**
 * Get current text size level
 * @returns {number} Current level (0-3)
 */
function getCurrentLevel() {
  return storage.get(STORAGE_KEY, DEFAULT_LEVEL);
}

/**
 * Increase text size
 */
function increaseSize() {
  const currentLevel = getCurrentLevel();
  if (currentLevel < 3) {
    applySizeLevel(currentLevel + 1);
  }
}

/**
 * Decrease text size
 */
function decreaseSize() {
  const currentLevel = getCurrentLevel();
  if (currentLevel > 0) {
    applySizeLevel(currentLevel - 1);
  }
}

/**
 * Update button states and disabled status
 * @param {number} level - Current level
 */
function updateButtonStates(level) {
  const decreaseBtn = document.getElementById('text-size-decrease');
  const increaseBtn = document.getElementById('text-size-increase');
  const sizeDisplay = document.getElementById('text-size-display');

  if (decreaseBtn) {
    decreaseBtn.disabled = level === 0;
    decreaseBtn.setAttribute('aria-disabled', level === 0);
  }

  if (increaseBtn) {
    increaseBtn.disabled = level === 3;
    increaseBtn.setAttribute('aria-disabled', level === 3);
  }

  if (sizeDisplay) {
    const sizeKey = Object.keys(TEXT_SIZES)[level];
    sizeDisplay.textContent = TEXT_SIZES[sizeKey].label;
    sizeDisplay.setAttribute('aria-label', `Text size: ${sizeKey}`);
  }
}

/**
 * Initialize text sizing controls
 */
export function init() {
  // Restore saved preference
  const savedLevel = getCurrentLevel();
  applySizeLevel(savedLevel);

  // Set up button listeners
  const decreaseBtn = document.getElementById('text-size-decrease');
  const increaseBtn = document.getElementById('text-size-increase');

  if (decreaseBtn) {
    decreaseBtn.addEventListener('click', decreaseSize);
  }

  if (increaseBtn) {
    increaseBtn.addEventListener('click', increaseSize);
  }
}
