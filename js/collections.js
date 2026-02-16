/**
 * Collections Module - User-created playlists/collections of guides
 * Allows users to organize guides into named collections
 */

import * as storage from './storage.js';

const COLLECTIONS_KEY = 'compendium-collections';
const COLLECTION_ORDER_KEY = 'compendium-collection-order';

/**
 * Get all collections
 * @returns {Object} Collections object keyed by collection ID
 */
export function getCollections() {
  return storage.get(COLLECTIONS_KEY, {});
}

/**
 * Get all collection IDs in order
 * @returns {Array<string>} Ordered array of collection IDs
 */
function getCollectionOrder() {
  return storage.get(COLLECTION_ORDER_KEY, []);
}

/**
 * Save collection order
 * @param {Array<string>} order - Array of collection IDs
 */
function saveCollectionOrder(order) {
  storage.set(COLLECTION_ORDER_KEY, order);
}

/**
 * Generate a unique ID
 * @returns {string} Unique ID
 */
function generateId() {
  return `col-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new collection
 * @param {string} name - Collection name
 * @param {string} icon - Collection icon (emoji or text)
 * @returns {Object} The created collection
 */
export function createCollection(name, icon = '📚') {
  if (!name || name.trim() === '') {
    throw new Error('Collection name is required');
  }

  const collections = getCollections();
  const id = generateId();
  const now = new Date().toISOString();

  const collection = {
    id,
    name: name.trim(),
    icon,
    guideIds: [],
    createdAt: now,
    updatedAt: now,
  };

  collections[id] = collection;
  storage.set(COLLECTIONS_KEY, collections);

  // Add to order
  const order = getCollectionOrder();
  order.push(id);
  saveCollectionOrder(order);

  return collection;
}

/**
 * Delete a collection
 * @param {string} collectionId - Collection ID to delete
 * @returns {boolean} True if successful
 */
export function deleteCollection(collectionId) {
  const collections = getCollections();

  if (!collections[collectionId]) {
    return false;
  }

  delete collections[collectionId];
  storage.set(COLLECTIONS_KEY, collections);

  // Remove from order
  const order = getCollectionOrder();
  const newOrder = order.filter(id => id !== collectionId);
  saveCollectionOrder(newOrder);

  return true;
}

/**
 * Update collection properties
 * @param {string} collectionId - Collection ID
 * @param {Object} updates - Fields to update (name, icon)
 * @returns {Object|null} Updated collection or null if not found
 */
export function updateCollection(collectionId, updates) {
  const collections = getCollections();
  const collection = collections[collectionId];

  if (!collection) {
    return null;
  }

  if (updates.name) {
    collection.name = updates.name.trim();
  }
  if (updates.icon) {
    collection.icon = updates.icon;
  }
  collection.updatedAt = new Date().toISOString();

  storage.set(COLLECTIONS_KEY, collections);
  return collection;
}

/**
 * Add a guide to a collection
 * @param {string} collectionId - Collection ID
 * @param {string} guideId - Guide ID to add
 * @returns {boolean} True if successful
 */
export function addToCollection(collectionId, guideId) {
  const collections = getCollections();
  const collection = collections[collectionId];

  if (!collection) {
    return false;
  }

  // Avoid duplicates
  if (!collection.guideIds.includes(guideId)) {
    collection.guideIds.push(guideId);
    collection.updatedAt = new Date().toISOString();
    storage.set(COLLECTIONS_KEY, collections);
  }

  return true;
}

/**
 * Remove a guide from a collection
 * @param {string} collectionId - Collection ID
 * @param {string} guideId - Guide ID to remove
 * @returns {boolean} True if successful
 */
export function removeFromCollection(collectionId, guideId) {
  const collections = getCollections();
  const collection = collections[collectionId];

  if (!collection) {
    return false;
  }

  const index = collection.guideIds.indexOf(guideId);
  if (index > -1) {
    collection.guideIds.splice(index, 1);
    collection.updatedAt = new Date().toISOString();
    storage.set(COLLECTIONS_KEY, collections);
    return true;
  }

  return false;
}

/**
 * Check if a guide is in a collection
 * @param {string} collectionId - Collection ID
 * @param {string} guideId - Guide ID to check
 * @returns {boolean} True if guide is in collection
 */
export function isGuideInCollection(collectionId, guideId) {
  const collections = getCollections();
  const collection = collections[collectionId];

  if (!collection) {
    return false;
  }

  return collection.guideIds.includes(guideId);
}

/**
 * Get all guides in a collection
 * @param {string} collectionId - Collection ID
 * @returns {Array<string>} Array of guide IDs
 */
export function getCollectionGuides(collectionId) {
  const collections = getCollections();
  const collection = collections[collectionId];

  if (!collection) {
    return [];
  }

  return collection.guideIds || [];
}

/**
 * Get collection progress (X/Y guides read)
 * @param {string} collectionId - Collection ID
 * @returns {Object} {total: number, read: number}
 */
export function getCollectionProgress(collectionId) {
  const collections = getCollections();
  const collection = collections[collectionId];

  if (!collection) {
    return { total: 0, read: 0 };
  }

  const progress = storage.get('compendium-progress', {});
  const read = collection.guideIds.filter(id => progress[id]?.completed).length;

  return {
    total: collection.guideIds.length,
    read,
  };
}

/**
 * Get all collections sorted by order
 * @returns {Array<Object>} Sorted collections
 */
export function getCollectionsSorted() {
  const collections = getCollections();
  const order = getCollectionOrder();

  return order
    .map(id => collections[id])
    .filter(col => col); // Filter out any missing collections
}

/**
 * Export collections as JSON
 * @returns {Object} Collections data
 */
export function exportCollections() {
  return {
    collections: getCollections(),
    order: getCollectionOrder(),
  };
}

/**
 * Import collections from JSON
 * @param {Object} data - Collections data with collections and order properties
 * @returns {boolean} True if successful
 */
export function importCollections(data) {
  try {
    if (!data.collections || typeof data.collections !== 'object') {
      return false;
    }

    storage.set(COLLECTIONS_KEY, data.collections);
    if (data.order && Array.isArray(data.order)) {
      saveCollectionOrder(data.order);
    }

    return true;
  } catch (error) {
    console.error('Error importing collections:', error);
    return false;
  }
}

/**
 * Clear all collections
 */
export function clearCollections() {
  storage.remove(COLLECTIONS_KEY);
  storage.remove(COLLECTION_ORDER_KEY);
}
