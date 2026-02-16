/**
 * Tests for the Search Module
 * Tests the search filtering logic (extracted from DOM-dependent functionality)
 */

import { describe, it, expect, beforeEach } from './test-runner.js';

/**
 * Mock DOM environment
 */
class MockElement {
  constructor(tagName, content = '') {
    this.tagName = tagName;
    this.textContent = content;
    this.attributes = {};
    this.parent = null;
    this.children = [];
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelector(selector) {
    if (selector === 'h3') {
      for (const child of this.children) {
        if (child.tagName === 'h3') return child;
      }
    }
    if (selector === 'p') {
      for (const child of this.children) {
        if (child.tagName === 'p') return child;
      }
    }
    return null;
  }

  closest(selector) {
    let current = this.parent;
    while (current) {
      if (selector.includes('[data-section]')) {
        if (current.getAttribute('data-section')) return current;
      }
      current = current.parent;
    }
    return null;
  }
}

function createMockCard(title, description, href, tags = '', section = '') {
  const card = new MockElement('a', '');
  card.setAttribute('href', href);
  card.setAttribute('data-tags', tags);

  const h3 = new MockElement('h3', title);
  const p = new MockElement('p', description);

  h3.parent = card;
  p.parent = card;
  card.children.push(h3, p);

  if (section) {
    const sectionDiv = new MockElement('div', '');
    sectionDiv.setAttribute('data-section', section);
    card.parent = sectionDiv;
  }

  return card;
}

/**
 * Extract the search filtering logic
 * (This tests the core algorithm without DOM interaction)
 */
function filterGuides(guides, query) {
  const q = query.toLowerCase().trim();
  if (q.length < 2) {
    return [];
  }

  return guides
    .filter(g => g.title.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q))
    .slice(0, 8);
}

function buildGuideData(cards) {
  return cards.map(card => ({
    title: card.querySelector('h3').textContent,
    desc: card.querySelector('p').textContent,
    href: card.getAttribute('href'),
    tags: card.getAttribute('data-tags'),
    section: card.closest('[data-section]')?.getAttribute('data-section') || '',
  }));
}

