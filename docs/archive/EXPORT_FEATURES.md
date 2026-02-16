# Multi-Format Data Export Features

This document describes the enhanced data export, backup, and restore functionality added to the Survival Compendium.

## Overview

The app now supports multiple export formats, automatic backups, and intelligent backup reminders to ensure your reading progress and notes are never lost.

## Features

### 1. Multi-Format Export

Users can now export their data in multiple formats via the "📤 Export" button:

- **JSON Export**: Complete backup of all data including progress, theme, achievements, and notes
- **CSV Export - Notes**: Export notes in spreadsheet format for viewing in Excel or Google Sheets
- **CSV Export - Progress**: Export reading progress and bookmarks with completion status
- **Markdown Export**: Export notes as a formatted markdown document for documentation or sharing

#### Export Modal

Clicking the "📤 Export" button opens a selection dialog with all available export formats. Each option shows a description of what will be exported.

### 2. Auto-Backup to IndexedDB

The app automatically saves backups to IndexedDB whenever:

- Progress is marked (guide completed)
- Notes are saved
- Any export is performed

IndexedDB acts as a safety net in case localStorage is cleared by the user or browser.

### 3. Backup Reminder System

The app tracks when backups are last created:

- **First Time Users**: Show reminder if no export has ever occurred
- **Periodic Reminder**: Show reminder if last export was more than 30 days ago
- **Subtle Banner**: Displays at the top of the page with "Backup Now" and "Dismiss" buttons
- **Stored Date**: Last export date is saved to `compendium-last-export-date` in localStorage

### 4. IndexedDB Restore Feature

If localStorage appears to be cleared (no progress data exists), the app:

1. Checks for available backups in IndexedDB
2. Shows a restore modal with the backup date
3. Offers to restore all data with a single click
4. Supports restore even if localStorage was manually cleared

## Implementation Details

### Files Modified

#### `/js/import-export.js`
- Enhanced with multi-format export functions
- Added IndexedDB backup system
- Added backup reminder logic
- Added restore-from-backup functionality
- Maintains backward compatibility with JSON imports

Functions added:
- `showExportModal()` - Opens export format selection dialog
- `closeExportModal()` - Closes export modal
- `exportAsJSON()` - Export all data as JSON
- `exportNotesAsCSV()` - Export notes as CSV
- `exportProgressAsCSV()` - Export progress as CSV
- `exportNotesAsMarkdown()` - Export notes as Markdown
- `checkBackupReminder()` - Check if reminder should show
- `checkAndOfferIndexedDBRestore()` - Check for backup restore
- `restoreFromIndexedDB()` - Restore from backup
- `autoBackupProgress()` - Trigger auto-backup to IndexedDB

#### `/js/app.js`
- Added initialization for backup reminder check
- Added initialization for IndexedDB restore check
- Exposed export modal functions to window for HTML onclick handlers
- Added async/await for IndexedDB operations

#### `/js/guide-helper.js` (New)
- Shared utilities for guide pages
- Wraps progress and notes saving with auto-backup triggers
- Prevents circular dependencies through dynamic imports

Functions:
- `saveGuideProgress()` - Save progress with auto-backup
- `saveGuideNotes()` - Save notes with auto-backup

#### `/index.html`
- Changed "📤 Export Progress" button to "📤 Export"
- Button now calls `showExportModal()` instead of direct JSON export
- Updated button title to reference multiple formats

### Storage Keys

The module uses these localStorage keys:

- `compendium-progress` - Reading progress data
- `compendium-theme` - Theme preference
- `compendium-achievements` - Achievement tracking
- `compendium-notes-{guideId}` - Individual guide notes
- `compendium-last-export-date` - Last backup creation timestamp

IndexedDB usage:
- Database: `compendium-backup`
- Store: `backups` - Contains timestamped backup objects
- Store: `metadata` - For future metadata tracking

## Usage Guide

### For Users

#### Creating Exports

1. Click the "📤 Export" button in the toolbar
2. Choose your preferred format:
   - **JSON**: For complete backup/restore
   - **CSV Notes**: For importing notes into spreadsheet software
   - **CSV Progress**: For tracking completion statistics
   - **Markdown**: For documentation or sharing

#### Backup Reminders

- A subtle banner appears if your last backup was over 30 days ago
- Click "Backup Now" to create a new backup
- Click "Dismiss" to close the reminder (will reappear after 30 days)

#### Restoring from Backup

If your browser data is cleared:
1. A modal will automatically appear on page load
2. It shows the date of the latest available backup
3. Click "Restore" to recover all data
4. Click "Skip" to continue without restoring

### For Developers

#### Adding Auto-Backup to Guide Pages

When creating new guide pages, use the guide-helper module:

```javascript
import { saveGuideProgress, saveGuideNotes } from '../js/guide-helper.js';

// Save progress
markBtn.addEventListener('click', function() {
  saveGuideProgress(guideId, true);
  // ... update UI
});

// Save notes
saveNotesBtn.addEventListener('click', function() {
  saveGuideNotes(guideId, notesArea.value);
  // ... show saved status
});
```

#### CSV Format Details

**Notes CSV:**
- Columns: `Guide ID`, `Notes`
- Notes with commas/quotes are properly escaped
- Empty notes are skipped

**Progress CSV:**
- Columns: `Guide ID`, `Completed`, `Pages Read`, `Last Updated`
- Completed is "Yes" or "No"
- Empty entries are skipped

#### Markdown Format

Exports as a single document with:
- Header: "Survival Compendium - Notes Export"
- Export timestamp
- Each guide as a level-2 heading
- Notes content under each heading

## Data Safety

### Backup Layers

1. **localStorage** - Primary storage (user-facing)
2. **IndexedDB** - Automatic safety net (hidden from user)
3. **Downloaded Exports** - User-controlled backups

### Privacy

- All data stays on the user's device
- No external servers or APIs
- Exports can be stored locally by the user
- IndexedDB is browser-private storage

## Browser Compatibility

- **IndexedDB Support**: All modern browsers (IE 10+, Edge, Firefox, Chrome, Safari)
- **CSV Export**: Supported in all browsers
- **Markdown Export**: Supported in all browsers
- **Fallback**: If IndexedDB unavailable, app continues to work (just without auto-backup feature)

## Testing

### Manual Testing Checklist

- [ ] Export modal opens and closes correctly
- [ ] JSON export downloads with correct filename
- [ ] CSV exports have proper formatting
- [ ] Markdown export has readable formatting
- [ ] Backup reminder appears after 30 days
- [ ] IndexedDB backup saves on progress updates
- [ ] Restore modal appears when localStorage is cleared
- [ ] Restore functionality recovers all data
- [ ] Last export date is updated after each export
- [ ] CSV files open correctly in Excel/Sheets

### Browser Testing

- [ ] Chrome/Edge (Chromium-based)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

## Future Enhancements

Potential improvements:

1. Cloud backup sync (with user permission)
2. Scheduled automatic exports
3. Backup version history
4. Selective restore (choose what to restore)
5. Export individual guides
6. Notes search and export filtering
7. Statistics dashboard from exported data
