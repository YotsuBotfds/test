/**
 * Import/Export Module - Data backup and restore functionality
 * Multi-format export support: JSON, CSV, Markdown
 * Auto-backup with IndexedDB safety net
 * Backup reminder system
 */

import * as storage from './storage.js';
import * as collections from './collections.js';
import * as notifications from './notifications.js';

// IndexedDB database name and store names
const DB_NAME = 'compendium-backup';
const STORE_NAME = 'backups';
const METADATA_STORE = 'metadata';

/**
 * Initialize IndexedDB for backup functionality
 * @returns {Promise<IDBDatabase>} The database instance
 */
async function initializeIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      }
    };
  });
}

/**
 * Save backup to IndexedDB
 * @param {Object} data - The backup data
 * @returns {Promise<void>}
 */
async function saveToIndexedDB(data) {
  try {
    const db = await initializeIndexedDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    store.add({
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Failed to save backup to IndexedDB:', error);
  }
}

/**
 * Get latest backup from IndexedDB
 * @returns {Promise<Object|null>} The latest backup or null
 */
async function getLatestBackupFromIndexedDB() {
  try {
    const db = await initializeIndexedDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result;
        if (results.length > 0) {
          resolve(results[results.length - 1]);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (error) {
    console.warn('Failed to retrieve backup from IndexedDB:', error);
    return null;
  }
}

/**
 * Gather all data for export
 * @returns {Object} Complete backup data
 */
function gatherExportData() {
  const data = {
    version: '3.0',
    exportDate: new Date().toISOString(),
    progress: storage.get('compendium-progress'),
    theme: storage.get('compendium-theme'),
    achievements: storage.get('compendium-achievements')
  };

  // Add all notes
  const noteKeys = storage.getAllWithPrefix('compendium-notes-');
  const notes = {};
  noteKeys.forEach(key => {
    const guideId = key.replace('compendium-notes-', '');
    notes[guideId] = storage.get(key);
  });
  data.notes = notes;

  // Add collections
  try {
    data.collections = collections.exportCollections();
  } catch (error) {
    console.warn('Failed to export collections:', error);
  }

  return data;
}

/**
 * Convert notes to CSV format
 * @param {Object} notes - Notes keyed by guide ID
 * @returns {string} CSV formatted data
 */
function convertNotesToCSV(notes) {
  const rows = [['Guide ID', 'Notes']];

  Object.entries(notes).forEach(([guideId, noteContent]) => {
    if (noteContent) {
      // Escape quotes and wrap in quotes if necessary
      const escapedNote = noteContent.replace(/"/g, '""');
      rows.push([guideId, `"${escapedNote}"`]);
    }
  });

  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Convert bookmarks/progress to CSV format
 * @param {Object} progress - Progress keyed by guide ID
 * @returns {string} CSV formatted data
 */
function convertProgressToCSV(progress) {
  const rows = [['Guide ID', 'Completed', 'Pages Read', 'Last Updated']];

  Object.entries(progress).forEach(([guideId, progressData]) => {
    if (progressData) {
      const completed = progressData.completed ? 'Yes' : 'No';
      const pagesRead = progressData.pagesRead || 0;
      const lastUpdated = progressData.lastUpdated || '';
      rows.push([guideId, completed, pagesRead, lastUpdated]);
    }
  });

  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Convert notes to Markdown format
 * @param {Object} notes - Notes keyed by guide ID
 * @returns {string} Markdown formatted data
 */
function convertNotesToMarkdown(notes) {
  let markdown = '# Survival Compendium - Notes Export\n\n';
  markdown += `*Exported: ${new Date().toISOString()}*\n\n`;

  Object.entries(notes).forEach(([guideId, noteContent]) => {
    if (noteContent) {
      markdown += `## ${guideId}\n\n`;
      markdown += `${noteContent}\n\n`;
    }
  });

  return markdown;
}

/**
 * Download data as file
 * @param {string} content - File content
 * @param {string} filename - File name
 * @param {string} mimeType - MIME type
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Show export format selection modal
 */
export function showExportModal() {
  const existingModal = document.getElementById('export-format-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'export-format-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'export-modal-title');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: var(--bg, #1a1a1a);
    border: 2px solid var(--accent, #d4a574);
    border-radius: 12px;
    padding: 32px;
    max-width: 500px;
    color: var(--text, #f5f0e8);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  `;

  modalContent.innerHTML = `
    <h2 id="export-modal-title" style="margin-top: 0; color: var(--accent, #d4a574);">Choose Export Format</h2>
    <p style="margin-bottom: 24px;">Select how you'd like to export your data:</p>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <button id="export-json-btn" style="
        padding: 12px 16px;
        background: rgba(212, 165, 116, 0.2);
        border: 1px solid var(--accent, #d4a574);
        border-radius: 8px;
        color: var(--text, #f5f0e8);
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
      ">
        <strong>📋 Export as JSON</strong><br>
        <small>Complete backup with all data and settings</small>
      </button>
      <button id="export-notes-csv-btn" style="
        padding: 12px 16px;
        background: rgba(212, 165, 116, 0.2);
        border: 1px solid var(--accent, #d4a574);
        border-radius: 8px;
        color: var(--text, #f5f0e8);
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
      ">
        <strong>📊 Export Notes as CSV</strong><br>
        <small>Your notes in spreadsheet format</small>
      </button>
      <button id="export-progress-csv-btn" style="
        padding: 12px 16px;
        background: rgba(212, 165, 116, 0.2);
        border: 1px solid var(--accent, #d4a574);
        border-radius: 8px;
        color: var(--text, #f5f0e8);
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
      ">
        <strong>📈 Export Progress as CSV</strong><br>
        <small>Your reading progress and bookmarks</small>
      </button>
      <button id="export-markdown-btn" style="
        padding: 12px 16px;
        background: rgba(212, 165, 116, 0.2);
        border: 1px solid var(--accent, #d4a574);
        border-radius: 8px;
        color: var(--text, #f5f0e8);
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
      ">
        <strong>📝 Export Notes as Markdown</strong><br>
        <small>Your notes as a markdown document</small>
      </button>
    </div>
    <button id="cancel-export-btn" style="
      margin-top: 24px;
      padding: 10px 20px;
      background: rgba(212, 165, 116, 0.1);
      border: 1px solid rgba(212, 165, 116, 0.3);
      border-radius: 6px;
      color: var(--text, #f5f0e8);
      cursor: pointer;
      width: 100%;
    ">Cancel</button>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Attach event listeners to buttons after DOM insertion
  const jsonBtn = document.getElementById('export-json-btn');
  const notesCsvBtn = document.getElementById('export-notes-csv-btn');
  const progressCsvBtn = document.getElementById('export-progress-csv-btn');
  const markdownBtn = document.getElementById('export-markdown-btn');
  const cancelBtn = document.getElementById('cancel-export-btn');

  if (jsonBtn) {
    jsonBtn.addEventListener('click', () => exportAsJSON());
    jsonBtn.addEventListener('mouseover', () => {
      jsonBtn.style.background = 'rgba(212, 165, 116, 0.3)';
    });
    jsonBtn.addEventListener('mouseout', () => {
      jsonBtn.style.background = 'rgba(212, 165, 116, 0.2)';
    });
  }

  if (notesCsvBtn) {
    notesCsvBtn.addEventListener('click', () => exportNotesAsCSV());
    notesCsvBtn.addEventListener('mouseover', () => {
      notesCsvBtn.style.background = 'rgba(212, 165, 116, 0.3)';
    });
    notesCsvBtn.addEventListener('mouseout', () => {
      notesCsvBtn.style.background = 'rgba(212, 165, 116, 0.2)';
    });
  }

  if (progressCsvBtn) {
    progressCsvBtn.addEventListener('click', () => exportProgressAsCSV());
    progressCsvBtn.addEventListener('mouseover', () => {
      progressCsvBtn.style.background = 'rgba(212, 165, 116, 0.3)';
    });
    progressCsvBtn.addEventListener('mouseout', () => {
      progressCsvBtn.style.background = 'rgba(212, 165, 116, 0.2)';
    });
  }

  if (markdownBtn) {
    markdownBtn.addEventListener('click', () => exportNotesAsMarkdown());
    markdownBtn.addEventListener('mouseover', () => {
      markdownBtn.style.background = 'rgba(212, 165, 116, 0.3)';
    });
    markdownBtn.addEventListener('mouseout', () => {
      markdownBtn.style.background = 'rgba(212, 165, 116, 0.2)';
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closeExportModal());
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeExportModal();
    }
  });
}

/**
 * Close the export modal
 */
export function closeExportModal() {
  const modal = document.getElementById('export-format-modal');
  if (modal) {
    modal.remove();
  }
}

/**
 * Export progress and settings to a JSON file (enhanced)
 */
export function exportAsJSON() {
  closeExportModal();
  const data = gatherExportData();

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'compendium-backup-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);

  // Update last export date and save to IndexedDB
  updateLastExportDate();
  saveToIndexedDB(data);

  // Show success toast
  notifications.showToast('📤 Progress exported successfully', 3000);
}

/**
 * Legacy function - redirects to modal
 */
export function exportProgress() {
  showExportModal();
}

/**
 * Export notes as CSV
 */
export function exportNotesAsCSV() {
  closeExportModal();
  const notes = storage.getAllNotes();
  const csv = convertNotesToCSV(notes);
  downloadFile(csv, 'compendium-notes-' + Date.now() + '.csv', 'text/csv');

  updateLastExportDate();
  saveToIndexedDB(gatherExportData());

  notifications.showToast('📤 Notes exported successfully', 3000);
}

/**
 * Export progress as CSV
 */
export function exportProgressAsCSV() {
  closeExportModal();
  const progress = storage.get('compendium-progress', {});
  const csv = convertProgressToCSV(progress);
  downloadFile(csv, 'compendium-progress-' + Date.now() + '.csv', 'text/csv');

  updateLastExportDate();
  saveToIndexedDB(gatherExportData());

  notifications.showToast('📤 Progress exported successfully', 3000);
}

/**
 * Export notes as Markdown
 */
export function exportNotesAsMarkdown() {
  closeExportModal();
  const notes = storage.getAllNotes();
  const markdown = convertNotesToMarkdown(notes);
  downloadFile(markdown, 'compendium-notes-' + Date.now() + '.md', 'text/markdown');

  updateLastExportDate();
  saveToIndexedDB(gatherExportData());

  notifications.showToast('📤 Notes exported successfully', 3000);
}

/**
 * Update the last export date in localStorage
 */
function updateLastExportDate() {
  const lastExportDate = new Date().toISOString();
  storage.set('compendium-last-export-date', lastExportDate);
}

/**
 * Check if backup reminder should be shown
 * Shows reminder if user has completed many guides AND (never exported OR last export > 30 days ago)
 * Uses toast notification for better UX
 */
export function checkBackupReminder() {
  // Don't show if already dismissed this session
  if (sessionStorage.getItem('backup-reminder-dismissed')) return;

  // Get completed guides count
  const progress = storage.get('compendium-progress', {});
  const completedCount = Object.values(progress).filter(p => p && p.completed).length;

  // Only show if user has completed at least 20 guides
  if (completedCount < 20) {
    return;
  }

  const lastExportDate = storage.get('compendium-last-export-date');

  // Check if should show reminder
  const shouldShowReminder = !lastExportDate || (() => {
    const lastExport = new Date(lastExportDate);
    const now = new Date();
    const daysSinceExport = Math.floor((now - lastExport) / (1000 * 60 * 60 * 24));
    return daysSinceExport > 30;
  })();

  if (shouldShowReminder) {
    // Use toast notification instead of banner
    const message = `You've completed ${completedCount} guides! Consider exporting your progress as a backup.`;
    notifications.showToast(message, 5000, true, 'Export Now', () => {
      if (window.showExportModal) {
        window.showExportModal();
      }
    });
    // Mark as dismissed for this session
    sessionStorage.setItem('backup-reminder-dismissed', 'true');
  }
}

/**
 * Show backup reminder banner
 * @param {boolean} isFirstTime - True if this is the first export ever
 * @param {number} daysSinceExport - Days since last export
 */
function showBackupReminder(isFirstTime = false, daysSinceExport = 0) {
  const existingBanner = document.getElementById('backup-reminder-banner');
  if (existingBanner) {
    return; // Don't show multiple reminders
  }

  const banner = document.createElement('div');
  banner.id = 'backup-reminder-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');
  banner.style.cssText = `
    background: linear-gradient(135deg, rgba(212, 165, 116, 0.2) 0%, rgba(212, 165, 116, 0.1) 100%);
    border-left: 4px solid var(--accent, #d4a574);
    padding: 16px 20px;
    margin: 12px 20px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 16px;
    color: var(--text, #f5f0e8);
    max-width: calc(100% - 40px);
  `;

  const message = isFirstTime
    ? "⚠️ Your reading progress has never been backed up. Consider exporting your data regularly!"
    : `⚠️ Your last backup was ${daysSinceExport} days ago. Time to back up your progress!`;

  // Build banner content with proper event listeners (no inline handlers)
  const msgSpan = document.createElement('span');
  msgSpan.style.flex = '1';
  msgSpan.textContent = message;

  const backupBtn = document.createElement('button');
  backupBtn.textContent = 'Backup Now';
  backupBtn.style.cssText = 'padding:8px 16px;background:var(--accent,#d4a574);color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;white-space:nowrap;transition:opacity 0.2s;';
  backupBtn.addEventListener('click', () => {
    if (window.showExportModal) window.showExportModal();
  });
  backupBtn.addEventListener('mouseenter', () => { backupBtn.style.opacity = '0.9'; });
  backupBtn.addEventListener('mouseleave', () => { backupBtn.style.opacity = '1'; });

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.style.cssText = 'padding:6px 10px;background:transparent;border:1px solid rgba(212,165,116,0.3);border-radius:4px;color:var(--text,#f5f0e8);cursor:pointer;transition:all 0.2s;';
  dismissBtn.addEventListener('click', () => {
    banner.remove();
    // Store dismissal so it doesn't reappear this session
    sessionStorage.setItem('backup-reminder-dismissed', 'true');
  });
  dismissBtn.addEventListener('mouseenter', () => { dismissBtn.style.background = 'rgba(212,165,116,0.1)'; });
  dismissBtn.addEventListener('mouseleave', () => { dismissBtn.style.background = 'transparent'; });

  banner.appendChild(msgSpan);
  banner.appendChild(backupBtn);
  banner.appendChild(dismissBtn);

  const targetElement = document.querySelector('.tools-bar') || document.querySelector('.container');
  if (targetElement) {
    targetElement.insertAdjacentElement('beforebegin', banner);
  }
}

/**
 * Trigger the import file dialog
 */
export function importProgress() {
  const fileInput = document.getElementById('import-file');
  if (fileInput) {
    fileInput.click();
  }
}

/**
 * Offer to restore from IndexedDB backup if localStorage appears cleared
 */
export async function checkAndOfferIndexedDBRestore() {
  const progress = storage.get('compendium-progress');

  // Only check if no progress exists
  if (progress && Object.keys(progress).length > 0) {
    return;
  }

  const backup = await getLatestBackupFromIndexedDB();
  if (!backup) {
    return;
  }

  showRestoreModal(backup);
}

/**
 * Show restore from IndexedDB modal
 * @param {Object} backup - The backup object
 */
function showRestoreModal(backup) {
  const modal = document.createElement('div');
  modal.id = 'restore-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'restore-modal-title');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: var(--bg, #1a1a1a);
    border: 2px solid var(--accent, #d4a574);
    border-radius: 12px;
    padding: 32px;
    max-width: 500px;
    color: var(--text, #f5f0e8);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  `;

  const backupDate = new Date(backup.data.exportDate).toLocaleDateString();

  modalContent.innerHTML = `
    <h2 id="restore-modal-title" style="margin-top: 0; color: var(--accent, #d4a574);">Restore from Backup?</h2>
    <p>We found a backup from <strong>${backupDate}</strong> in your browser's local storage. Your data appears to have been cleared.</p>
    <p>Would you like to restore your reading progress and notes from this backup?</p>
    <div style="display: flex; gap: 12px; margin-top: 24px;">
      <button id="restore-btn" style="
        flex: 1;
        padding: 12px 16px;
        background: var(--accent, #d4a574);
        color: #000;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        transition: opacity 0.2s;
      ">
        Restore
      </button>
      <button id="skip-restore-btn" style="
        flex: 1;
        padding: 12px 16px;
        background: rgba(212, 165, 116, 0.2);
        border: 1px solid var(--accent, #d4a574);
        border-radius: 6px;
        color: var(--text, #f5f0e8);
        cursor: pointer;
        transition: all 0.2s;
      ">
        Skip
      </button>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Attach event listeners to buttons after DOM insertion
  const restoreBtn = document.getElementById('restore-btn');
  const skipBtn = document.getElementById('skip-restore-btn');

  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => restoreFromIndexedDB());
    restoreBtn.addEventListener('mouseover', () => {
      restoreBtn.style.opacity = '0.9';
    });
    restoreBtn.addEventListener('mouseout', () => {
      restoreBtn.style.opacity = '1';
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', () => closeRestoreModal());
    skipBtn.addEventListener('mouseover', () => {
      skipBtn.style.background = 'rgba(212, 165, 116, 0.3)';
    });
    skipBtn.addEventListener('mouseout', () => {
      skipBtn.style.background = 'rgba(212, 165, 116, 0.2)';
    });
  }

  // Store backup for restoration
  window._indexedDBBackup = backup;
}

/**
 * Close the restore modal
 */
export function closeRestoreModal() {
  const modal = document.getElementById('restore-modal');
  if (modal) {
    modal.remove();
  }
  window._indexedDBBackup = null;
}

/**
 * Restore from IndexedDB backup
 */
export function restoreFromIndexedDB() {
  if (!window._indexedDBBackup) {
    alert('No backup available');
    return;
  }

  const backup = window._indexedDBBackup;
  const data = backup.data;

  // Restore progress
  if (data.progress) {
    storage.set('compendium-progress', data.progress);
  }

  // Restore theme
  if (data.theme) {
    storage.set('compendium-theme', data.theme);
  }

  // Restore achievements
  if (data.achievements) {
    storage.set('compendium-achievements', data.achievements);
  }

  // Restore notes
  if (data.notes) {
    Object.entries(data.notes).forEach(([guideId, notes]) => {
      if (notes) {
        storage.set(`compendium-notes-${guideId}`, notes);
      }
    });
  }

  // Restore collections
  if (data.collections) {
    try {
      collections.importCollections(data.collections);
    } catch (error) {
      console.warn('Failed to restore collections:', error);
    }
  }

  closeRestoreModal();
  alert('Data restored successfully! Refreshing...');
  location.reload();
}

/**
 * Initialize import file handling
 */
export function initializeImportHandler() {
  const importFile = document.getElementById('import-file');
  if (!importFile) return;

  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);

        // Validate import data
        if (!validateImportData(data)) {
          alert('Invalid backup file format');
          return;
        }

        // Import progress
        if (data.progress) {
          storage.set('compendium-progress', data.progress);
        }

        // Import theme
        if (data.theme) {
          storage.set('compendium-theme', data.theme);
        }

        // Import achievements
        if (data.achievements) {
          storage.set('compendium-achievements', data.achievements);
        }

        // Import notes from both old and new format
        if (data.notes) {
          // New format: notes as object
          Object.entries(data.notes).forEach(([guideId, notes]) => {
            if (notes) {
              storage.set(`compendium-notes-${guideId}`, notes);
            }
          });
        }

        // Also check for old format where notes were top-level keys
        Object.keys(data).forEach(key => {
          if (key.startsWith('compendium-notes-')) {
            storage.set(key, data[key]);
          }
        });

        // Import collections
        if (data.collections) {
          try {
            collections.importCollections(data.collections);
          } catch (error) {
            console.warn('Failed to import collections:', error);
          }
        }

        location.reload();
      } catch (err) {
        alert('Invalid backup file');
      }
    };
    reader.readAsText(file);
  });
}

/**
 * Validate imported data structure
 * @param {Object} data - The data to validate
 * @returns {boolean} True if data is valid
 */
function validateImportData(data) {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  // Check for minimum required structure
  if (!('version' in data) && !('progress' in data) && !('theme' in data)) {
    return false;
  }

  return true;
}

/**
 * Reset all progress and settings
 * Clears all compendium-prefixed localStorage entries
 */
export function resetProgress() {
  if (confirm('Reset all reading progress and notes? This cannot be undone.')) {
    storage.clearPrefix('compendium-');
    location.reload();
  }
}

/**
 * Auto-backup to IndexedDB on progress changes
 * Should be called whenever progress data changes
 */
export async function autoBackupProgress() {
  try {
    const data = gatherExportData();
    await saveToIndexedDB(data);
  } catch (error) {
    console.warn('Auto-backup failed:', error);
  }
}
