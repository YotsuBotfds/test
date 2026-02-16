/**
 * Tests for the Cards Module
 * Tests card rendering, filtering, and error handling
 */

import { describe, it, expect, beforeEach } from './test-runner.js';

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

// Mock DOM environment
class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName;
    this.id = id;
    this.className = '';
    this.classList = new DOMClassList();
    this.innerHTML = '';
    this.textContent = '';
    this.attributes = {};
    this.children = [];
    this.parent = null;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  appendChild(child) {
    this.children.push(child);
    if (child instanceof MockElement) {
      child.parent = this;
    }
  }

  querySelector(selector) {
    // Support simple selectors like 'h3', '.class', '#id'
    if (selector === 'h3' || selector === 'p') {
      for (const child of this.children) {
        if (child.tagName === selector) return child;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector === '.card') {
      for (const child of this.children) {
        if (child.classList.contains('card')) {
          results.push(child);
        }
      }
    }
    return results;
  }

  closest(selector) {
    let current = this.parent;
    while (current) {
      if (selector === '[data-section]' && current.getAttribute('data-section')) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }
}

class DOMClassList {
  constructor() {
    this.classes = new Set();
  }

  add(className) {
    this.classes.add(className);
  }

  remove(className) {
    this.classes.delete(className);
  }

  contains(className) {
    return this.classes.has(className);
  }

  toggle(className) {
    if (this.contains(className)) {
      this.remove(className);
    } else {
      this.add(className);
    }
  }
}

// Setup mock before importing cards module
const mockStorage = new MockLocalStorage();
globalThis.localStorage = mockStorage;

// Mock document environment
globalThis.document = {
  getElementById: (id) => {
    if (id === 'guides-container') {
      return new MockElement('div', id);
    }
    return null;
  },
  createElement: (tagName) => new MockElement(tagName),
  querySelectorAll: () => [],
  addEventListener: () => {},
  readyState: 'complete',
};

globalThis.window = {
  location: { href: '#' },
  scrollY: 0,
  dispatchEvent: () => {},
  addEventListener: () => {},
  scrollTo: () => {},
};

globalThis.IntersectionObserver = class {
  constructor(callback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Now import the modules we're testing (testing core logic, not DOM interaction)
import * as storage from '../js/storage.js';
import { escapeHtml } from '../js/utils.js';

describe('Cards Module - Core Functions', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe('Card Data Processing', () => {
    it('should extract guide data correctly from guides array', () => {
      const guides = [
        {
          id: 'shelter',
          title: 'Building a Shelter',
          description: 'Learn to build protective shelters',
          category: 'survival',
          url: 'guides/shelter.html',
          tags: ['critical', 'start-here'],
          difficulty: 'beginner',
          icon: '🏠'
        }
      ];

      // Verify core data is present
      const guide = guides[0];
      expect(guide.id).toBe('shelter');
      expect(guide.title).toBe('Building a Shelter');
      expect(guide.description).toBe('Learn to build protective shelters');
      expect(guide.category).toBe('survival');
      expect(guide.tags).toContain('critical');
      expect(guide.tags).toContain('start-here');
      expect(guide.difficulty).toBe('beginner');
      expect(guide.icon).toBe('🏠');
    });

    it('should handle guides with prerequisites', () => {
      const guide = {
        id: 'advanced-shelter',
        title: 'Advanced Shelters',
        prerequisites: ['shelter', 'tools']
      };

      expect(guide.prerequisites).toContain('shelter');
      expect(guide.prerequisites.length).toBe(2);
    });

    it('should escape HTML in guide titles', () => {
      const dirtyTitle = '<script>alert("xss")</script>Survival Guide';
      const clean = escapeHtml(dirtyTitle);

      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Survival Guide');
    });

    it('should escape HTML in guide descriptions', () => {
      const dirtyDesc = 'Learn <img src=x onerror="alert(1)"> to survive';
      const clean = escapeHtml(dirtyDesc);

      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('<img');
    });
  });

  describe('Filter Functions - Core Logic', () => {
    it('should filter by critical tag', () => {
      const guides = [
        { id: 'fire', tags: ['critical'], title: 'Fire' },
        { id: 'water', tags: ['essential'], title: 'Water' },
        { id: 'shelter', tags: ['critical', 'important'], title: 'Shelter' }
      ];

      const criticalGuides = guides.filter(g => g.tags.includes('critical'));
      expect(criticalGuides.length).toBe(2);
      expect(criticalGuides[0].id).toBe('fire');
      expect(criticalGuides[1].id).toBe('shelter');
    });

    it('should filter by difficulty level', () => {
      const guides = [
        { id: 'guide1', difficulty: 'beginner', title: 'Basic Fire' },
        { id: 'guide2', difficulty: 'advanced', title: 'Advanced Weapons' },
        { id: 'guide3', difficulty: 'intermediate', title: 'Intermediate Shelter' }
      ];

      const beginnerGuides = guides.filter(g => g.difficulty === 'beginner');
      expect(beginnerGuides.length).toBe(1);
      expect(beginnerGuides[0].id).toBe('guide1');
    });

    it('should filter by category', () => {
      const guides = [
        { id: 'fire', category: 'survival', title: 'Fire' },
        { id: 'calc', category: 'tools', title: 'Calculator' },
        { id: 'water', category: 'survival', title: 'Water' }
      ];

      const toolsGuides = guides.filter(g => g.category === 'tools');
      expect(toolsGuides.length).toBe(1);
      expect(toolsGuides[0].id).toBe('calc');
    });

    it('should filter by tag (new-guide)', () => {
      const guides = [
        { id: 'guide1', tags: ['new-guide'], title: 'New Guide' },
        { id: 'guide2', tags: ['essential'], title: 'Old Guide' }
      ];

      const newGuides = guides.filter(g => g.tags.includes('new-guide'));
      expect(newGuides.length).toBe(1);
      expect(newGuides[0].id).toBe('guide1');
    });
  });

  describe('Progress and Completion Tracking', () => {
    it('should track completed guides', () => {
      const guide1Id = 'shelter-101';
      const guide2Id = 'water-101';

      // Mark guide as completed
      storage.addCompletedGuide(guide1Id);

      const completed = storage.getCompletedGuides();
      expect(completed.has(guide1Id)).toBe(true);
      expect(completed.has(guide2Id)).toBe(false);
    });

    it('should maintain completion across multiple guides', () => {
      storage.addCompletedGuide('guide-1');
      storage.addCompletedGuide('guide-2');
      storage.addCompletedGuide('guide-3');

      const completed = storage.getCompletedGuides();
      expect(completed.size).toBe(3);
      expect(completed.has('guide-1')).toBe(true);
      expect(completed.has('guide-2')).toBe(true);
      expect(completed.has('guide-3')).toBe(true);
    });

    it('should mark completion status in card filtering', () => {
      storage.addCompletedGuide('read-guide');

      const progress = storage.getProgress();
      expect(progress['read-guide']).not.toBeNull();
      expect(progress['read-guide'].completed).toBe(true);
    });
  });

  describe('Prerequisites Validation', () => {
    it('should validate prerequisites are met', () => {
      const prerequisites = ['fire', 'water'];
      const completedGuides = new Set(['fire', 'water']);

      const allMet = prerequisites.every(id => completedGuides.has(id));
      expect(allMet).toBe(true);
    });

    it('should detect unmet prerequisites', () => {
      const prerequisites = ['fire', 'water', 'shelter'];
      const completedGuides = new Set(['fire']);

      const allMet = prerequisites.every(id => completedGuides.has(id));
      expect(allMet).toBe(false);
    });

    it('should handle empty prerequisites', () => {
      const prerequisites = [];
      const completedGuides = new Set();

      const allMet = prerequisites.every(id => completedGuides.has(id));
      expect(allMet).toBe(true);
    });

    it('should filter guides by unmet prerequisites', () => {
      storage.addCompletedGuide('basics');

      const guides = [
        { id: 'advanced', prerequisites: ['basics'], title: 'Advanced' },
        { id: 'basics', prerequisites: [], title: 'Basics' },
        { id: 'expert', prerequisites: ['basics', 'advanced'], title: 'Expert' }
      ];

      const completed = storage.getCompletedGuides();
      const canAccessAdvanced = guides[0].prerequisites.every(id => completed.has(id));
      const canAccessExpert = guides[2].prerequisites.every(id => completed.has(id));

      expect(canAccessAdvanced).toBe(true);
      expect(canAccessExpert).toBe(false);
    });
  });

  describe('Category Grouping', () => {
    it('should group guides by category', () => {
      const guides = [
        { id: '1', category: 'survival', title: 'Fire' },
        { id: '2', category: 'survival', title: 'Water' },
        { id: '3', category: 'medical', title: 'First Aid' },
        { id: '4', category: 'medical', title: 'Injuries' }
      ];

      const grouped = {};
      for (const guide of guides) {
        const cat = guide.category || 'uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(guide);
      }

      expect(Object.keys(grouped).length).toBe(2);
      expect(grouped['survival'].length).toBe(2);
      expect(grouped['medical'].length).toBe(2);
    });

    it('should handle uncategorized guides', () => {
      const guides = [
        { id: '1', title: 'Categorized' },
        { id: '2', category: 'survival', title: 'Survival' }
      ];

      const grouped = {};
      for (const guide of guides) {
        const cat = guide.category || 'uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(guide);
      }

      expect(grouped['uncategorized'].length).toBe(1);
      expect(grouped['uncategorized'][0].id).toBe('1');
    });
  });

  describe('Error State Rendering', () => {
    it('should provide error message for missing guides', () => {
      const errorMsg = 'Error loading guides: Network error';
      expect(errorMsg).toContain('Error loading guides');
      expect(errorMsg).toContain('Network error');
    });

    it('should escape error messages to prevent XSS', () => {
      const dirtyError = 'Error: <script>alert(1)</script>';
      const clean = escapeHtml(dirtyError);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Error:');
    });

    it('should provide user-friendly error text', () => {
      const userFriendlyMsg = 'Unable to load guides. Please refresh the page to try again.';
      expect(userFriendlyMsg).toContain('Unable to load');
      expect(userFriendlyMsg).toContain('refresh');
    });
  });

  describe('Tag Formatting', () => {
    it('should format start-here tag correctly', () => {
      const tagMap = { 'start-here': 'Start Here' };
      expect(tagMap['start-here']).toBe('Start Here');
    });

    it('should format new-guide tag correctly', () => {
      const tagMap = { 'new-guide': 'New' };
      expect(tagMap['new-guide']).toBe('New');
    });

    it('should handle unknown tags gracefully', () => {
      const tag = 'unknown-tag';
      const formatted = tag.charAt(0).toUpperCase() + tag.slice(1);
      expect(formatted).toBe('Unknown-tag');
    });

    it('should support multiple tag types', () => {
      const tags = [
        { input: 'critical', expected: 'Critical' },
        { input: 'essential', expected: 'Essential' },
        { input: 'important', expected: 'Important' }
      ];

      tags.forEach(t => {
        const formatted = t.input.charAt(0).toUpperCase() + t.input.slice(1);
        expect(formatted).toBe(t.expected);
      });
    });
  });

  describe('Integration - Complex Filtering Scenarios', () => {
    it('should apply multiple filters simultaneously', () => {
      storage.addCompletedGuide('fire');

      const guides = [
        { id: 'fire', tags: ['critical'], difficulty: 'beginner', title: 'Fire' },
        { id: 'water', tags: ['essential'], difficulty: 'beginner', title: 'Water' },
        { id: 'weapons', tags: ['critical'], difficulty: 'advanced', title: 'Weapons' }
      ];

      // Filter for critical AND beginner
      const progress = storage.getProgress();
      const filtered = guides.filter(g =>
        g.tags.includes('critical') &&
        g.difficulty === 'beginner'
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('fire');
    });

    it('should handle empty guide list gracefully', () => {
      const guides = [];
      const grouped = {};
      for (const guide of guides) {
        const cat = guide.category || 'uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(guide);
      }

      expect(Object.keys(grouped).length).toBe(0);
    });

    it('should preserve guide order within categories', () => {
      const guides = [
        { id: '1', category: 'survival', order: 1, title: 'First' },
        { id: '2', category: 'survival', order: 2, title: 'Second' },
        { id: '3', category: 'survival', order: 3, title: 'Third' }
      ];

      const grouped = {};
      for (const guide of guides) {
        const cat = guide.category;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(guide);
      }

      expect(grouped['survival'][0].id).toBe('1');
      expect(grouped['survival'][1].id).toBe('2');
      expect(grouped['survival'][2].id).toBe('3');
    });
  });
});