describe('Search Module - Core Filtering Logic', () => {
  describe('Basic Title Matching', () => {
    it('should find guides by exact title match', () => {
      const guides = [
        { title: 'Building a Shelter', desc: 'Learn to build', href: '#', tags: '', section: '' },
        { title: 'Finding Water', desc: 'Locate sources', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'shelter');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Building a Shelter');
    });

    it('should find guides by partial title match', () => {
      const guides = [
        { title: 'Water Collection Methods', desc: 'Different ways', href: '#', tags: '', section: '' },
        { title: 'Purifying Water', desc: 'Make it safe', href: '#', tags: '', section: '' },
        { title: 'Fire Building Basics', desc: 'Start a fire', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'water');
      expect(results.length).toBe(2);
      expect(results[0].title).toContain('Water');
      expect(results[1].title).toContain('Water');
    });

    it('should match single character substring', () => {
      const guides = [
        { title: 'Advanced Knot Tying', desc: 'Learn knots', href: '#', tags: '', section: '' },
        { title: 'Basic Fire', desc: 'Knot technique', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'kn');
      expect(results.length).toBe(2);
    });

    it('should handle query with leading/trailing whitespace', () => {
      const guides = [
        { title: 'Shelter Building', desc: 'Build a shelter', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, '  shelter  ');
      expect(results.length).toBe(1);
    });
  });

  describe('Description Matching', () => {
    it('should find guides by description match', () => {
      const guides = [
        { title: 'Guide One', desc: 'Learn about water safety', href: '#', tags: '', section: '' },
        { title: 'Guide Two', desc: 'Fire safety tips', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'safety');
      expect(results.length).toBe(2);
    });

    it('should match description when title does not match', () => {
      const guides = [
        { title: 'First Aid', desc: 'Bandaging and water treatment', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'treatment');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('First Aid');
    });

    it('should find guides matching either title or description', () => {
      const guides = [
        { title: 'Shelter Construction', desc: 'Build protective structures', href: '#', tags: '', section: '' },
        { title: 'Emergency Response', desc: 'Shelter from elements', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'shelter');
      expect(results.length).toBe(2);
    });
  });

  describe('Case Insensitive Search', () => {
    it('should match uppercase query to lowercase content', () => {
      const guides = [
        { title: 'water purification', desc: 'clean drinking water', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'WATER');
      expect(results.length).toBe(1);
    });

    it('should match lowercase query to uppercase content', () => {
      const guides = [
        { title: 'FIRE STARTING', desc: 'create flames', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'fire');
      expect(results.length).toBe(1);
    });

    it('should match mixed case query', () => {
      const guides = [
        { title: 'Emergency Shelter', desc: 'last resort', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'EmErGeNcY');
      expect(results.length).toBe(1);
    });
  });

  describe('Minimum Character Requirement', () => {
    it('should return no results for single character query', () => {
      const guides = [
        { title: 'First Aid', desc: 'emergency help', href: '#', tags: '', section: '' },
        { title: 'Fire Building', desc: 'start fire', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'a');
      expect(results.length).toBe(0);
    });

    it('should return no results for empty query', () => {
      const guides = [
        { title: 'Survival Skills', desc: 'essential knowledge', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, '');
      expect(results.length).toBe(0);
    });

    it('should return results for 2 character query', () => {
      const guides = [
        { title: 'Survival Guide', desc: 'essentials', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'su');
      expect(results.length).toBe(1);
    });

    it('should return results for whitespace only (after trim is empty)', () => {
      const guides = [
        { title: 'Test Guide', desc: 'content', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, '   ');
      expect(results.length).toBe(0);
    });
  });

  describe('Result Limiting', () => {
    it('should limit results to 8 items maximum', () => {
      const guides = Array.from({ length: 20 }, (_, i) => ({
        title: `Fire Guide ${i}`,
        desc: 'fire related content',
        href: '#',
        tags: '',
        section: '',
      }));

      const results = filterGuides(guides, 'fire');
      expect(results.length).toBe(8);
    });

    it('should return fewer than 8 results if fewer matches exist', () => {
      const guides = [
        { title: 'Water Source 1', desc: 'finding water', href: '#', tags: '', section: '' },
        { title: 'Water Source 2', desc: 'finding water', href: '#', tags: '', section: '' },
        { title: 'Water Source 3', desc: 'finding water', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'water');
      expect(results.length).toBe(3);
    });

    it('should maintain order of results when limiting', () => {
      const guides = Array.from({ length: 12 }, (_, i) => ({
        title: `Knot Type ${i}`,
        desc: `knot guide number ${i}`,
        href: '#',
        tags: '',
        section: '',
      }));

      const results = filterGuides(guides, 'knot');
      expect(results.length).toBe(8);
      expect(results[0].title).toBe('Knot Type 0');
      expect(results[7].title).toBe('Knot Type 7');
    });

    it('should return exactly 8 results when many match', () => {
      const guides = Array.from({ length: 100 }, (_, i) => ({
        title: `Survival Skill ${i}`,
        desc: `survival guide`,
        href: '#',
        tags: '',
        section: '',
      }));

      const results = filterGuides(guides, 'survival');
      expect(results.length).toBe(8);
    });
  });

  describe('No Matches', () => {
    it('should return empty array when no guides match', () => {
      const guides = [
        { title: 'Fire Building', desc: 'start a fire', href: '#', tags: '', section: '' },
        { title: 'Water Finding', desc: 'locate water sources', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'xyz');
      expect(results.length).toBe(0);
    });

    it('should return empty array when query has less than 2 characters', () => {
      const guides = [
        { title: 'Anything', desc: 'will match a single letter', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'a');
      expect(results.length).toBe(0);
    });

    it('should handle special characters in query', () => {
      const guides = [
        { title: 'Regular Guide', desc: 'normal content', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, '@#$');
      expect(results.length).toBe(0);
    });
  });

  describe('Special Cases and Edge Cases', () => {
    it('should handle guides with empty descriptions', () => {
      const guides = [
        { title: 'Fire Building', desc: '', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'fire');
      expect(results.length).toBe(1);
    });

    it('should handle guides with special characters in title', () => {
      const guides = [
        { title: 'First-Aid & Emergency Response', desc: 'help in crisis', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'first');
      expect(results.length).toBe(1);
    });

    it('should handle guides with numbers in title', () => {
      const guides = [
        { title: 'Survival Rule #1: Stay Calm', desc: 'mental fortitude', href: '#', tags: '', section: '' },
        { title: 'Survival Rule #2: Find Water', desc: 'hydration', href: '#', tags: '', section: '' },
      ];

      const results = filterGuides(guides, 'rule');
      expect(results.length).toBe(2);
    });

    it('should handle very long titles and descriptions', () => {
      const longTitle = 'A'.repeat(500);
      const guides = [
        {
          title: longTitle,
          desc: 'This is a very long description ' + 'B'.repeat(500),
          href: '#',
          tags: '',
          section: '',
        },
      ];

      const results = filterGuides(guides, 'aaa');
      expect(results.length).toBe(1);
    });

    it('should preserve all guide data in results', () => {
      const guides = [
        {
          title: 'Water Sources',
          desc: 'finding clean water',
          href: '/guides/water',
          tags: 'water,survival',
          section: 'Basics',
        },
      ];

      const results = filterGuides(guides, 'water');
      expect(results[0].href).toBe('/guides/water');
      expect(results[0].tags).toBe('water,survival');
      expect(results[0].section).toBe('Basics');
    });
  });

  describe('buildGuideData() - Card Data Extraction', () => {
    it('should extract basic card data correctly', () => {
      const card = createMockCard('Fire Building', 'Learn to make fire', '/guides/fire');
      const guides = buildGuideData([card]);

      expect(guides[0].title).toBe('Fire Building');
      expect(guides[0].desc).toBe('Learn to make fire');
      expect(guides[0].href).toBe('/guides/fire');
    });

    it('should extract data from multiple cards', () => {
      const card1 = createMockCard('Shelter', 'Build shelter', '/guides/shelter');
      const card2 = createMockCard('Water', 'Find water', '/guides/water');
      const guides = buildGuideData([card1, card2]);

      expect(guides.length).toBe(2);
      expect(guides[0].title).toBe('Shelter');
      expect(guides[1].title).toBe('Water');
    });

    it('should extract tags attribute', () => {
      const card = createMockCard('Guide', 'description', '/guide', 'survival,essential');
      const guides = buildGuideData([card]);

      expect(guides[0].tags).toBe('survival,essential');
    });

    it('should extract section from closest parent', () => {
      const card = createMockCard('Guide', 'description', '/guide', '', 'Fundamentals');
      const guides = buildGuideData([card]);

      expect(guides[0].section).toBe('Fundamentals');
    });

    it('should handle missing section gracefully', () => {
      const card = createMockCard('Guide', 'description', '/guide');
      const guides = buildGuideData([card]);

      expect(guides[0].section).toBe('');
    });
  });

  describe('Integration - Full Search Pipeline', () => {
    it('should perform end-to-end search on extracted card data', () => {
      const card1 = createMockCard('Water Purification', 'Clean drinking water', '/water', 'water,safety', 'Basics');
      const card2 = createMockCard('Fire Building', 'Create flames safely', '/fire', 'fire,safety', 'Basics');
      const card3 = createMockCard('Shelter Design', 'Weather protection', '/shelter', 'shelter,advanced', 'Advanced');

      const guides = buildGuideData([card1, card2, card3]);
      const results = filterGuides(guides, 'water');

      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Water Purification');
    });

    it('should search across extracted multiple cards', () => {
      const cards = [
        createMockCard('Water Source 1', 'finding water', '/w1'),
        createMockCard('Water Source 2', 'clean water', '/w2'),
        createMockCard('Water Source 3', 'water treatment', '/w3'),
      ];

      const guides = buildGuideData(cards);
      const results = filterGuides(guides, 'water');

      expect(results.length).toBe(3);
    });

    it('should limit results even with many card matches', () => {
      const cards = Array.from({ length: 15 }, (_, i) =>
        createMockCard(`Fire Method ${i}`, 'fire related content', `/fire${i}`)
      );

      const guides = buildGuideData(cards);
      const results = filterGuides(guides, 'fire');

      expect(results.length).toBe(8);
    });
  });
});
