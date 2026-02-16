/**
 * Learning Paths Module
 * Manages structured learning tracks for users to follow
 */

import * as storage from './storage.js';

let learningPaths = [];
let guides = [];

/**
 * Fetch and initialize learning paths data
 */
async function fetchLearningPaths() {
  try {
    const response = await fetch('data/learning-paths.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    learningPaths = await response.json();
  } catch (error) {
    console.error('Failed to fetch learning paths:', error);
    return false;
  }
  return true;
}

/**
 * Fetch guides data to map IDs to titles and reading times
 */
async function fetchGuides() {
  try {
    const response = await fetch('data/guides.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    guides = await response.json();
  } catch (error) {
    console.error('Failed to fetch guides:', error);
    return false;
  }
  return true;
}

/**
 * Get guide information by ID
 * @param {string} guideId - The guide ID
 * @returns {Object|null} - Guide object or null if not found
 */
function getGuideInfo(guideId) {
  return guides.find(g => g.id === guideId) || null;
}

/**
 * Get progress for a specific learning path
 * @param {string} pathId - The learning path ID
 * @returns {Object} - Progress object with { completed, total, percentage }
 */
function getPathProgress(pathId) {
  const path = learningPaths.find(p => p.id === pathId);
  if (!path) return { completed: 0, total: 0, percentage: 0 };

  const completedGuides = storage.getCompletedGuides();
  const completed = path.guides.filter(id => completedGuides.has(id)).length;
  const total = path.guides.length;

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

/**
 * Get all learning paths with their progress
 * @returns {Array} - Array of learning paths with progress
 */
function getAllPathsWithProgress() {
  return learningPaths.map(path => ({
    ...path,
    progress: getPathProgress(path.id)
  }));
}

/**
 * Get the recommended starting path (Survival Basics for beginners)
 * @returns {Object} - Recommended path with progress
 */
function getRecommendedPath() {
  const basicPath = learningPaths.find(p => p.id === 'survival-basics');
  if (!basicPath) return null;

  return {
    ...basicPath,
    progress: getPathProgress('survival-basics')
  };
}

/**
 * Get guides for a specific learning path with their progress
 * @param {string} pathId - The learning path ID
 * @returns {Array} - Array of guide objects with progress info
 */
function getPathGuides(pathId) {
  const path = learningPaths.find(p => p.id === pathId);
  if (!path) return [];

  const completedGuides = storage.getCompletedGuides();

  return path.guides.map((guideId, index) => {
    const guide = getGuideInfo(guideId);
    return {
      ...guide,
      isCompleted: completedGuides.has(guideId),
      sequenceNumber: index + 1
    };
  });
}

/**
 * Create HTML for a learning path card
 * @param {Object} path - Learning path object
 * @returns {string} - HTML string
 */
function createPathCardHTML(path) {
  const progress = getPathProgress(path.id);
  const difficultyBadge = {
    beginner: '<span class="difficulty-badge difficulty-beginner">Beginner</span>',
    intermediate: '<span class="difficulty-badge difficulty-intermediate">Intermediate</span>',
    advanced: '<span class="difficulty-badge difficulty-advanced">Advanced</span>'
  };

  return `
    <div class="learning-path-card" data-path-id="${path.id}">
      <div class="path-header">
        <div class="path-icon-title">
          <span class="path-icon">${path.icon}</span>
          <h3 class="path-name">${path.name}</h3>
        </div>
        ${difficultyBadge[path.difficulty] || ''}
      </div>

      <p class="path-description">${path.description}</p>

      <div class="path-metadata">
        <span class="path-info">
          <span class="info-label">Guides:</span>
          <span class="info-value">${path.guides.length}</span>
        </span>
        <span class="path-info">
          <span class="info-label">Time:</span>
          <span class="info-value">~${path.estimatedHours}h</span>
        </span>
      </div>

      <div class="path-progress">
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: ${progress.percentage}%"></div>
        </div>
        <p class="progress-text">
          ${progress.completed} of ${progress.total} guides completed
          <span class="progress-percentage">${progress.percentage}%</span>
        </p>
      </div>

      <button class="btn-view-path" data-path-id="${path.id}">
        View Path →
      </button>
    </div>
  `;
}

/**
 * Create HTML for learning path details (expanded view)
 * @param {string} pathId - The learning path ID
 * @returns {string} - HTML string
 */
function createPathDetailsHTML(pathId) {
  const path = learningPaths.find(p => p.id === pathId);
  if (!path) return '<p>Path not found</p>';

  const guides = getPathGuides(pathId);
  const progress = getPathProgress(pathId);

  const guidesList = guides.map(guide => `
    <div class="path-guide-item ${guide.isCompleted ? 'completed' : ''}">
      <span class="guide-sequence">${guide.sequenceNumber}</span>
      <span class="guide-icon">${guide.icon || '📖'}</span>
      <div class="guide-info">
        <h4 class="guide-title">${guide.title}</h4>
        <p class="guide-meta">
          <span class="reading-time">${guide.readingTime}h</span>
          <span class="difficulty difficulty-${guide.difficulty}">${guide.difficulty}</span>
        </p>
      </div>
      ${guide.isCompleted ? '<span class="checkmark">✓</span>' : ''}
      <a href="${guide.url}" class="guide-link" data-guide-id="${guide.id}">Read →</a>
    </div>
  `).join('');

  return `
    <div class="path-details">
      <div class="details-header">
        <button class="btn-back" id="btn-back-to-paths">← Back to Paths</button>
        <h2>${path.icon} ${path.name}</h2>
      </div>

      <div class="details-info">
        <p>${path.description}</p>
        <div class="path-stats">
          <div class="stat">
            <span class="stat-label">Total Guides</span>
            <span class="stat-value">${path.guides.length}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Completed</span>
            <span class="stat-value">${progress.completed}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Est. Time</span>
            <span class="stat-value">~${path.estimatedHours}h</span>
          </div>
          <div class="stat">
            <span class="stat-label">Progress</span>
            <span class="stat-value">${progress.percentage}%</span>
          </div>
        </div>

        <div class="path-progress">
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${progress.percentage}%"></div>
          </div>
          <p class="progress-text">
            ${progress.completed} of ${progress.total} guides completed
          </p>
        </div>
      </div>

      <div class="guides-list">
        <h3>Learning Sequence</h3>
        ${guidesList}
      </div>
    </div>
  `;
}

/**
 * Render the learning paths section on the main page
 */
function renderLearningPathsSection() {
  let pathsContainer = document.getElementById('learning-paths-container');

  if (!pathsContainer) {
    const mainContent = document.querySelector('main') || document.body;
    pathsContainer = document.createElement('section');
    pathsContainer.id = 'learning-paths-container';
    pathsContainer.className = 'learning-paths-section';
    mainContent.insertBefore(pathsContainer, mainContent.firstChild);
  }

  const allPaths = getAllPathsWithProgress();
  const recommendedPath = getRecommendedPath();

  let html = `
    <div class="learning-paths-wrapper">
      <h2 class="section-title">Learning Paths</h2>
      <p class="section-subtitle">Choose a structured path to build your survival and self-sufficiency skills</p>
  `;

  // Add "Start Here" recommendation if user is new
  if (recommendedPath) {
    html += `
      <div class="start-here-recommendation">
        <div class="recommendation-badge">Recommended for Beginners</div>
        <h3 class="recommendation-title">
          <span class="icon">👋</span>
          Start Here: ${recommendedPath.name}
        </h3>
        <p class="recommendation-description">${recommendedPath.description}</p>
        <button class="btn-start-path" data-path-id="${recommendedPath.id}">
          Start ${recommendedPath.name} →
        </button>
      </div>
    `;
  }

  // Add all learning path cards
  html += '<div class="learning-paths-grid">';
  allPaths.forEach(path => {
    html += createPathCardHTML(path);
  });
  html += '</div></div>';

  pathsContainer.innerHTML = html;

  // Add event listeners
  attachEventListeners();
}

/**
 * Show learning path details
 * @param {string} pathId - The learning path ID
 */
function showPathDetails(pathId) {
  let detailsContainer = document.getElementById('learning-path-details');

  if (!detailsContainer) {
    detailsContainer = document.createElement('div');
    detailsContainer.id = 'learning-path-details';
    detailsContainer.className = 'learning-path-details-container';
    document.body.appendChild(detailsContainer);
  }

  detailsContainer.innerHTML = createPathDetailsHTML(pathId);
  detailsContainer.classList.add('active');

  // Hide learning paths section
  const pathsContainer = document.getElementById('learning-paths-container');
  if (pathsContainer) {
    pathsContainer.style.display = 'none';
  }

  // Attach back button listener
  const backBtn = document.getElementById('btn-back-to-paths');
  if (backBtn) {
    backBtn.addEventListener('click', hidePathDetails);
  }

  // Attach guide link listeners
  const guideLinks = detailsContainer.querySelectorAll('.guide-link');
  guideLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const guideId = link.dataset.guideId;
      if (guideId) {
        storage.addCompletedGuide(guideId);
        // Update the path details view to reflect new completion status
        renderLearningPathsSection();
        showPathDetails(pathId);
      }
    });
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Hide learning path details and show paths list again
 */
function hidePathDetails() {
  const detailsContainer = document.getElementById('learning-path-details');
  if (detailsContainer) {
    detailsContainer.classList.remove('active');
  }

  const pathsContainer = document.getElementById('learning-paths-container');
  if (pathsContainer) {
    pathsContainer.style.display = '';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Attach event listeners to path cards and buttons
 */
function attachEventListeners() {
  // View path buttons
  document.querySelectorAll('.btn-view-path').forEach(btn => {
    btn.addEventListener('click', () => {
      const pathId = btn.dataset.pathId;
      if (pathId) showPathDetails(pathId);
    });
  });

  // Start path buttons
  document.querySelectorAll('.btn-start-path').forEach(btn => {
    btn.addEventListener('click', () => {
      const pathId = btn.dataset.pathId;
      if (pathId) showPathDetails(pathId);
    });
  });

  // Path card click
  document.querySelectorAll('.learning-path-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking the button directly
      if (e.target.tagName !== 'BUTTON') {
        const pathId = card.dataset.pathId;
        if (pathId) showPathDetails(pathId);
      }
    });
  });
}

/**
 * Initialize the learning paths module
 */
async function init() {
  try {
    const pathsLoaded = await fetchLearningPaths();
    const guidesLoaded = await fetchGuides();

    if (!pathsLoaded || !guidesLoaded) {
      console.error('Failed to initialize learning paths');
      return false;
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderLearningPathsSection);
    } else {
      renderLearningPathsSection();
    }

    console.log('Learning Paths module initialized');
    return true;
  } catch (error) {
    console.error('Error initializing learning paths:', error);
    return false;
  }
}

// Export public API
export {
  init,
  getAllPathsWithProgress,
  getPathProgress,
  getRecommendedPath,
  getPathGuides,
  showPathDetails,
  hidePathDetails,
  renderLearningPathsSection
};
