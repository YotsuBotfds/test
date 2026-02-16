/**
 * Guide Helper Module - Shared utilities for guide pages
 * Provides consistent progress and notes management with auto-backup
 */

/**
 * Save progress for a guide with auto-backup
 * @param {string} guideId - The guide identifier
 * @param {boolean} completed - Whether the guide is completed
 */
export function saveGuideProgress(guideId, completed = true) {
  const progress = JSON.parse(localStorage.getItem('compendium-progress') || '{}');
  const wasAlreadyCompleted = progress[guideId]?.completed;

  progress[guideId] = {
    completed,
    date: new Date().toISOString()
  };

  localStorage.setItem('compendium-progress', JSON.stringify(progress));

  // Show toast notification if guide was just completed (wasn't before)
  if (completed && !wasAlreadyCompleted) {
    const completedCount = Object.values(progress).filter(p => p?.completed).length;
    showGuideCompletedToast(completedCount);
  }

  // Trigger auto-backup to IndexedDB
  autoBackupProgress();
}

/**
 * Show toast notification when a guide is completed
 * @param {number} totalCompleted - Total number of completed guides
 */
function showGuideCompletedToast(totalCompleted) {
  try {
    // Use dynamic import to avoid circular dependencies
    import('./notifications.js').then(notifications => {
      if (notifications.showToast) {
        notifications.showToast(
          `✅ Guide completed! ${totalCompleted} guides read so far`,
          3000
        );
      }
    }).catch(err => {
      console.warn('Failed to show guide completion toast:', err);
    });
  } catch (error) {
    console.warn('Failed to import notifications:', error);
  }
}

/**
 * Save notes for a guide with auto-backup
 * @param {string} guideId - The guide identifier
 * @param {string} notes - The notes content
 */
export function saveGuideNotes(guideId, notes) {
  const notesKey = 'compendium-notes-' + guideId;
  localStorage.setItem(notesKey, notes);

  // Trigger auto-backup to IndexedDB
  autoBackupProgress();
}

/**
 * Auto-backup to IndexedDB
 * Safely calls the import-export module's auto-backup function
 */
async function autoBackupProgress() {
  try {
    // Use dynamic import to avoid circular dependencies
    const importExport = await import('./import-export.js');
    if (importExport.autoBackupProgress) {
      await importExport.autoBackupProgress();
    }
  } catch (error) {
    console.warn('Failed to auto-backup progress:', error);
  }
}
