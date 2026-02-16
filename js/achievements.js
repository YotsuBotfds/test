/**
 * Achievements Module - Achievement system with definitions and tracking
 * Enhanced with progress milestones, category-specific achievements, and streak tracking
 */

import * as storage from './storage.js';

const achievementDefs = {
  // Milestone Achievements - Reading count
  'first-read': { name: 'First Steps', icon: '🎓', desc: 'Read your first guide', category: 'milestone' },
  'student': { name: 'Student', icon: '📚', desc: 'Read 10 guides', category: 'milestone' },
  'student-25': { name: 'Eager Learner', icon: '📖', desc: 'Read 25 guides', category: 'milestone' },
  'student-75': { name: 'Knowledge Seeker', icon: '📕', desc: 'Read 75 guides', category: 'milestone' },
  'student-150': { name: 'Wisdom Collector', icon: '📚', desc: 'Read 150 guides', category: 'milestone' },
  'scholar': { name: 'Scholar', icon: '🎓', desc: 'Read 50 guides', category: 'milestone' },
  'master': { name: 'Master', icon: '👨‍🏫', desc: 'Read 100 guides', category: 'milestone' },
  'completionist': { name: 'Completionist', icon: '🏆', desc: 'Read all guides', category: 'milestone' },

  // Category-Specific Achievements
  'survivor': { name: 'Survivor', icon: '💪', desc: 'Complete all Critical guides', category: 'category' },
  'rebuilder': { name: 'Rebuilder', icon: '🏗️', desc: 'Complete all Rebuild Civilization guides', category: 'category' },
  'medic': { name: 'Field Medic', icon: '⚕️', desc: 'Complete all medical guides', category: 'category' },
  'smith': { name: 'Blacksmith', icon: '⚒️', desc: 'Complete all crafts & manufacturing guides', category: 'category' },
  'engineer': { name: 'Engineer', icon: '⚙️', desc: 'Complete all building & engineering guides', category: 'category' },
  'farmer': { name: 'Farmer', icon: '🌾', desc: 'Complete all agriculture & food guides', category: 'category' },
  'comms-expert': { name: 'Communications Expert', icon: '📡', desc: 'Complete all communications guides', category: 'category' },
  'scientist': { name: 'Scientist', icon: '🔬', desc: 'Complete all science guides', category: 'category' },
  'defender': { name: 'Defender', icon: '🛡️', desc: 'Complete all security & defense guides', category: 'category' },
  'explorer': { name: 'Explorer', icon: '🗺️', desc: 'Read from 5 different categories', category: 'special' },

  // Streak & Activity Achievements
  'early-bird': { name: 'Early Bird', icon: '🌅', desc: 'Read 3 guides in one day', category: 'special' },
  'dedicated': { name: 'Dedicated', icon: '🔥', desc: 'Read guides for 7 consecutive days', category: 'special' },
  'week-warrior': { name: 'Week Warrior', icon: '⚡', desc: 'Read guides for 14 consecutive days', category: 'special' },
  'month-master': { name: 'Month Master', icon: '💫', desc: 'Read guides for 30 consecutive days', category: 'special' },

  // Content Creation
  'note-taker': { name: 'Scribe', icon: '📝', desc: 'Write notes on 10 guides', category: 'content' },
  'journalist': { name: 'Journalist', icon: '📄', desc: 'Write notes on 25 guides', category: 'content' }
};

/**
 * Track a reading session for streak purposes
 * @param {string} guideId - The guide being read
 */
export function trackReadingSession(guideId) {
  const today = new Date().toDateString();
  const readingDates = storage.get('achievement-reading-dates', {});

  if (!readingDates[today]) {
    readingDates[today] = [];
  }

  // Add guide if not already read today
  if (!readingDates[today].includes(guideId)) {
    readingDates[today].push(guideId);
    storage.set('achievement-reading-dates', readingDates);

    // Check for daily achievements
    checkDailyAchievements(readingDates);
  }
}

/**
 * Check for daily reading achievements
 * @param {Object} readingDates - Object with dates as keys and guide arrays as values
 */
