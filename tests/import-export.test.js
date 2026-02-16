/**
 * Tests for Import/Export - Data Integrity
 * Tests data validation, sanitization, and format handling
 */

import { describe, it, expect } from './test-runner.js';

// Replicate validation logic from import-export.js for testing

/**
 * Validate imported data structure
 * Ensures imported JSON has expected keys and types
 */
function validateImportData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Data must be a non-null object' };
  }

  // Must have at least one recognized key
  const recognizedKeys = ['progress', 'collections', 'notes', 'settings', 'version'];
  const hasRecognized = Object.keys(data).some(key => recognizedKeys.includes(key));

  if (!hasRecognized) {
    return { valid: false, error: 'No recognized data keys found' };
  }

  // Validate progress is object if present
  if (data.progress !== undefined && typeof data.progress !== 'object') {
    return { valid: false, error: 'Progress must be an object' };
  }

  // Validate collections is array if present
  if (data.collections !== undefined && !Array.isArray(data.collections)) {
    return { valid: false, error: 'Collections must be an array' };
  }

  // Validate notes is object if present
  if (data.notes !== undefined && typeof data.notes !== 'object') {
    return { valid: false, error: 'Notes must be an object' };
  }

  return { valid: true };
}

/**
 * Sanitize progress data - strip any unexpected values
 */
function sanitizeProgressData(progress) {
  if (!progress || typeof progress !== 'object') return {};

  const sanitized = {};
  for (const [key, value] of Object.entries(progress)) {
    // Keys should be string IDs, values should be booleans or timestamps
    if (typeof key === 'string' && (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string')) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Build export data from storage
 */
function buildExportData(storage) {
  return {
    version: '3.0',
    exportDate: new Date().toISOString(),
    progress: storage.progress || {},
    collections: storage.collections || [],
    notes: storage.notes || {},
    settings: storage.settings || {},
  };
}

describe('Import/Export - Data Validation', () => {
  it('should accept valid import data with progress', () => {
    const data = { progress: { 'guide-1': true, 'guide-2': false } };
    expect(validateImportData(data).valid).toBe(true);
  });

  it('should accept valid import data with collections', () => {
    const data = { collections: [{ name: 'Favorites', guides: ['g1'] }] };
    expect(validateImportData(data).valid).toBe(true);
  });

  it('should accept valid import data with notes', () => {
    const data = { notes: { 'guide-1': 'Good info about shelters' } };
    expect(validateImportData(data).valid).toBe(true);
  });

  it('should reject null data', () => {
    const result = validateImportData(null);
    expect(result.valid).toBe(false);
  });

  it('should reject non-object data', () => {
    expect(validateImportData('string').valid).toBe(false);
    expect(validateImportData(42).valid).toBe(false);
    expect(validateImportData(true).valid).toBe(false);
  });

  it('should reject object with no recognized keys', () => {
    const result = validateImportData({ foo: 'bar', baz: 123 });
    expect(result.valid).toBe(false);
  });

  it('should reject non-object progress', () => {
    const result = validateImportData({ progress: 'not-an-object' });
    expect(result.valid).toBe(false);
  });

  it('should reject non-array collections', () => {
    const result = validateImportData({ collections: 'not-an-array' });
    expect(result.valid).toBe(false);
  });

  it('should reject non-object notes', () => {
    const result = validateImportData({ notes: 'not-an-object' });
    expect(result.valid).toBe(false);
  });

  it('should accept data with version field', () => {
    const data = { version: '3.0', progress: {} };
    expect(validateImportData(data).valid).toBe(true);
  });
});

describe('Import/Export - Progress Sanitization', () => {
  it('should keep boolean progress values', () => {
    const input = { 'guide-1': true, 'guide-2': false };
    const result = sanitizeProgressData(input);
    expect(result['guide-1']).toBe(true);
    expect(result['guide-2']).toBe(false);
  });

  it('should keep numeric timestamps', () => {
    const input = { 'guide-1': 1706400000000 };
    const result = sanitizeProgressData(input);
    expect(result['guide-1']).toBe(1706400000000);
  });

  it('should keep string date values', () => {
    const input = { 'guide-1': '2025-01-28T00:00:00Z' };
    const result = sanitizeProgressData(input);
    expect(result['guide-1']).toBe('2025-01-28T00:00:00Z');
  });

  it('should strip object values (potential injection)', () => {
    const input = { 'guide-1': { __proto__: { polluted: true } } };
    const result = sanitizeProgressData(input);
    expect(result['guide-1']).toBeUndefined();
  });

  it('should strip array values', () => {
    const input = { 'guide-1': [1, 2, 3] };
    const result = sanitizeProgressData(input);
    expect(result['guide-1']).toBeUndefined();
  });

  it('should strip function values', () => {
    const input = { 'guide-1': () => alert('xss') };
    const result = sanitizeProgressData(input);
    expect(result['guide-1']).toBeUndefined();
  });

  it('should handle null input', () => {
    const result = sanitizeProgressData(null);
    expect(Object.keys(result).length).toBe(0);
  });

  it('should handle undefined input', () => {
    const result = sanitizeProgressData(undefined);
    expect(Object.keys(result).length).toBe(0);
  });
});

describe('Import/Export - Export Data Builder', () => {
  it('should include version in export', () => {
    const result = buildExportData({});
    expect(result.version).toBe('3.0');
  });

  it('should include export date', () => {
    const result = buildExportData({});
    expect(result.exportDate).toBeTruthy();
  });

  it('should default empty collections to array', () => {
    const result = buildExportData({});
    expect(Array.isArray(result.collections)).toBe(true);
  });

  it('should include progress from storage', () => {
    const storage = { progress: { 'guide-1': true } };
    const result = buildExportData(storage);
    expect(result.progress['guide-1']).toBe(true);
  });

  it('should include collections from storage', () => {
    const storage = { collections: [{ name: 'test' }] };
    const result = buildExportData(storage);
    expect(result.collections.length).toBe(1);
  });

  it('should include notes from storage', () => {
    const storage = { notes: { 'guide-1': 'my notes' } };
    const result = buildExportData(storage);
    expect(result.notes['guide-1']).toBe('my notes');
  });
});
