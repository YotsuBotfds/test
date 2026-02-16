/**
 * Shared Utility Functions
 * Centralizes common helpers used across multiple modules.
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for innerHTML insertion
 */
export function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Sanitize a string to remove script tags and event handlers
 * Prevents XSS attacks when storing user-provided content
 * @param {string} input - The string to sanitize
 * @returns {string} The sanitized string
 */
export function sanitize(input) {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove script tags and their content
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handler attributes (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove dangerous attributes that could execute code
  sanitized = sanitized.replace(/href\s*=\s*["']?javascript:[^"'\s>]*["']?/gi, '');

  return sanitized;
}

/**
 * Wrap an emoji with accessibility attributes for screen readers
 * Use for meaningful icons (guide titles, badges, etc.)
 * @param {string} emoji - The emoji character
 * @param {string} label - Accessible text label describing the emoji
 * @returns {string} HTML string with role and aria-label
 */
export function accessibleEmoji(emoji, label) {
  return `<span role="img" aria-label="${escapeHtml(label)}">${emoji}</span>`;
}

/**
 * Wrap an emoji with aria-hidden for decorative use only
 * Use for visual-only decorations that don't convey meaningful content
 * @param {string} emoji - The emoji character
 * @returns {string} HTML string with aria-hidden
 */
export function decorativeEmoji(emoji) {
  return `<span aria-hidden="true">${emoji}</span>`;
}