function checkDailyAchievements(readingDates) {
  const unlockedBefore = storage.getAchievements();
  const unlockedNow = {};
  Object.assign(unlockedNow, unlockedBefore);

  function unlock(id) {
    if (!unlockedNow[id] && achievementDefs[id]) {
      unlockedNow[id] = { unlockedAt: Date.now() };
      showAchievementToast(id, achievementDefs[id]);
      storage.setAchievements(unlockedNow);
    }
  }

  // Get today's date
  const today = new Date().toDateString();
  const guidesTodayCount = readingDates[today] ? readingDates[today].length : 0;

  // Check for Early Bird (3 guides in one day)
  if (guidesTodayCount >= 3) {
    unlock('early-bird');
  }

  // Check for streaks
  updateStreakAchievements(readingDates);
}

/**
 * Update streak achievements
 * @param {Object} readingDates - Object with dates as keys and guide arrays as values
 */
function updateStreakAchievements(readingDates) {
  const unlockedBefore = storage.getAchievements();
  const unlockedNow = {};
  Object.assign(unlockedNow, unlockedBefore);

  function unlock(id) {
    if (!unlockedNow[id] && achievementDefs[id]) {
      unlockedNow[id] = { unlockedAt: Date.now() };
      showAchievementToast(id, achievementDefs[id]);
      storage.setAchievements(unlockedNow);
    }
  }

  const currentStreak = calculateCurrentStreak(readingDates);
  storage.set('current-reading-streak', currentStreak);

  if (currentStreak >= 7) unlock('dedicated');
  if (currentStreak >= 14) unlock('week-warrior');
  if (currentStreak >= 30) unlock('month-master');
}

/**
 * Calculate the current reading streak
 * @param {Object} readingDates - Object with dates as keys
 * @returns {number} Current streak length in days
 */
function calculateCurrentStreak(readingDates) {
  const dates = Object.keys(readingDates).map(d => new Date(d)).sort((a, b) => b - a);

  if (dates.length === 0) return 0;

  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  // Check if most recent reading was today or yesterday
  // If not read today, allow streak to start from yesterday
  const mostRecent = new Date(dates[0]);
  mostRecent.setHours(0, 0, 0, 0);
  const daysSinceLastRead = Math.floor((currentDate - mostRecent) / (1000 * 60 * 60 * 24));

  // Streak is broken if last read was more than 1 day ago
  if (daysSinceLastRead > 1) return 0;

  // Start counting from the most recent read date
  const startOffset = daysSinceLastRead; // 0 if today, 1 if yesterday

  for (let date of dates) {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((currentDate - checkDate) / (1000 * 60 * 60 * 24));

    if (diffDays === streak + startOffset) {
      streak++;
    } else if (diffDays > streak + startOffset) {
      break;
    }
    // If diffDays < streak + startOffset, it's a duplicate date entry, skip it
  }

  return streak;
}

/**
 * Get the current reading streak
 * @returns {number} Current streak length
 */
export function getCurrentStreak() {
  return storage.get('current-reading-streak', 0);
}

/**
 * Check and unlock achievements based on current progress
 * @param {NodeList} cards - Card elements from DOM
 */
