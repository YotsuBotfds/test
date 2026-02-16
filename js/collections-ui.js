/**
 * Collections UI Module - Renders and manages the collections section
 */

import * as collections from './collections.js';
import * as storage from './storage.js';
import { escapeHtml } from './utils.js';

const COLLECTIONS_CONTAINER_ID = 'collections-container';

/**
 * Initialize collections UI
 */
export function init() {
  // Create and insert collections section if it doesn't exist
  let container = document.getElementById(COLLECTIONS_CONTAINER_ID);
  if (!container) {
    container = createCollectionsSection();
    insertCollectionsSection(container);
  }

  renderCollections();

  // Listen for collection updates
  window.addEventListener('collectionsUpdated', renderCollections);
}

/**
 * Create the collections section element
 * @returns {HTMLElement}
 */
function createCollectionsSection() {
  const container = document.createElement('div');
  container.id = COLLECTIONS_CONTAINER_ID;
  container.className = 'collections-section';
  return container;
}

/**
 * Insert collections section into the page
 * @param {HTMLElement} container
 */
function insertCollectionsSection(container) {
  const mainContent = document.querySelector('main');
  if (!mainContent) return;

  // Find the guides container
  const guidesContainer = document.getElementById('guides-container');
  if (guidesContainer) {
    guidesContainer.parentNode.insertBefore(container, guidesContainer);
  } else {
    mainContent.insertBefore(container, mainContent.lastChild);
  }
}

/**
 * Render all collections
 */
function renderCollections() {
  const container = document.getElementById(COLLECTIONS_CONTAINER_ID);
  if (!container) return;

  const collectionsList = collections.getCollectionsSorted();

  // Clear container
  container.innerHTML = '';

  if (collectionsList.length === 0) {
    // Show empty state
    const empty = document.createElement('div');
    empty.className = 'collections-empty';
    empty.innerHTML = `
      <p>No collections yet. Create one by clicking 📌 on any guide to get started!</p>
    `;
    container.appendChild(empty);
    return;
  }

  // Create header
  const header = document.createElement('div');
  header.className = 'collections-header';
  header.innerHTML = '<h2>📚 My Collections</h2>';
  container.appendChild(header);

  // Create collections grid
  const grid = document.createElement('div');
  grid.className = 'collections-grid';

  collectionsList.forEach(col => {
    const card = createCollectionCard(col);
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

/**
 * Create a single collection card
 * @param {Object} collection
 * @returns {HTMLElement}
 */
function createCollectionCard(collection) {
  const card = document.createElement('div');
  card.className = 'collection-card';
  card.setAttribute('data-collection-id', collection.id);

  const progress = collections.getCollectionProgress(collection.id);
  const progressPercent = progress.total > 0 ? Math.round((progress.read / progress.total) * 100) : 0;

  let actionsHtml = '';
  if (progress.total > 0) {
    actionsHtml = `
      <div class="collection-actions">
        <button class="view-collection-btn" data-collection-id="${collection.id}" title="View collection">📖 View</button>
        <button class="edit-collection-btn" data-collection-id="${collection.id}" title="Edit collection">✏️</button>
        <button class="delete-collection-btn" data-collection-id="${collection.id}" title="Delete collection">🗑️</button>
      </div>
    `;
  } else {
    actionsHtml = `
      <div class="collection-actions">
        <button class="delete-collection-btn" data-collection-id="${collection.id}" title="Delete collection">🗑️ Delete</button>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="collection-header">
      <span class="collection-icon">${collection.icon}</span>
      <h3 class="collection-name">${escapeHtml(collection.name)}</h3>
    </div>
    <div class="collection-progress">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>
      <div class="progress-text">${progress.read}/${progress.total} guides read</div>
    </div>
    ${actionsHtml}
  `;

  // Add event listeners
  const viewBtn = card.querySelector('.view-collection-btn');
  if (viewBtn) {
    viewBtn.addEventListener('click', () => viewCollection(collection.id));
  }

  const editBtn = card.querySelector('.edit-collection-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => editCollection(collection.id));
  }

  const deleteBtn = card.querySelector('.delete-collection-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteCollection(collection.id));
  }

  return card;
}

/**
 * View a collection (show/hide guides)
 * @param {string} collectionId
 */
function viewCollection(collectionId) {
  const card = document.querySelector(`[data-collection-id="${collectionId}"]`);
  if (!card) return;

  // Toggle expanded state
  const isExpanded = card.classList.toggle('expanded');

  if (isExpanded) {
    // Show guides in this collection
    const collection = collections.getCollections()[collectionId];
    if (!collection) return;

    const guidesContainer = document.createElement('div');
    guidesContainer.className = 'collection-guides';

    if (collection.guideIds.length === 0) {
      guidesContainer.innerHTML = '<p>No guides in this collection yet.</p>';
    } else {
      const guidesGrid = document.createElement('div');
      guidesGrid.className = 'collection-guides-grid';

      collection.guideIds.forEach(guideId => {
        const guideCard = document.querySelector(`.card[data-guide="${guideId}"]`);
        if (guideCard) {
          const cardClone = guideCard.cloneNode(true);
          cardClone.classList.add('collection-guide-item');
          guidesGrid.appendChild(cardClone);
        }
      });

      guidesContainer.appendChild(guidesGrid);
    }

    card.appendChild(guidesContainer);
  } else {
    // Hide guides
    const guidesContainer = card.querySelector('.collection-guides');
    if (guidesContainer) {
      guidesContainer.remove();
    }
  }
}

/**
 * Edit a collection (name and icon)
 * @param {string} collectionId
 */
function editCollection(collectionId) {
  const col = collections.getCollections()[collectionId];
  if (!col) return;

  const newName = prompt('Collection name:', col.name);
  if (newName && newName.trim()) {
    collections.updateCollection(collectionId, { name: newName.trim() });
    renderCollections();
  }
}

/**
 * Delete a collection
 * @param {string} collectionId
 */
function deleteCollection(collectionId) {
  const col = collections.getCollections()[collectionId];
  if (!col) return;

  if (confirm(`Delete collection "${col.name}"? This cannot be undone.`)) {
    collections.deleteCollection(collectionId);
    renderCollections();
  }
}

// escapeHtml imported from utils.js
