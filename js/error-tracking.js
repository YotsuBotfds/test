/**
 * Error Tracking Module
 * Tracks application errors, unhandled rejections, and service worker failures
 * Stores error log in memory (last 50) and localStorage for persistence
 */

const MAX_ERRORS = 50;
const STORAGE_KEY = 'compendium-error-log';

// In-memory error log
let errorLog = [];

/**
 * Initialize error tracking handlers
 */
export function init() {
  // Load existing errors from localStorage
  loadErrorsFromStorage();

  // Global error handler for uncaught exceptions
  window.onerror = handleError;

  // Handler for unhandled promise rejections
  window.onunhandledrejection = handleUnhandledRejection;

  // Monitor service worker errors
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('error', handleServiceWorkerError);
  }
}

/**
 * Handle uncaught errors
 */
function handleError(message, source, lineno, colno, error) {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    message: message || 'Unknown error',
    source: source || 'unknown',
    line: lineno || 0,
    column: colno || 0,
    stack: error?.stack || '',
    type: 'uncaughtError'
  };

  addError(errorEntry);
  return true; // Prevent default error handling
}

/**
 * Handle unhandled promise rejections
 */
function handleUnhandledRejection(event) {
  const reason = event.reason || {};
  const message = reason.message || String(reason);
  const stack = reason.stack || '';

  const errorEntry = {
    timestamp: new Date().toISOString(),
    message: message,
    source: 'Promise rejection',
    line: 0,
    column: 0,
    stack: stack,
    type: 'unhandledRejection'
  };

  addError(errorEntry);
}

/**
 * Handle service worker errors
 */
function handleServiceWorkerError(event) {
  const message = event.message || 'Service Worker error';
  const stack = event.stack || '';

  const errorEntry = {
    timestamp: new Date().toISOString(),
    message: message,
    source: 'Service Worker',
    line: 0,
    column: 0,
    stack: stack,
    type: 'serviceWorkerError'
  };

  addError(errorEntry);
}

/**
 * Check if an error is user-impacting (not just background analytics)
 * @param {Object} errorEntry - Error entry object
 * @returns {boolean} True if error should be shown to user
 */
export function isUserImpactingError(errorEntry) {
  // Network and service worker errors are user-impacting
  if (errorEntry.type === 'serviceWorkerError' ||
      errorEntry.message.includes('fetch') ||
      errorEntry.message.includes('Network') ||
      errorEntry.message.includes('guides.json')) {
    return true;
  }

  // Uncaught errors related to guides/cards are user-impacting
  if (errorEntry.type === 'uncaughtError' &&
      (errorEntry.source.includes('cards') || errorEntry.source.includes('guides'))) {
    return true;
  }

  // Promise rejections from critical paths are user-impacting
  if (errorEntry.type === 'unhandledRejection' &&
      errorEntry.message.includes('guides')) {
    return true;
  }

  return false;
}

/**
 * Add an error to the log
 */
function addError(errorEntry) {
  // Add to in-memory log
  errorLog.unshift(errorEntry);

  // Keep only last 50 errors
  if (errorLog.length > MAX_ERRORS) {
    errorLog = errorLog.slice(0, MAX_ERRORS);
  }

  // Save to localStorage
  saveErrorsToStorage();

  // Log to console for debugging
  console.error('[Error Tracker]', errorEntry);

  // Dispatch custom event for user-impacting errors
  if (isUserImpactingError(errorEntry)) {
    window.dispatchEvent(new CustomEvent('app-error', { detail: errorEntry }));
  }
}

/**
 * Save error log to localStorage
 */
function saveErrorsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(errorLog));
  } catch (e) {
    // localStorage might be full or unavailable
    console.warn('Failed to save error log to localStorage:', e);
  }
}

/**
 * Load error log from localStorage
 */
function loadErrorsFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      errorLog = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load error log from localStorage:', e);
    errorLog = [];
  }
}

/**
 * Get all tracked errors
 */
export function getErrors() {
  return [...errorLog];
}

/**
 * Get error count
 */
export function getErrorCount() {
  return errorLog.length;
}

/**
 * Clear all errors
 */
export function clearErrors() {
  errorLog = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear error log from localStorage:', e);
  }
}

/**
 * Format error for display
 */
export function formatError(errorEntry) {
  const date = new Date(errorEntry.timestamp);
  const timeStr = date.toLocaleTimeString();
  const dateStr = date.toLocaleDateString();

  return `[${dateStr} ${timeStr}] ${errorEntry.type}\n` +
         `Message: ${errorEntry.message}\n` +
         `Source: ${errorEntry.source} (${errorEntry.line}:${errorEntry.column})\n` +
         `${errorEntry.stack ? 'Stack: ' + errorEntry.stack : ''}`;
}

/**
 * Export errors for bug reporting
 */
export function exportErrorsAsText() {
  const header = `Error Log Export\n` +
                 `Generated: ${new Date().toISOString()}\n` +
                 `Total Errors: ${errorLog.length}\n` +
                 `${'='.repeat(50)}\n\n`;

  const entries = errorLog
    .map(err => formatError(err))
    .join('\n' + '-'.repeat(50) + '\n\n');

  return header + entries;
}