export function checkAchievements(cards) {
  const unlockedBefore = storage.getAchievements();
  const unlockedNow = {};
  Object.assign(unlockedNow, unlockedBefore);

  const progress = storage.getProgress();

  let readCount = 0;
  let criticalCount = 0;
  let criticalTotal = 0;
  let rebuildCount = 0;
  let rebuildTotal = 0;
  let medicalCount = 0;
  let medicalTotal = 0;
  let craftsCount = 0;
  let craftsTotal = 0;
  let buildingCount = 0;
  let buildingTotal = 0;
  let foodCount = 0;
  let foodTotal = 0;
  let commsCount = 0;
  let commsTotal = 0;
  let scienceCount = 0;
  let scienceTotal = 0;
  let securityCount = 0;
  let securityTotal = 0;
  let noteCount = 0;
  const categoriesRead = new Set();

  // Count various achievements
  cards.forEach(card => {
    const guideId = card.getAttribute('data-guide');
    const isCompleted = progress[guideId]?.completed;
    const tags = (card.getAttribute('data-tags') || '').split(' ');
    const category = card.getAttribute('data-category') || '';
    const hasNotes = !!storage.getNotes(guideId);

    if (isCompleted) {
      readCount++;
      // Track which categories have been read (use actual category, not tags)
      if (category) categoriesRead.add(category);
    }
    if (hasNotes) noteCount++;

    // Tag-based counts (critical/rebuild are tags, not categories)
    if (tags.includes('critical')) {
      criticalTotal++;
      if (isCompleted) criticalCount++;
    }
    if (tags.includes('rebuild')) {
      rebuildTotal++;
      if (isCompleted) rebuildCount++;
    }

    // Category-based counts (use data-category attribute)
    if (category === 'medical') {
      medicalTotal++;
      if (isCompleted) medicalCount++;
    }
    if (category === 'crafts' || category === 'metalworking') {
      craftsTotal++;
      if (isCompleted) craftsCount++;
    }
    if (category === 'building') {
      buildingTotal++;
      if (isCompleted) buildingCount++;
    }
    if (category === 'agriculture') {
      foodTotal++;
      if (isCompleted) foodCount++;
    }
    if (category === 'communications') {
      commsTotal++;
      if (isCompleted) commsCount++;
    }
    if (category === 'sciences') {
      scienceTotal++;
      if (isCompleted) scienceCount++;
    }
    if (category === 'defense') {
      securityTotal++;
      if (isCompleted) securityCount++;
    }
  });

  // Helper to unlock achievements
  function unlock(id) {
    if (!unlockedNow[id] && achievementDefs[id]) {
      unlockedNow[id] = { unlockedAt: Date.now() };
      showAchievementToast(id, achievementDefs[id]);
    }
  }

  // Check count-based milestone achievements
  if (readCount >= 1) unlock('first-read');
  if (readCount >= 10) unlock('student');
  if (readCount >= 25) unlock('student-25');
  if (readCount >= 50) unlock('scholar');
  if (readCount >= 75) unlock('student-75');
  if (readCount >= 100) unlock('master');
  if (readCount >= 150) unlock('student-150');
  if (readCount >= cards.length) unlock('completionist');

  // Check category-based achievements
  if (criticalCount === criticalTotal && criticalTotal > 0) unlock('survivor');
  if (rebuildCount === rebuildTotal && rebuildTotal > 0) unlock('rebuilder');
  if (medicalCount === medicalTotal && medicalTotal > 0) unlock('medic');
  if (craftsCount === craftsTotal && craftsTotal > 0) unlock('smith');
  if (buildingCount === buildingTotal && buildingTotal > 0) unlock('engineer');
  if (foodCount === foodTotal && foodTotal > 0) unlock('farmer');
  if (commsCount === commsTotal && commsTotal > 0) unlock('comms-expert');
  if (scienceCount === scienceTotal && scienceTotal > 0) unlock('scientist');
  if (securityCount === securityTotal && securityTotal > 0) unlock('defender');

  // Check special achievements
  if (categoriesRead.size >= 5) unlock('explorer');
  if (noteCount >= 10) unlock('note-taker');
  if (noteCount >= 25) unlock('journalist');

  // Update achievements in storage
  storage.setAchievements(unlockedNow);

  // Update achievements button
  updateAchievementButton(unlockedNow);
}

/**
 * Update the achievements button with counts
 * @param {Object} unlocked - Unlocked achievements object
 */
function updateAchievementButton(unlocked) {
  const unlockedCount = Object.keys(unlocked).length;
  const achievementCount = document.getElementById('achievement-count');
  const achievementTotal = document.getElementById('achievement-total');
  if (achievementCount) achievementCount.textContent = unlockedCount;
  if (achievementTotal) achievementTotal.textContent = Object.keys(achievementDefs).length;
}

/**
 * Show achievement toast notification
 * @param {string} id - Achievement ID
 * @param {Object} def - Achievement definition
 */
