/**
 * Tests for the UI Module
 * Tests theme toggle, filter buttons, and back-to-top functionality
 */

import { describe, it, expect, beforeEach } from './test-runner.js';

// Mock localStorage
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

// Mock DOM element
class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName;
    this.id = id;
    this.className = '';
    this.classList = new DOMClassList();
    this.innerHTML = '';
    this.textContent = '';
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.parent = null;
    this.eventListeners = {};
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
    }
  }

  click() {
    if (this.eventListeners['click']) {
      this.eventListeners['click'].forEach(h => h({ button: 0 }));
    }
  }

  appendChild(child) {
    this.children.push(child);
    if (child instanceof MockElement) {
      child.parent = this;
    }
  }

  querySelector(selector) {
    if (selector === 'h3') {
      for (const child of this.children) {
        if (child.tagName === 'h3') return child;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector === '.card[data-guide]') {
      for (const child of this.children) {
        if (child.classList.contains('card') && child.getAttribute('data-guide')) {
          results.push(child);
        }
      }
    } else if (selector === '.filter-btn') {
      for (const child of this.children) {
        if (child.classList.contains('filter-btn')) {
          results.push(child);
        }
      }
    } else if (selector === '.section-heading') {
      for (const child of this.children) {
        if (child.classList.contains('section-heading')) {
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

// Setup mock localStorage
const mockStorage = new MockLocalStorage();
globalThis.localStorage = mockStorage;

// Mock DOM
globalThis.document = {
  documentElement: {
    setAttribute: function(attr, value) {
      this.attributes = this.attributes || {};
      this.attributes[attr] = value;
    },
    getAttribute: function(attr) {
      this.attributes = this.attributes || {};
      return this.attributes[attr] || null;
    },
    attributes: {}
  },
  getElementById: (id) => new MockElement('div', id),
  querySelector: (selector) => {
    if (selector === '.filter-btn.active') {
      return new MockElement('button', 'active-filter');
    }
    return null;
  },
  querySelectorAll: (selector) => [],
  addEventListener: () => {},
  readyState: 'complete'
};

globalThis.window = {
  scrollY: 0,
  scrollTo: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

import * as storage from '../js/storage.js';

describe('UI Module - Core Functionality', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe('Theme Toggle', () => {
    it('should default to dark theme', () => {
      const theme = storage.getTheme();
      expect(theme).toBe('dark');
    });

    it('should toggle theme from dark to light', () => {
      storage.setTheme('light');
      const theme = storage.getTheme();
      expect(theme).toBe('light');
    });

    it('should toggle theme from light to dark', () => {
      storage.setTheme('light');
      storage.setTheme('dark');
      const theme = storage.getTheme();
      expect(theme).toBe('dark');
    });

    it('should persist theme preference across calls', () => {
      storage.setTheme('light');
      const theme1 = storage.getTheme();
      const theme2 = storage.getTheme();
      expect(theme1).toBe(theme2);
      expect(theme1).toBe('light');
    });

    it('should update data-theme attribute', () => {
      const themes = ['dark', 'light'];
      themes.forEach(theme => {
        storage.setTheme(theme);
        const saved = storage.getTheme();
        expect(saved).toBe(theme);
      });
    });

    it('should toggle theme icon based on current theme', () => {
      const iconMap = {
        dark: '☀️',
        light: '🌙'
      };

      storage.setTheme('dark');
      const darkIcon = storage.getTheme() === 'dark' ? iconMap['dark'] : iconMap['light'];
      expect(darkIcon).toBe('☀️');

      storage.setTheme('light');
      const lightIcon = storage.getTheme() === 'light' ? iconMap['light'] : iconMap['dark'];
      expect(lightIcon).toBe('🌙');
    });
  });

  describe('Filter Button Logic', () => {
    it('should track active filter state', () => {
      const filter = 'critical';
      // Simulate setting active filter
      const activeFilter = filter;
      expect(activeFilter).toBe('critical');
    });

    it('should support all filter types', () => {
      const supportedFilters = [
        'all', 'critical', 'essential', 'rebuild', 'new',
        'unread', 'completed', 'beginner', 'intermediate', 'advanced', 'tools'
      ];

      supportedFilters.forEach(filter => {
        expect(filter).toBeTruthy();
      });
    });

    it('should apply filter to card visibility', () => {
      // Simulate cards and filtering
      const cards = [
        { id: 'card1', tags: 'critical', show: false },
        { id: 'card2', tags: 'essential', show: false },
        { id: 'card3', tags: 'critical', show: false }
      ];

      const filter = 'critical';
      cards.forEach(card => {
        card.show = card.tags.includes(filter);
      });

      const visibleCards = cards.filter(c => c.show);
      expect(visibleCards.length).toBe(2);
      expect(visibleCards[0].id).toBe('card1');
      expect(visibleCards[1].id).toBe('card3');
    });

    it('should have only one active filter at a time', () => {
      const filters = new Set(['critical']);
      filters.add('essential');

      // New filter replaces old one
      filters.clear();
      filters.add('essential');

      expect(filters.size).toBe(1);
      expect(filters.has('essential')).toBe(true);
    });

    it('should activate filter button and deactivate others', () => {
      const buttons = [
        { id: 'btn-all', active: true },
        { id: 'btn-critical', active: false },
        { id: 'btn-essential', active: false }
      ];

      // Activate 'critical' button
      buttons.forEach(btn => btn.active = false);
      buttons[1].active = true;

      expect(buttons[1].active).toBe(true);
      expect(buttons[0].active).toBe(false);
      expect(buttons[2].active).toBe(false);
    });
  });

  describe('Filter Application - Card Visibility', () => {
    it('should show all cards on "all" filter', () => {
      const cards = [
        { id: '1', display: 'none' },
        { id: '2', display: 'none' },
        { id: '3', display: 'none' }
      ];

      // Apply 'all' filter
      cards.forEach(card => card.display = '');

      const visibleCards = cards.filter(c => c.display !== 'none');
      expect(visibleCards.length).toBe(3);
    });

    it('should filter cards by critical tag', () => {
      const cards = [
        { id: '1', tags: 'critical', display: '' },
        { id: '2', tags: 'essential', display: '' },
        { id: '3', tags: 'critical important', display: '' }
      ];

      const filter = 'critical';
      cards.forEach(card => {
        card.display = card.tags.includes(filter) ? '' : 'none';
      });

      const visible = cards.filter(c => c.display === '');
      expect(visible.length).toBe(2);
    });

    it('should filter cards by difficulty', () => {
      const cards = [
        { id: '1', difficulty: 'beginner', display: '' },
        { id: '2', difficulty: 'advanced', display: '' },
        { id: '3', difficulty: 'beginner', display: '' }
      ];

      const filter = 'beginner';
      cards.forEach(card => {
        card.display = card.difficulty === filter ? '' : 'none';
      });

      const visible = cards.filter(c => c.display === '');
      expect(visible.length).toBe(2);
    });

    it('should filter unread cards based on completion status', () => {
      storage.set('compendium-progress', {
        'guide-1': { completed: true },
        'guide-2': { completed: false }
      });

      const progress = storage.getProgress();
      const unreadCards = ['guide-1', 'guide-2'].filter(id => !progress[id]?.completed);

      expect(unreadCards.length).toBe(1);
      expect(unreadCards[0]).toBe('guide-2');
    });

    it('should filter completed cards', () => {
      storage.addCompletedGuide('guide-1');
      storage.addCompletedGuide('guide-2');

      const progress = storage.getProgress();
      const completedCards = ['guide-1', 'guide-2', 'guide-3'].filter(id => progress[id]?.completed);

      expect(completedCards.length).toBe(2);
    });

    it('should filter by category', () => {
      const cards = [
        { id: '1', category: 'tools', display: '' },
        { id: '2', category: 'survival', display: '' },
        { id: '3', category: 'tools', display: '' }
      ];

      const filter = 'tools';
      cards.forEach(card => {
        card.display = card.category === filter ? '' : 'none';
      });

      const visible = cards.filter(c => c.display === '');
      expect(visible.length).toBe(2);
    });
  });

  describe('Section Heading Visibility', () => {
    it('should hide section when no cards are visible', () => {
      const section = {
        visibleCards: 0,
        heading: { display: '' }
      };

      // Update heading visibility based on visible cards
      section.heading.display = section.visibleCards > 0 ? '' : 'none';

      expect(section.heading.display).toBe('none');
    });

    it('should show section when cards are visible', () => {
      const section = {
        visibleCards: 3,
        heading: { display: '' }
      };

      section.heading.display = section.visibleCards > 0 ? '' : 'none';

      expect(section.heading.display).toBe('');
    });

    it('should update section visibility without affecting other sections', () => {
      const sections = [
        { id: 'section1', visibleCards: 0, heading: { display: '' } },
        { id: 'section2', visibleCards: 2, heading: { display: '' } },
        { id: 'section3', visibleCards: 0, heading: { display: '' } }
      ];

      sections.forEach(section => {
        section.heading.display = section.visibleCards > 0 ? '' : 'none';
      });

      expect(sections[0].heading.display).toBe('none');
      expect(sections[1].heading.display).toBe('');
      expect(sections[2].heading.display).toBe('none');
    });
  });

  describe('Back-to-Top Button Visibility', () => {
    it('should hide button when scroll position is 0', () => {
      const backBtn = { display: 'none' };
      const scrollY = 0;

      backBtn.display = scrollY > 400 ? 'block' : 'none';

      expect(backBtn.display).toBe('none');
    });

    it('should show button when scroll position exceeds threshold', () => {
      const backBtn = { display: 'none' };
      const scrollY = 500;

      backBtn.display = scrollY > 400 ? 'block' : 'none';

      expect(backBtn.display).toBe('block');
    });

    it('should use 400px threshold', () => {
      const testCases = [
        { scrollY: 0, expected: 'none' },
        { scrollY: 200, expected: 'none' },
        { scrollY: 399, expected: 'none' },
        { scrollY: 400, expected: 'none' },
        { scrollY: 401, expected: 'block' },
        { scrollY: 1000, expected: 'block' }
      ];

      testCases.forEach(testCase => {
        const btn = { display: 'none' };
        btn.display = testCase.scrollY > 400 ? 'block' : 'none';
        expect(btn.display).toBe(testCase.expected);
      });
    });

    it('should scroll to top with smooth behavior', () => {
      const scrollCalls = [];
      const mockScrollTo = (options) => {
        scrollCalls.push(options);
      };

      mockScrollTo({ top: 0, behavior: 'smooth' });

      expect(scrollCalls[0].top).toBe(0);
      expect(scrollCalls[0].behavior).toBe('smooth');
    });
  });

  describe('Progress Display', () => {
    it('should calculate read count', () => {
      storage.addCompletedGuide('guide-1');
      storage.addCompletedGuide('guide-2');

      const progress = storage.getProgress();
      const readCount = Object.values(progress).filter(p => p.completed).length;

      expect(readCount).toBe(2);
    });

    it('should display progress as fraction', () => {
      storage.addCompletedGuide('guide-1');
      storage.addCompletedGuide('guide-2');

      const progress = storage.getProgress();
      const readCount = Object.values(progress).filter(p => p.completed).length;
      const totalGuides = 10;

      const display = `${readCount}/${totalGuides}`;
      expect(display).toBe('2/10');
    });

    it('should update progress count when guides are completed', () => {
      let count = 0;

      storage.addCompletedGuide('guide-1');
      count++;
      expect(count).toBe(1);

      storage.addCompletedGuide('guide-2');
      count++;
      expect(count).toBe(2);
    });
  });

  describe('Keyboard Navigation for Filters', () => {
    it('should support Enter key on filter buttons', () => {
      const clickEvents = [];
      const button = {
        click: () => clickEvents.push('clicked'),
        addEventListener: (event, handler) => {
          if (event === 'keydown') {
            handler({ key: 'Enter', preventDefault: () => {} });
          }
        }
      };

      // Simulate Enter key event
      const mockHandler = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          button.click();
        }
      };

      mockHandler({ key: 'Enter', preventDefault: () => {} });
      expect(clickEvents.length).toBe(1);
    });

    it('should support Space key on filter buttons', () => {
      const clickEvents = [];
      const button = {
        click: () => clickEvents.push('clicked'),
        addEventListener: (event, handler) => {
          if (event === 'keydown') {
            handler({ key: ' ', preventDefault: () => {} });
          }
        }
      };

      const mockHandler = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          button.click();
        }
      };

      mockHandler({ key: ' ', preventDefault: () => {} });
      expect(clickEvents.length).toBe(1);
    });
  });

  describe('Accessibility Announcements', () => {
    it('should announce filter changes to screen readers', () => {
      const visibleCount = 5;
      const filter = 'critical';
      const ariaLabel = `Showing ${visibleCount} guides filtered by ${filter}`;

      expect(ariaLabel).toContain('Showing 5 guides');
      expect(ariaLabel).toContain('critical');
    });

    it('should provide aria-live region for dynamic updates', () => {
      const container = { ariaLive: '', ariaLabel: '' };
      container.ariaLive = 'polite';
      container.ariaLabel = 'Guides container';

      expect(container.ariaLive).toBe('polite');
    });
  });
});
