/**
 * Progression Module - Unified progression system
 * Connects reading order, prerequisites, learning paths, and progress tracking
 * Provides "what's next" recommendations and prerequisite visualization
 */

import * as storage from './storage.js';

let _prerequisiteMap = null;
let _readingOrder = null;
let _guidesData = null;

/**
 * Initialize the progression module by loading data files
 */
export async function init() {
  try {
    const [prereqRes, orderRes, guidesRes] = await Promise.all([
      fetch('data/prerequisite-map.json'),
      fetch('data/reading-order.json'),
      fetch('data/guides.json')
    ]);
    _prerequisiteMap = await prereqRes.json();
    _readingOrder = await orderRes.json();
    _guidesData = await guidesRes.json();

    // Migrate reading-order-progress into compendium-progress if needed
    migrateReadingOrderProgress();

    return true;
  } catch (error) {
    console.error('Failed to initialize progression module:', error);
    return false;
  }
}

/**
 * Migrate reading-order-progress data into compendium-progress (unify storage)
 */
function migrateReadingOrderProgress() {
  const oldProgress = localStorage.getItem('reading-order-progress');
  if (!oldProgress) return;

  try {
    const oldData = JSON.parse(oldProgress);
    const currentProgress = storage.getProgress();
    let migrated = false;

    // Map reading-order filenames to guide IDs
    const fileToId = {};
    if (_guidesData) {
      for (const guide of _guidesData) {
        const filename = guide.file || guide.url;
        if (filename) {
          // Extract just the filename from paths like "guides/survival-basics.html"
          const name = filename.split('/').pop();
          fileToId[name] = guide.id;
        }
      }
    }

    for (const [file, data] of Object.entries(oldData)) {
      if (data && data.read) {
        const guideId = fileToId[file];
        if (guideId && !currentProgress[guideId]?.completed) {
          currentProgress[guideId] = {
            completed: true,
            lastUpdated: data.date || new Date().toISOString(),
            migratedFrom: 'reading-order'
          };
          migrated = true;
        }
      }
    }

    if (migrated) {
      storage.setProgress(currentProgress);
    }

    // Keep old data as backup but mark as migrated
    localStorage.setItem('reading-order-progress-migrated', 'true');
  } catch (e) {
    console.error('Failed to migrate reading-order-progress:', e);
  }
}

/**
 * Get the current user's phase (earliest phase with incomplete essential guides)
 * @returns {number} Phase number (0-5)
 */
export function getCurrentPhase() {
  if (!_readingOrder) return 0;
  const completed = storage.getCompletedGuides();
  const fileToId = _getFileToIdMap();

  for (const phase of _readingOrder.phases) {
    const essentials = phase.tiers.essential;
    const allEssentialsDone = essentials.every(g => {
      const id = fileToId[g.file];
      return id && completed.has(id);
    });
    if (!allEssentialsDone) return phase.number;
  }
  return 5; // All phases complete
}

/**
 * Get "what's next" recommendations based on current progress
 * Returns guides that are ready to read (all prerequisites met)
 * prioritized by reading order phase and tier
 * @param {number} limit - Max recommendations to return
 * @returns {Array} Recommended guides with metadata
 */
export function getNextRecommendations(limit = 5) {
  if (!_prerequisiteMap || !_guidesData) return [];

  const completed = storage.getCompletedGuides();
  const recommendations = [];

  // 1. First, find guides whose prerequisites are ALL met but guide is unread
  const readyToRead = _guidesData.filter(guide => {
    if (completed.has(guide.id)) return false;

    // If guide has prerequisites, check they're all met
    if (guide.prerequisites && guide.prerequisites.length > 0) {
      return guide.prerequisites.every(prereqId => completed.has(prereqId));
    }
    return true; // No prerequisites = always ready
  });

  // 2. Score each guide by priority
  const currentPhase = getCurrentPhase();
  const phaseAlignments = _readingOrder?.phaseAlignments || {};

  for (const guide of readyToRead) {
    const filename = (guide.file || guide.url || '').split('/').pop();
    const alignment = phaseAlignments[filename];

    let score = 0;

    // Prefer guides in the current phase
    if (alignment) {
      const phaseDiff = Math.abs(alignment.phase - currentPhase);
      score += (6 - phaseDiff) * 100; // Closer phases score higher

      // Prefer essential > recommended > supplementary
      if (alignment.tier === 'essential') score += 30;
      else if (alignment.tier === 'recommended') score += 20;
      else score += 10;
    }

    // Prefer gateway guides (guides that unlock others)
    const unlocks = _prerequisiteMap.unlocks[guide.id];
    if (unlocks && unlocks.length > 0) {
      score += unlocks.length * 15;
    }

    // Prefer guides that just had a prerequisite completed (recently unlocked)
    if (guide.prerequisites && guide.prerequisites.length > 0) {
      score += 50; // Bonus for newly unlocked guides
    }

    recommendations.push({
      id: guide.id,
      title: guide.title,
      icon: guide.icon || '📖',
      description: guide.description,
      url: guide.url,
      difficulty: guide.difficulty,
      category: guide.category,
      readingTime: guide.readingTime,
      score,
      phase: alignment?.phase,
      tier: alignment?.tier,
      unlocksCount: unlocks ? unlocks.length : 0,
      prerequisites: guide.prerequisites || [],
      prerequisitesMet: true
    });
  }

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations.slice(0, limit);
}