function showAchievementToast(id, def) {
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.innerHTML = `<span class="icon">${def.icon}</span><span class="text"><span class="title">🎉 ${def.name}</span><span class="desc">${def.desc}</span></span>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Get all achievement definitions
 * @returns {Object} Achievement definitions
 */
export function getAchievementDefs() {
  return achievementDefs;
}

/**
 * Show achievements modal
 */
export function showAchievementsModal() {
  const unlocked = storage.getAchievements();
  const grid = document.getElementById('achievements-grid');
  if (!grid) return;

  grid.innerHTML = '';

  Object.entries(achievementDefs).forEach(([id, def]) => {
    const item = document.createElement('div');
    item.className = 'achievement-item';
    if (unlocked[id]) item.classList.add('unlocked');

    const progress = getAchievementProgress(id);
    let progressHTML = '';
    if (progress && progress.current < progress.target) {
      progressHTML = `<div class="achievement-progress"><div class="progress-bar"><div class="progress-fill" style="width: ${(progress.current / progress.target) * 100}%"></div></div><div class="progress-text">${progress.current}/${progress.target}</div></div>`;
    }

    item.innerHTML = `<span class="icon">${def.icon}</span><div class="name">${def.name}</div><div class="desc">${def.desc}</div>${progressHTML}`;
    grid.appendChild(item);
  });

  const modal = document.getElementById('achievements-modal');
  if (modal) {
    modal.classList.add('active');
    trapFocusInModal(modal);
    const closeBtn = modal.querySelector(".achievements-close");
    if (closeBtn) closeBtn.focus();
  }
}

/**
 * Get progress towards an achievement
 * @param {string} achievementId - The achievement ID
 * @returns {Object|null} Progress object with current and target, or null
 */
function getAchievementProgress(achievementId) {
  const progress = storage.getProgress();
  const cards = document.querySelectorAll('[data-guide]');
  let current = 0;
  let target = 0;

  switch (achievementId) {
    case 'student':
      current = Object.values(progress).filter(p => p.completed).length;
      target = 10;
      break;
    case 'student-25':
      current = Object.values(progress).filter(p => p.completed).length;
      target = 25;
      break;
    case 'student-75':
      current = Object.values(progress).filter(p => p.completed).length;
      target = 75;
      break;
    case 'student-150':
      current = Object.values(progress).filter(p => p.completed).length;
      target = 150;
      break;
    case 'scholar':
      current = Object.values(progress).filter(p => p.completed).length;
      target = 50;
      break;
    case 'master':
      current = Object.values(progress).filter(p => p.completed).length;
      target = 100;
      break;
    case 'note-taker':
      current = Object.keys(progress).filter(guideId => !!storage.getNotes(guideId)).length;
      target = 10;
      break;
    case 'journalist':
      current = Object.keys(progress).filter(guideId => !!storage.getNotes(guideId)).length;
      target = 25;
      break;
    case 'explorer':
      const categories = new Set();
      cards.forEach(card => {
        const category = card.getAttribute('data-category') || '';
        const guideId = card.getAttribute('data-guide');
        if (progress[guideId]?.completed && category) {
          categories.add(category);
        }
      });
      current = categories.size;
      target = 5;
      break;
    case 'dedicated':
      current = getCurrentStreak();
      target = 7;
      break;
    case 'week-warrior':
      current = getCurrentStreak();
      target = 14;
      break;
    case 'month-master':
      current = getCurrentStreak();
      target = 30;
      break;
    default:
      return null;
  }

  return current < target ? { current, target } : null;
}

/**
 * Close achievements modal
 */
export function closeAchievementsModal() {
  const modal = document.getElementById('achievements-modal');
  if (modal) {
    modal.classList.remove('active');
    const trigger = document.querySelector('.achievements-modal-trigger');
    if (trigger) setTimeout(() => trigger.focus(), 100);
  }
}

/**
 * Get focusable elements in a container
 * @param {Element} container - The container element
 * @returns {Array<Element>} Array of focusable elements
 */
function getFocusableElements(container) {
  const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(focusableSelectors)).filter(el => {
    return !el.hasAttribute('disabled') && el.offsetParent !== null;
  });
}

/**
 * Trap focus within a modal
 * @param {Element} modal - The modal element
 */
function trapFocusInModal(modal) {
  const focusableElements = getFocusableElements(modal);
  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAchievementsModal();
      return;
    }

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  });
}
