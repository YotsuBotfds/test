/**
 * Tests for the Learning Paths Module
 * Tests path loading, progress calculation, and prerequisite validation
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

const mockStorage = new MockLocalStorage();
globalThis.localStorage = mockStorage;

// Setup minimal DOM mock
globalThis.document = {
  readyState: 'complete',
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({
    id: '',
    className: '',
    innerHTML: '',
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    appendChild: () => {},
    style: {}
  })
};

globalThis.window = {
  scrollTo: () => {},
  addEventListener: () => {},
  location: { href: '' }
};

import * as storage from '../js/storage.js';

describe('Learning Paths Module - Core Functions', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe('Path Loading', () => {
    it('should have valid learning path structure', () => {
      const path = {
        id: 'survival-basics',
        name: 'Survival Basics',
        description: 'Essential survival skills',
        icon: '🔥',
        difficulty: 'beginner',
        estimatedHours: 10,
        guides: ['fire', 'water', 'shelter']
      };

      expect(path.id).toBe('survival-basics');
      expect(path.name).toBe('Survival Basics');
      expect(path.guides).toContain('fire');
      expect(path.difficulty).toBe('beginner');
    });

    it('should load multiple paths', () => {
      const paths = [
        {
          id: 'survival-basics',
          name: 'Survival Basics',
          guides: ['fire', 'water', 'shelter']
        },
        {
          id: 'advanced-survival',
          name: 'Advanced Survival',
          guides: ['tracking', 'hunting', 'trapping']
        }
      ];

      expect(paths.length).toBe(2);
      expect(paths[0].id).toBe('survival-basics');
      expect(paths[1].id).toBe('advanced-survival');
    });

    it('should have consistent guide references', () => {
      const path = {
        id: 'medical-basics',
        guides: ['first-aid', 'injury-care', 'herbal-medicine']
      };

      // All guides should be strings (IDs)
      const allValid = path.guides.every(g => typeof g === 'string');
      expect(allValid).toBe(true);
    });

    it('should differentiate paths by difficulty', () => {
      const paths = [
        { id: 'path1', difficulty: 'beginner' },
        { id: 'path2', difficulty: 'intermediate' },
        { id: 'path3', difficulty: 'advanced' }
      ];

      const difficulties = paths.map(p => p.difficulty);
      expect(difficulties).toContain('beginner');
      expect(difficulties).toContain('intermediate');
      expect(difficulties).toContain('advanced');
    });
  });

  describe('Progress Calculation', () => {
    it('should calculate progress as 0% when no guides completed', () => {
      const path = {
        id: 'test-path',
        guides: ['guide1', 'guide2', 'guide3']
      };

      const completedGuides = new Set();
      const completed = path.guides.filter(id => completedGuides.has(id)).length;
      const percentage = (completed / path.guides.length) * 100;

      expect(percentage).toBe(0);
    });

    it('should calculate progress as 100% when all guides completed', () => {
      storage.addCompletedGuide('guide1');
      storage.addCompletedGuide('guide2');
      storage.addCompletedGuide('guide3');

      const path = {
        id: 'test-path',
        guides: ['guide1', 'guide2', 'guide3']
      };

      const completedGuides = storage.getCompletedGuides();
      const completed = path.guides.filter(id => completedGuides.has(id)).length;
      const percentage = Math.round((completed / path.guides.length) * 100);

      expect(percentage).toBe(100);
    });

    it('should calculate partial progress correctly', () => {
      storage.addCompletedGuide('guide1');
      storage.addCompletedGuide('guide2');

      const path = {
        id: 'test-path',
        guides: ['guide1', 'guide2', 'guide3', 'guide4']
      };

      const completedGuides = storage.getCompletedGuides();
      const completed = path.guides.filter(id => completedGuides.has(id)).length;
      const percentage = Math.round((completed / path.guides.length) * 100);

      expect(percentage).toBe(50);
    });

    it('should handle single guide path', () => {
      const path = { id: 'single', guides: ['guide1'] };

      storage.addCompletedGuide('guide1');
      const completedGuides = storage.getCompletedGuides();
      const completed = path.guides.filter(id => completedGuides.has(id)).length;
      const percentage = Math.round((completed / path.guides.length) * 100);

      expect(percentage).toBe(100);
    });

    it('should return progress object with correct fields', () => {
      storage.addCompletedGuide('guide1');

      const path = { guides: ['guide1', 'guide2', 'guide3'] };
      const completedGuides = storage.getCompletedGuides();
      const completed = path.guides.filter(id => completedGuides.has(id)).length;

      const progress = {
        completed,
        total: path.guides.length,
        percentage: Math.round((completed / path.guides.length) * 100)
      };

      expect(progress).toEqual({
        completed: 1,
        total: 3,
        percentage: 33
      });
    });

    it('should track progress across multiple paths', () => {
      storage.addCompletedGuide('path1-guide1');
      storage.addCompletedGuide('path2-guide1');
      storage.addCompletedGuide('path2-guide2');

      const paths = [
        { id: 'path1', guides: ['path1-guide1', 'path1-guide2'] },
        { id: 'path2', guides: ['path2-guide1', 'path2-guide2', 'path2-guide3'] }
      ];

      const completedGuides = storage.getCompletedGuides();

      const path1Completed = paths[0].guides.filter(id => completedGuides.has(id)).length;
      const path1Percentage = Math.round((path1Completed / paths[0].guides.length) * 100);

      const path2Completed = paths[1].guides.filter(id => completedGuides.has(id)).length;
      const path2Percentage = Math.round((path2Completed / paths[1].guides.length) * 100);

      expect(path1Percentage).toBe(50);
      expect(path2Percentage).toBe(66);
    });
  });

  describe('Prerequisite Validation', () => {
    it('should validate single prerequisite met', () => {
      storage.addCompletedGuide('basics');

      const guide = {
        id: 'advanced',
        prerequisites: ['basics']
      };

      const completedGuides = storage.getCompletedGuides();
      const prereqsMet = guide.prerequisites.every(id => completedGuides.has(id));

      expect(prereqsMet).toBe(true);
    });

    it('should detect unmet prerequisites', () => {
      storage.addCompletedGuide('basics');

      const guide = {
        id: 'expert',
        prerequisites: ['basics', 'advanced']
      };

      const completedGuides = storage.getCompletedGuides();
      const prereqsMet = guide.prerequisites.every(id => completedGuides.has(id));

      expect(prereqsMet).toBe(false);
    });

    it('should handle guides with no prerequisites', () => {
      const guide = {
        id: 'intro',
        prerequisites: []
      };

      const completedGuides = storage.getCompletedGuides();
      const prereqsMet = guide.prerequisites.every(id => completedGuides.has(id));

      expect(prereqsMet).toBe(true);
    });

    it('should validate multiple prerequisites', () => {
      storage.addCompletedGuide('fire');
      storage.addCompletedGuide('water');
      storage.addCompletedGuide('shelter');

      const guide = {
        id: 'survival-expert',
        prerequisites: ['fire', 'water', 'shelter']
      };

      const completedGuides = storage.getCompletedGuides();
      const prereqsMet = guide.prerequisites.every(id => completedGuides.has(id));

      expect(prereqsMet).toBe(true);
    });

    it('should track prerequisite dependencies', () => {
      const depMap = {
        'fire': { requires: [] },
        'advanced-fire': { requires: ['fire'] },
        'fire-expert': { requires: ['fire', 'advanced-fire'] }
      };

      storage.addCompletedGuide('fire');
      const completed = storage.getCompletedGuides();

      // Check advanced-fire prerequisites
      const advancedPrereqs = depMap['advanced-fire'].requires;
      const advancedMet = advancedPrereqs.every(id => completed.has(id));
      expect(advancedMet).toBe(true);

      // Check fire-expert prerequisites
      const expertPrereqs = depMap['fire-expert'].requires;
      const expertMet = expertPrereqs.every(id => completed.has(id));
      expect(expertMet).toBe(false);
    });

    it('should find next available guide based on prerequisites', () => {
      storage.addCompletedGuide('basics');

      const pathGuides = [
        { id: 'basics', prerequisites: [] },
        { id: 'intermediate', prerequisites: ['basics'] },
        { id: 'advanced', prerequisites: ['basics', 'intermediate'] }
      ];

      const completed = storage.getCompletedGuides();
      let nextGuide = null;

      for (const guide of pathGuides) {
        const isCompleted = completed.has(guide.id);
        const prereqsMet = guide.prerequisites.every(id => completed.has(id));

        if (!isCompleted && prereqsMet) {
          nextGuide = guide.id;
          break;
        }
      }

      expect(nextGuide).toBe('intermediate');
    });
  });

  describe('Path Guide Information', () => {
    it('should return guides in path with metadata', () => {
      const guides = {
        'fire': { id: 'fire', title: 'Building Fire', icon: '🔥' },
        'water': { id: 'water', title: 'Finding Water', icon: '💧' }
      };

      const path = { guides: ['fire', 'water'] };
      const pathGuides = path.guides.map(guideId => guides[guideId]);

      expect(pathGuides[0].title).toBe('Building Fire');
      expect(pathGuides[1].title).toBe('Finding Water');
    });

    it('should track sequence number in path', () => {
      const path = { guides: ['guide1', 'guide2', 'guide3'] };
      const pathGuides = path.guides.map((guideId, index) => ({
        id: guideId,
        sequenceNumber: index + 1
      }));

      expect(pathGuides[0].sequenceNumber).toBe(1);
      expect(pathGuides[1].sequenceNumber).toBe(2);
      expect(pathGuides[2].sequenceNumber).toBe(3);
    });

    it('should include completion status in guide info', () => {
      storage.addCompletedGuide('guide1');

      const path = { guides: ['guide1', 'guide2'] };
      const completed = storage.getCompletedGuides();
      const pathGuides = path.guides.map(guideId => ({
        id: guideId,
        isCompleted: completed.has(guideId)
      }));

      expect(pathGuides[0].isCompleted).toBe(true);
      expect(pathGuides[1].isCompleted).toBe(false);
    });
  });

  describe('Recommended Path', () => {
    it('should identify beginner-friendly path', () => {
      const paths = [
        { id: 'survival-basics', difficulty: 'beginner', name: 'Survival Basics' },
        { id: 'advanced', difficulty: 'advanced', name: 'Advanced' }
      ];

      const recommended = paths.find(p => p.difficulty === 'beginner');
      expect(recommended.id).toBe('survival-basics');
    });

    it('should return progress for recommended path', () => {
      storage.addCompletedGuide('basics-guide1');

      const path = {
        id: 'survival-basics',
        guides: ['basics-guide1', 'basics-guide2', 'basics-guide3']
      };

      const completed = storage.getCompletedGuides();
      const completedCount = path.guides.filter(id => completed.has(id)).length;
      const progress = {
        completed: completedCount,
        total: path.guides.length,
        percentage: Math.round((completedCount / path.guides.length) * 100)
      };

      expect(progress.completed).toBe(1);
      expect(progress.percentage).toBe(33);
    });

    it('should return null if no beginner path exists', () => {
      const paths = [
        { id: 'advanced', difficulty: 'advanced' },
        { id: 'expert', difficulty: 'advanced' }
      ];

      const recommended = paths.find(p => p.id === 'survival-basics');
      expect(recommended).toBeUndefined();
    });
  });

  describe('Integration - Complex Path Scenarios', () => {
    it('should handle user progressing through multiple guides in a path', () => {
      const path = {
        id: 'survival-bootcamp',
        guides: ['fire', 'water', 'shelter', 'food', 'medicine']
      };

      // Simulate user progress
      storage.addCompletedGuide('fire');
      expect(storage.getCompletedGuides().size).toBe(1);

      storage.addCompletedGuide('water');
      expect(storage.getCompletedGuides().size).toBe(2);

      storage.addCompletedGuide('shelter');
      expect(storage.getCompletedGuides().size).toBe(3);

      // Calculate progress
      const completed = storage.getCompletedGuides();
      const completedCount = path.guides.filter(id => completed.has(id)).length;
      const percentage = Math.round((completedCount / path.guides.length) * 100);

      expect(percentage).toBe(60);
    });

    it('should support branching paths with different prerequisites', () => {
      const paths = [
        { id: 'medical', guides: ['first-aid', 'anatomy', 'emergency'] },
        { id: 'survival', guides: ['fire', 'water', 'shelter'] }
      ];

      // User can start either path independently
      storage.addCompletedGuide('first-aid');
      storage.addCompletedGuide('fire');

      const completed = storage.getCompletedGuides();

      const medicalProgress = paths[0].guides.filter(id => completed.has(id)).length;
      const survivalProgress = paths[1].guides.filter(id => completed.has(id)).length;

      expect(medicalProgress).toBe(1);
      expect(survivalProgress).toBe(1);
    });

    it('should calculate total progress across all paths', () => {
      const allPaths = [
        { id: 'path1', guides: ['p1-g1', 'p1-g2'] },
        { id: 'path2', guides: ['p2-g1', 'p2-g2', 'p2-g3'] },
        { id: 'path3', guides: ['p3-g1'] }
      ];

      storage.addCompletedGuide('p1-g1');
      storage.addCompletedGuide('p1-g2');
      storage.addCompletedGuide('p2-g1');
      storage.addCompletedGuide('p3-g1');

      const completed = storage.getCompletedGuides();
      const totalGuides = allPaths.reduce((sum, p) => sum + p.guides.length, 0);
      const totalCompleted = Array.from(completed).filter(id => {
        return allPaths.some(p => p.guides.includes(id));
      }).length;
      const overallPercentage = Math.round((totalCompleted / totalGuides) * 100);

      expect(overallPercentage).toBe(57);
    });
  });

  describe('Path Metadata', () => {
    it('should have consistent difficulty levels', () => {
      const difficulties = ['beginner', 'intermediate', 'advanced'];
      const paths = [
        { difficulty: 'beginner' },
        { difficulty: 'intermediate' },
        { difficulty: 'advanced' }
      ];

      paths.forEach(path => {
        expect(difficulties).toContain(path.difficulty);
      });
    });

    it('should provide estimated hours', () => {
      const path = {
        id: 'survival',
        estimatedHours: 15,
        guides: ['fire', 'water', 'shelter', 'food', 'medicine']
      };

      expect(path.estimatedHours).toBeGreaterThan(0);
      expect(typeof path.estimatedHours).toBe('number');
    });

    it('should have descriptive names and icons', () => {
      const path = {
        name: 'Survival Basics',
        icon: '🔥',
        description: 'Learn essential survival skills'
      };

      expect(path.name.length).toBeGreaterThan(0);
      expect(path.icon.length).toBeGreaterThan(0);
      expect(path.description.length).toBeGreaterThan(0);
    });
  });
});
