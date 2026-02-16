/**
 * Tests for the Storage Module
 */

import { describe, it, expect, beforeEach, afterEach } from './test-runner.js';

// Mock localStorage for Node.js environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] ?? null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }

  key(index) {
    return Object.keys(this.store)[index] ?? null;
  }

  get length() {
    return Object.keys(this.store).length;
  }
}

// Setup mock before importing storage module
const mockStorage = new MockLocalStorage();
globalThis.localStorage = mockStorage;

// Now import storage module
import * as storage from '../js/storage.js';

describe('Storage Module', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe('get() and set() - Basic Operations', () => {
    it('should store and retrieve a string value', () => {
      storage.set('test-key', 'test-value');
      const value = storage.get('test-key');
      expect(value).toBe('test-value');
    });

    it('should store and retrieve an object', () => {
      const obj = { name: 'John', age: 30 };
      storage.set('user', obj);
      const retrieved = storage.get('user');
      expect(retrieved).toEqual(obj);
    });

    it('should store and retrieve an array', () => {
      const arr = [1, 2, 3, 4, 5];
      storage.set('numbers', arr);
      const retrieved = storage.get('numbers');
      expect(retrieved).toEqual(arr);
    });

    it('should return default value if key does not exist', () => {
      const value = storage.get('non-existent-key', 'default');
      expect(value).toBe('default');
    });

    it('should return null as default if not specified', () => {
      const value = storage.get('non-existent-key');
      expect(value).toBeNull();
    });

    it('should store and retrieve boolean values', () => {
      storage.set('bool-true', true);
      storage.set('bool-false', false);
      expect(storage.get('bool-true')).toBe(true);
      expect(storage.get('bool-false')).toBe(false);
    });

    it('should store and retrieve numbers', () => {
      storage.set('count', 42);
      storage.set('decimal', 3.14);
      expect(storage.get('count')).toBe(42);
      expect(storage.get('decimal')).toBe(3.14);
    });

    it('should handle null values', () => {
      storage.set('null-value', null);
      const value = storage.get('null-value');
      expect(value).toBeNull();
    });

    it('should handle nested objects', () => {
      const nested = {
        user: {
          profile: {
            name: 'Alice',
            settings: {
              theme: 'dark',
              notifications: true,
            },
          },
        },
      };
      storage.set('nested', nested);
      const retrieved = storage.get('nested');
      expect(retrieved).toEqual(nested);
    });
  });

  describe('remove() - Deletion Operations', () => {
    it('should remove an existing key', () => {
      storage.set('to-delete', 'value');
      storage.remove('to-delete');
      const value = storage.get('to-delete', 'default');
      expect(value).toBe('default');
    });

    it('should handle removing non-existent key gracefully', () => {
      expect(() => {
        storage.remove('does-not-exist');
      }).not.toThrow();
    });

    it('should only remove the specified key', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      storage.remove('key1');
      expect(storage.get('key1')).toBeNull();
      expect(storage.get('key2')).toBe('value2');
    });
  });

  describe('getAllWithPrefix() - Prefix Matching', () => {
    it('should retrieve all keys with a given prefix', () => {
      storage.set('user-name', 'John');
      storage.set('user-email', 'john@example.com');
      storage.set('user-age', 30);
      storage.set('product-name', 'Widget');

      const userKeys = storage.getAllWithPrefix('user-');
      expect(userKeys.length).toBe(3);
      expect(userKeys).toContain('user-name');
      expect(userKeys).toContain('user-email');
      expect(userKeys).toContain('user-age');
    });

    it('should return empty array when no keys match prefix', () => {
      storage.set('other-key', 'value');
      const keys = storage.getAllWithPrefix('non-existent-');
      expect(keys.length).toBe(0);
    });

    it('should handle prefixes with special characters', () => {
      storage.set('app:setting:theme', 'dark');
      storage.set('app:setting:language', 'en');
      storage.set('other:key', 'value');

      const appKeys = storage.getAllWithPrefix('app:setting:');
      expect(appKeys.length).toBe(2);
    });

    it('should not match partial prefixes', () => {
      storage.set('compendium-progress', '{}');
      storage.set('compendium', '{}');

      const keys = storage.getAllWithPrefix('compendium-');
      expect(keys).not.toContain('compendium');
      expect(keys).toContain('compendium-progress');
    });
  });

  describe('clearPrefix() - Clear with Prefix', () => {
    it('should clear all keys with a given prefix', () => {
      storage.set('cache:item1', 'value1');
      storage.set('cache:item2', 'value2');
      storage.set('cache:item3', 'value3');
      storage.set('other:item', 'value');

      storage.clearPrefix('cache:');

      expect(storage.get('cache:item1')).toBeNull();
      expect(storage.get('cache:item2')).toBeNull();
      expect(storage.get('cache:item3')).toBeNull();
      expect(storage.get('other:item')).toBe('value');
    });

    it('should handle clearing when no keys match prefix', () => {
      storage.set('existing-key', 'value');
      expect(() => {
        storage.clearPrefix('non-existent-');
      }).not.toThrow();
      expect(storage.get('existing-key')).toBe('value');
    });

    it('should completely remove prefixed keys', () => {
      storage.set('temp-1', 'a');
      storage.set('temp-2', 'b');
      storage.clearPrefix('temp-');
      const keys = storage.getAllWithPrefix('temp-');
      expect(keys.length).toBe(0);
    });
  });

  describe('getTheme() and setTheme() - Theme Preference', () => {
    it('should default to dark theme', () => {
      const theme = storage.getTheme();
      expect(theme).toBe('dark');
    });

    it('should store and retrieve light theme', () => {
      storage.setTheme('light');
      expect(storage.getTheme()).toBe('light');
    });

    it('should update theme when changed', () => {
      storage.setTheme('light');
      expect(storage.getTheme()).toBe('light');
      storage.setTheme('dark');
      expect(storage.getTheme()).toBe('dark');
    });

    it('should use compendium-theme key', () => {
      storage.setTheme('light');
      const value = storage.get('compendium-theme');
      expect(value).toBe('light');
    });
  });

  describe('getProgress() and setProgress() - Reading Progress', () => {
    it('should default to empty object', () => {
      const progress = storage.getProgress();
      expect(progress).toEqual({});
    });

    it('should store and retrieve progress object', () => {
      const progress = {
        'guide-1': { completed: true, percentage: 100 },
        'guide-2': { completed: false, percentage: 45 },
      };
      storage.setProgress(progress);
      expect(storage.getProgress()).toEqual(progress);
    });

    it('should persist progress across multiple calls', () => {
      const progress1 = { 'guide-1': { percentage: 50 } };
      storage.setProgress(progress1);
      expect(storage.getProgress()).toEqual(progress1);

      const progress2 = { 'guide-1': { percentage: 100 } };
      storage.setProgress(progress2);
      expect(storage.getProgress()).toEqual(progress2);
    });

    it('should use compendium-progress key', () => {
      const progress = { 'test-guide': { percentage: 75 } };
      storage.setProgress(progress);
      const value = storage.get('compendium-progress');
      expect(value).toEqual(progress);
    });
  });

  describe('getAchievements() and setAchievements() - Achievements', () => {
    it('should default to empty object', () => {
      const achievements = storage.getAchievements();
      expect(achievements).toEqual({});
    });

    it('should store and retrieve achievements object', () => {
      const achievements = {
        'achievement-1': { unlocked: true, unlockedAt: '2024-01-15' },
        'achievement-2': { unlocked: false },
      };
      storage.setAchievements(achievements);
      expect(storage.getAchievements()).toEqual(achievements);
    });

    it('should use compendium-achievements key', () => {
      const achievements = { 'badge-1': { unlocked: true } };
      storage.setAchievements(achievements);
      const value = storage.get('compendium-achievements');
      expect(value).toEqual(achievements);
    });
  });

  describe('getNotes() and setNotes() - Guide Notes', () => {
    it('should return null for non-existent notes', () => {
      const notes = storage.getNotes('non-existent-guide');
      expect(notes).toBeNull();
    });

    it('should store and retrieve notes for a guide', () => {
      const testNotes = 'This is important survival information';
      storage.setNotes('guide-1', testNotes);
      expect(storage.getNotes('guide-1')).toBe(testNotes);
    });

    it('should use correct key format with guide ID', () => {
      storage.setNotes('shelter-guide', 'Build a strong shelter');
      const value = storage.get('compendium-notes-shelter-guide');
      expect(value).toBe('Build a strong shelter');
    });

    it('should allow storing notes for multiple guides', () => {
      storage.setNotes('guide-1', 'Notes for guide 1');
      storage.setNotes('guide-2', 'Notes for guide 2');
      expect(storage.getNotes('guide-1')).toBe('Notes for guide 1');
      expect(storage.getNotes('guide-2')).toBe('Notes for guide 2');
    });

    it('should support empty notes', () => {
      storage.setNotes('guide-empty', '');
      expect(storage.getNotes('guide-empty')).toBe('');
    });

    it('should handle notes with special characters', () => {
      const complexNotes = 'Line 1\nLine 2\n"Quoted" & special chars: @#$%';
      storage.setNotes('complex-guide', complexNotes);
      expect(storage.getNotes('complex-guide')).toBe(complexNotes);
    });
  });

  describe('getAllNotes() - Retrieve All Notes', () => {
    it('should return empty object when no notes exist', () => {
      const notes = storage.getAllNotes();
      expect(notes).toEqual({});
    });

    it('should retrieve all notes keyed by guide ID', () => {
      storage.setNotes('fire-guide', 'How to build fire');
      storage.setNotes('water-guide', 'How to find water');
      storage.setNotes('food-guide', 'How to find food');

      const allNotes = storage.getAllNotes();
      expect(allNotes).toEqual({
        'fire-guide': 'How to build fire',
        'water-guide': 'How to find water',
        'food-guide': 'How to find food',
      });
    });

    it('should only retrieve notes, not other compendium keys', () => {
      storage.set('compendium-theme', 'light');
      storage.set('compendium-progress', {});
      storage.setNotes('guide-1', 'My notes');

      const allNotes = storage.getAllNotes();
      expect(allNotes).toEqual({ 'guide-1': 'My notes' });
    });

    it('should handle guide IDs with special characters', () => {
      storage.setNotes('guide-with-dashes', 'Notes 1');
      storage.setNotes('guide-with_underscores', 'Notes 2');
      storage.setNotes('guide123', 'Notes 3');

      const allNotes = storage.getAllNotes();
      expect(Object.keys(allNotes).length).toBe(3);
      expect(allNotes['guide-with-dashes']).toBe('Notes 1');
      expect(allNotes['guide-with_underscores']).toBe('Notes 2');
      expect(allNotes['guide123']).toBe('Notes 3');
    });
  });

  describe('Integration Tests - Complex Scenarios', () => {
    it('should handle mixed data types in storage', () => {
      storage.set('string', 'hello');
      storage.set('number', 42);
      storage.set('boolean', true);
      storage.set('object', { key: 'value' });
      storage.set('array', [1, 2, 3]);

      expect(storage.get('string')).toBe('hello');
      expect(storage.get('number')).toBe(42);
      expect(storage.get('boolean')).toBe(true);
      expect(storage.get('object')).toEqual({ key: 'value' });
      expect(storage.get('array')).toEqual([1, 2, 3]);
    });

    it('should maintain data integrity through multiple operations', () => {
      const data = { id: 1, name: 'Test', values: [1, 2, 3] };
      storage.set('complex', data);
      const retrieved = storage.get('complex');
      storage.set('complex', { ...retrieved, name: 'Updated' });
      const final = storage.get('complex');

      expect(final.id).toBe(1);
      expect(final.name).toBe('Updated');
      expect(final.values).toEqual([1, 2, 3]);
    });

    it('should support concurrent operations', () => {
      for (let i = 0; i < 100; i++) {
        storage.set(`key-${i}`, `value-${i}`);
      }

      for (let i = 0; i < 100; i++) {
        expect(storage.get(`key-${i}`)).toBe(`value-${i}`);
      }
    });

    it('should handle large objects', () => {
      const largeObject = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
          description: 'Lorem ipsum dolor sit amet',
        })),
      };
      storage.set('large', largeObject);
      const retrieved = storage.get('large');
      expect(retrieved.data.length).toBe(1000);
      expect(retrieved.data[999].name).toBe('item-999');
    });
  });
});
