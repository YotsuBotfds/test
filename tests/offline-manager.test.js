/**
 * Tests for Offline Manager - Core Logic
 * Tests category metadata building, formatting, and data integrity
 */

import { describe, it, expect } from './test-runner.js';

// Replicate pure logic functions from offline-manager.js for testing
function formatCategoryName(category) {
  return category
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildCategoryMetadata(guidesData) {
  const categories = {};

  guidesData.forEach(guide => {
    if (!categories[guide.category]) {
      categories[guide.category] = {
        name: formatCategoryName(guide.category),
        guides: [],
        totalSize: 0
      };
    }
    categories[guide.category].guides.push(guide);
    categories[guide.category].totalSize += 5000;
  });

  return categories;
}

describe('Offline Manager - formatCategoryName', () => {
  it('should capitalize single word categories', () => {
    expect(formatCategoryName('survival')).toBe('Survival');
  });

  it('should capitalize hyphenated category names', () => {
    expect(formatCategoryName('first-aid')).toBe('First Aid');
  });

  it('should handle multi-word hyphenated names', () => {
    expect(formatCategoryName('food-and-agriculture')).toBe('Food And Agriculture');
  });

  it('should handle already capitalized input', () => {
    expect(formatCategoryName('Medical')).toBe('Medical');
  });

  it('should handle single character segments', () => {
    expect(formatCategoryName('a-b-c')).toBe('A B C');
  });

  it('should handle empty string', () => {
    expect(formatCategoryName('')).toBe('');
  });
});

describe('Offline Manager - buildCategoryMetadata', () => {
  it('should group guides by category', () => {
    const guides = [
      { category: 'survival', title: 'Shelter', url: '/shelter' },
      { category: 'survival', title: 'Fire', url: '/fire' },
      { category: 'medical', title: 'First Aid', url: '/first-aid' },
    ];

    const result = buildCategoryMetadata(guides);
    expect(Object.keys(result).length).toBe(2);
    expect(result.survival.guides.length).toBe(2);
    expect(result.medical.guides.length).toBe(1);
  });

  it('should estimate size at 5KB per guide', () => {
    const guides = [
      { category: 'survival', title: 'A', url: '/a' },
      { category: 'survival', title: 'B', url: '/b' },
      { category: 'survival', title: 'C', url: '/c' },
    ];

    const result = buildCategoryMetadata(guides);
    expect(result.survival.totalSize).toBe(15000);
  });

  it('should set formatted display name', () => {
    const guides = [
      { category: 'first-aid', title: 'Bandaging', url: '/band' },
    ];

    const result = buildCategoryMetadata(guides);
    expect(result['first-aid'].name).toBe('First Aid');
  });

  it('should handle empty guides array', () => {
    const result = buildCategoryMetadata([]);
    expect(Object.keys(result).length).toBe(0);
  });

  it('should handle single guide', () => {
    const guides = [{ category: 'tools', title: 'Compass', url: '/compass' }];
    const result = buildCategoryMetadata(guides);
    expect(result.tools.guides.length).toBe(1);
    expect(result.tools.totalSize).toBe(5000);
  });

  it('should handle many categories', () => {
    const categories = ['survival', 'medical', 'tools', 'agriculture', 'crafts', 'defense'];
    const guides = categories.map(cat => ({ category: cat, title: cat, url: '/' + cat }));

    const result = buildCategoryMetadata(guides);
    expect(Object.keys(result).length).toBe(6);
  });
});
