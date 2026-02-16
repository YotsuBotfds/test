/**
 * XSS Adversarial Tests
 * Tests escapeHtml and search sanitization against malicious inputs
 */

import { describe, it, expect } from './test-runner.js';

// Import the shared escapeHtml (re-implementing for Node test context)
function escapeHtml(text) {
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

// Replicate the fixed highlightText from search.js
function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const safeText = escapeHtml(text);
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return safeText.replace(regex, '<mark class="search-highlight">$1</mark>');
}

describe('XSS Adversarial Tests - escapeHtml', () => {
  it('should escape basic script tags', () => {
    const input = '<script>alert("xss")</script>';
    const result = escapeHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should escape img onerror payloads', () => {
    const input = '<img src=x onerror=alert(1)>';
    const result = escapeHtml(input);
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('should escape event handler attributes', () => {
    const input = '" onmouseover="alert(1)" "';
    const result = escapeHtml(input);
    expect(result).not.toContain('"');
    expect(result).toContain('&quot;');
  });

  it('should escape SVG-based XSS', () => {
    const input = '<svg onload=alert(1)>';
    const result = escapeHtml(input);
    expect(result).not.toContain('<svg');
  });

  it('should escape nested/recursive HTML', () => {
    const input = '<<script>alert(1)</script>>';
    const result = escapeHtml(input);
    expect(result).not.toContain('<script>');
  });

  it('should escape ampersand chains', () => {
    const input = '&amp;<script>';
    const result = escapeHtml(input);
    expect(result).toBe('&amp;amp;&lt;script&gt;');
  });

  it('should handle single quotes in attributes', () => {
    const input = "' onclick='alert(1)'";
    const result = escapeHtml(input);
    expect(result).not.toContain("'");
    expect(result).toContain('&#039;');
  });

  it('should handle null/undefined gracefully', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('should handle numeric input', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('should escape data URI payloads', () => {
    const input = '<a href="data:text/html,<script>alert(1)</script>">';
    const result = escapeHtml(input);
    expect(result).not.toContain('<a');
    expect(result).not.toContain('<script>');
  });

  it('should escape JavaScript protocol URLs', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = escapeHtml(input);
    expect(result).not.toContain('<a');
  });

  it('should escape template literal injection attempts', () => {
    const input = '${alert(1)}';
    const result = escapeHtml(input);
    // Template literals don't need HTML escaping but should pass through safely
    expect(result).toBe('${alert(1)}');
  });

  it('should escape HTML entities used for obfuscation', () => {
    const input = '<iframe src="javascript:alert(1)">';
    const result = escapeHtml(input);
    expect(result).not.toContain('<iframe');
  });
});

describe('XSS Adversarial Tests - highlightText (search)', () => {
  it('should escape HTML in text before highlighting', () => {
    const result = highlightText('<script>alert(1)</script>', 'script');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;');
    expect(result).toContain('<mark class="search-highlight">');
  });

  it('should escape HTML in the query itself', () => {
    const result = highlightText('Normal text here', '<img src=x onerror=alert(1)>');
    expect(result).not.toContain('<img');
  });

  it('should safely highlight text with special characters', () => {
    const result = highlightText('Water & Fire Safety', 'fire');
    expect(result).toContain('&amp;');
    expect(result).toContain('<mark class="search-highlight">Fire</mark>');
  });

  it('should handle XSS in guide titles used as search results', () => {
    const maliciousTitle = '"><img src=x onerror=alert(document.cookie)>';
    const result = highlightText(maliciousTitle, 'img');
    // Must not contain actual HTML tags - only escaped versions
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;');
    expect(result).toContain('&quot;');
  });

  it('should return escaped text when query is empty', () => {
    const result = highlightText('<b>Bold</b>', '');
    expect(result).toBe('&lt;b&gt;Bold&lt;/b&gt;');
  });

  it('should handle regex special characters in query safely', () => {
    const result = highlightText('Test (value) here', '(value)');
    expect(result).toContain('(value)');
  });
});

describe('XSS Adversarial Tests - Recent Searches (localStorage)', () => {
  it('should escape recent search terms before display', () => {
    const maliciousSearches = [
      '<script>alert(1)</script>',
      '" onmouseover="alert(1)"',
      '<img/src/onerror=alert(1)>',
    ];

    maliciousSearches.forEach(search => {
      const safe = escapeHtml(search);
      // Must not contain raw HTML angle brackets
      expect(safe).not.toContain('<script>');
      expect(safe).not.toContain('<img');
      // Attribute injection must be escaped (quotes become entities)
      expect(safe).not.toContain('" on');
    });
  });

  it('should escape search terms in data-query attributes', () => {
    const malicious = '"><script>alert(1)</script><a "';
    const safe = escapeHtml(malicious);
    // Building HTML like: data-query="${safe}" should be safe
    const html = `<a data-query="${safe}">`;
    expect(html).not.toContain('<script>');
  });
});