/**
 * Get guides that were just unlocked (prerequisites completed in last session)
 * @returns {Array} Newly unlocked guides
 */
export function getNewlyUnlockedGuides() {
  if (!_prerequisiteMap || !_guidesData) return [];

  const completed = storage.getCompletedGuides();
  const progress = storage.getProgress();
  const unlocked = [];

  // Find guides whose prerequisites are all met but guide isn't read
  for (const [guideId, dep] of Object.entries(_prerequisiteMap.dependencies)) {
    if (completed.has(guideId)) continue; // Already read

    const allPrereqsMet = dep.requires.every(prereqId => completed.has(prereqId));
    if (!allPrereqsMet) continue;

    // Check if at least one prerequisite was completed recently (within 7 days)
    const recentlyCompleted = dep.requires.some(prereqId => {
      const p = progress[prereqId];
      if (!p || !p.lastUpdated) return false;
      const daysSince = (Date.now() - new Date(p.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    });

    if (recentlyCompleted) {
      const guide = _guidesData.find(g => g.id === guideId);
      if (guide) {
        unlocked.push({
          id: guide.id,
          title: guide.title,
          icon: guide.icon || '📖',
          description: guide.description,
          url: guide.url,
          difficulty: guide.difficulty,
          unlocksCount: (_prerequisiteMap.unlocks[guide.id] || []).length
        });
      }
    }
  }

  return unlocked;
}

/**
 * Get what completing a specific guide will unlock
 * @param {string} guideId - The guide ID
 * @returns {Array} Guides that will become available
 */
export function getWillUnlock(guideId) {
  if (!_prerequisiteMap) return [];

  const unlocksList = _prerequisiteMap.unlocks[guideId] || [];
  const completed = storage.getCompletedGuides();
  const result = [];

  for (const unlock of unlocksList) {
    // Check if this guide's OTHER prerequisites are also met
    const dep = _prerequisiteMap.dependencies[unlock.id];
    if (!dep) continue;

    const otherPrereqsMet = dep.requires.every(req =>
      req === guideId || completed.has(req)
    );

    result.push({
      ...unlock,
      ready: otherPrereqsMet,
      remainingPrereqs: dep.requires.filter(req => req !== guideId && !completed.has(req))
    });
  }

  return result;
}

/**
 * Get prerequisite status for a guide
 * @param {string} guideId - The guide ID
 * @returns {Object} { met: boolean, prerequisites: [{id, title, icon, completed}], unlocksAfter: [{id, title}] }
 */
export function getPrerequisiteStatus(guideId) {
  if (!_prerequisiteMap || !_guidesData) {
    return { met: true, prerequisites: [], unlocksAfter: [] };
  }

  const completed = storage.getCompletedGuides();
  const dep = _prerequisiteMap.dependencies[guideId];
  const prerequisites = [];

  if (dep) {
    for (const reqId of dep.requires) {
      const guide = _guidesData.find(g => g.id === reqId);
      prerequisites.push({
        id: reqId,
        title: guide?.title || reqId,
        icon: guide?.icon || '📖',
        url: guide?.url,
        completed: completed.has(reqId)
      });
    }
  }

  const met = prerequisites.length === 0 || prerequisites.every(p => p.completed);

  return {
    met,
    prerequisites,
    unlocksAfter: getWillUnlock(guideId)
  };
}

/**
 * Get guides that need review (completed more than N days ago)
 * @param {number} daysSince - Days since completion to trigger review
 * @param {number} limit - Max results
 * @returns {Array} Guides needing review
 */
export function getGuidesNeedingReview(daysSince = 30, limit = 5) {
  const progress = storage.getProgress();
  const now = Date.now();
  const needsReview = [];

  for (const [guideId, data] of Object.entries(progress)) {
    if (!data.completed || !data.lastUpdated) continue;

    const days = (now - new Date(data.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
    if (days >= daysSince) {
      const guide = _guidesData?.find(g => g.id === guideId);
      if (guide) {
        needsReview.push({
          id: guide.id,
          title: guide.title,
          icon: guide.icon || '📖',
          url: guide.url,
          category: guide.category,
          daysSinceRead: Math.round(days),
          lastRead: data.lastUpdated
        });
      }
    }
  }

  // Sort by oldest first
  needsReview.sort((a, b) => b.daysSinceRead - a.daysSinceRead);
  return needsReview.slice(0, limit);
}

/**
 * Get gateway guides (high-impact guides that unlock many others)
 * @returns {Array} Gateway guides sorted by impact
 */
export function getGatewayGuides() {
  if (!_prerequisiteMap) return [];

  const completed = storage.getCompletedGuides();
  return (_prerequisiteMap.gatewayGuides || [])
    .map(g => ({
      ...g,
      completed: completed.has(g.id),
      readyUnlocks: ((_prerequisiteMap.unlocks[g.id] || [])
        .filter(u => !completed.has(u.id))).length
    }))
    .filter(g => !g.completed) // Only show unread gateways
    .sort((a, b) => b.readyUnlocks - a.readyUnlocks);
}

/**
 * Get phase progress summary with category breakdown
 * @returns {Array} Phase progress objects
 */
export function getPhaseProgress() {
  if (!_readingOrder) return [];

  const completed = storage.getCompletedGuides();
  const fileToId = _getFileToIdMap();

  return _readingOrder.phases.map(phase => {
    const tiers = {};
    let totalGuides = 0;
    let completedGuides = 0;

    for (const [tierName, guides] of Object.entries(phase.tiers)) {
      let tierTotal = 0;
      let tierDone = 0;
      for (const guide of guides) {
        tierTotal++;
        totalGuides++;
        const guideId = fileToId[guide.file];
        if (guideId && completed.has(guideId)) {
          tierDone++;
          completedGuides++;
        }
      }
      tiers[tierName] = { total: tierTotal, completed: tierDone, percent: tierTotal > 0 ? Math.round((tierDone / tierTotal) * 100) : 0 };
    }

    return {
      number: phase.number,
      name: phase.name,
      timeframe: phase.timeframe,
      goal: phase.goal,
      summary: phase.summary,
      totalGuides,
      completedGuides,
      percent: totalGuides > 0 ? Math.round((completedGuides / totalGuides) * 100) : 0,
      tiers,
      criticalActions: phase.criticalActions,
      outcomes: phase.outcomes
    };
  });
}

/**
 * Get the full dependency chain for a guide
 * @param {string} guideId - Guide ID
 * @returns {Object} { chain: [guide objects in order], depth: number }
 */
export function getDependencyChain(guideId) {
  if (!_prerequisiteMap) return { chain: [], depth: 0 };

  const chain = [];
  const visited = new Set();

  function walkBack(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const dep = _prerequisiteMap.dependencies[id];
    if (dep) {
      for (const reqId of dep.requires) {
        walkBack(reqId);
      }
    }
    const guide = _guidesData?.find(g => g.id === id);
    chain.push({
      id,
      title: guide?.title || id,
      icon: guide?.icon || '📖',
      completed: storage.getCompletedGuides().has(id)
    });
  }

  walkBack(guideId);
  return { chain, depth: chain.length - 1 };
}

/**
 * Get the forward unlock chain from a guide
 * @param {string} guideId - Guide ID
 * @returns {Array} Tree of unlockable guides
 */
export function getUnlockTree(guideId) {
  if (!_prerequisiteMap) return [];

  const completed = storage.getCompletedGuides();
  const visited = new Set();

  function walkForward(id, depth = 0) {
    if (visited.has(id) || depth > 5) return null;
    visited.add(id);

    const unlocks = _prerequisiteMap.unlocks[id] || [];
    const children = unlocks
      .map(u => {
        const child = walkForward(u.id, depth + 1);
        return child || { ...u, completed: completed.has(u.id), children: [] };
      });

    return {
      id,
      title: _guidesData?.find(g => g.id === id)?.title || id,
      icon: _guidesData?.find(g => g.id === id)?.icon || '📖',
      completed: completed.has(id),
      children
    };
  }

  const result = walkForward(guideId);
  return result ? result.children : [];
}

// --- Private helpers ---

function _getFileToIdMap() {
  if (!_guidesData) return {};
  const map = {};
  for (const guide of _guidesData) {
    const filename = (guide.file || guide.url || '').split('/').pop();
    if (filename) map[filename] = guide.id;
  }
  return map;
}
