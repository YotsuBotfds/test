/**
 * Error Viewer UI Module
 * Provides a modal for viewing and managing error logs
 */

import * as errorTracking from './error-tracking.js';
import { escapeHtml } from './utils.js';

let debugClickCount = 0;
let debugClickTimeout;

/**
 * Initialize error viewer
 * Sets up hidden debug link in footer
 */
export function init() {
  const versionElement = document.querySelector('footer');
  if (!versionElement) return;

  // Create hidden debug link (click 3x on version to reveal)
  versionElement.addEventListener('click', handleVersionClick);
}

/**
 * Handle clicks on footer version text
 */
function handleVersionClick() {
  debugClickCount++;

  // Reset counter after 1 second of inactivity
  clearTimeout(debugClickTimeout);
  debugClickTimeout = setTimeout(() => {
    debugClickCount = 0;
  }, 1000);

  // On 3 clicks, show the debug menu
  if (debugClickCount >= 3) {
    debugClickCount = 0;
    showDebugMenu();
  }
}

/**
 * Show debug menu
 */
function showDebugMenu() {
  const menu = document.createElement('div');
  menu.id = 'debug-menu';
  menu.className = 'debug-menu';
  menu.innerHTML = `
    <div class="debug-menu-content">
      <h3>Debug Menu</h3>
      <button id="view-errors-btn" class="debug-btn">View Error Log</button>
      <button id="close-debug-btn" class="debug-btn debug-btn-secondary">Close</button>
    </div>
  `;

  document.body.appendChild(menu);

  // Add event listeners
  document.getElementById('view-errors-btn').addEventListener('click', showErrorModal);
  document.getElementById('close-debug-btn').addEventListener('click', () => {
    menu.remove();
  });

  // Close when clicking outside
  menu.addEventListener('click', (e) => {
    if (e.target === menu) {
      menu.remove();
    }
  });
}

/**
 * Show error log modal
 */
function showErrorModal() {
  const errors = errorTracking.getErrors();
  const errorCount = errorTracking.getErrorCount();

  const modal = document.createElement('div');
  modal.id = 'error-viewer-modal';
  modal.className = 'error-viewer-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'error-viewer-title');

  let errorContent = '';
  if (errors.length === 0) {
    errorContent = '<p class="no-errors">No errors logged</p>';
  } else {
    errorContent = errors
      .map((err, idx) => createErrorElement(err, idx))
      .join('');
  }

  modal.innerHTML = `
    <div class="error-viewer-content">
      <div class="error-viewer-header">
        <h2 id="error-viewer-title">Error Log</h2>
        <p class="error-count">${errorCount} error${errorCount !== 1 ? 's' : ''} logged</p>
      </div>

      <div class="error-viewer-errors">
        ${errorContent}
      </div>

      <div class="error-viewer-actions">
        <button id="copy-errors-btn" class="error-btn error-btn-primary" title="Copy errors to clipboard">
          📋 Copy to Clipboard
        </button>
        <button id="clear-errors-btn" class="error-btn error-btn-danger" title="Clear all errors">
          🗑️ Clear Errors
        </button>
        <button id="close-errors-btn" class="error-btn error-btn-secondary" title="Close error viewer">
          Close
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add event listeners
  document.getElementById('copy-errors-btn').addEventListener('click', copyErrorsToClipboard);
  document.getElementById('clear-errors-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all errors?')) {
      errorTracking.clearErrors();
      modal.remove();
      showErrorModal(); // Reopen to show empty state
    }
  });
  document.getElementById('close-errors-btn').addEventListener('click', () => {
    modal.remove();
  });

  // Close when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

/**
 * Create HTML element for an error entry
 */
function createErrorElement(error, index) {
  const date = new Date(error.timestamp);
  const timeStr = date.toLocaleTimeString();
  const dateStr = date.toLocaleDateString();

  const stackDisplay = error.stack
    ? `<pre class="error-stack">${escapeHtml(error.stack)}</pre>`
    : '';

  return `
    <details class="error-entry">
      <summary class="error-summary">
        <span class="error-index">#${index + 1}</span>
        <span class="error-type">${escapeHtml(error.type)}</span>
        <span class="error-message">${escapeHtml(error.message.substring(0, 50))}${error.message.length > 50 ? '...' : ''}</span>
        <span class="error-time">${timeStr}</span>
      </summary>
      <div class="error-details">
        <div class="error-field">
          <span class="error-label">Time:</span>
          <span class="error-value">${dateStr} ${timeStr}</span>
        </div>
        <div class="error-field">
          <span class="error-label">Type:</span>
          <span class="error-value">${escapeHtml(error.type)}</span>
        </div>
        <div class="error-field">
          <span class="error-label">Message:</span>
          <span class="error-value">${escapeHtml(error.message)}</span>
        </div>
        <div class="error-field">
          <span class="error-label">Source:</span>
          <span class="error-value">${escapeHtml(error.source)} (${error.line}:${error.column})</span>
        </div>
        ${stackDisplay}
      </div>
    </details>
  `;
}

/**
 * Copy errors to clipboard
 */
function copyErrorsToClipboard() {
  const exportText = errorTracking.exportErrorsAsText();

  navigator.clipboard.writeText(exportText).then(() => {
    // Show success message
    const btn = document.getElementById('copy-errors-btn');
    const originalText = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy to clipboard:', err);
    alert('Failed to copy errors to clipboard');
  });
}

// escapeHtml imported from utils.js

/**
 * Export error viewer functions to window for direct access if needed
 */
export function openErrorViewer() {
  showErrorModal();
}
