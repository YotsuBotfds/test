# Integrating Auto-Backup into Guide Pages

This document explains how to update existing guide pages to use the new auto-backup functionality.

## Quick Start

### Current Code (Old Way)

Most guides currently have this pattern:

```javascript
// Save progress
markBtn.addEventListener('click', function() {
  progress[guideId] = {
    completed: true,
    date: new Date().toISOString()
  };
  localStorage.setItem('compendium-progress', JSON.stringify(progress));
  markBtn.textContent = '✓ Completed';
  markBtn.classList.add('completed');
});

// Save notes
saveNotesBtn.addEventListener('click', function() {
  if(notesArea) {
    localStorage.setItem(notesKey, notesArea.value);
    const status = document.getElementById('notes-status');
    if(status) {
      status.textContent = 'Saved!';
      setTimeout(function() { status.textContent = ''; }, 2000);
    }
  }
});
```

### New Code (With Auto-Backup)

Update to use the guide-helper module:

```javascript
import { saveGuideProgress, saveGuideNotes } from '../js/guide-helper.js';

// Save progress
markBtn.addEventListener('click', function() {
  saveGuideProgress(guideId, true);
  markBtn.textContent = '✓ Completed';
  markBtn.classList.add('completed');
});

// Save notes
saveNotesBtn.addEventListener('click', function() {
  if(notesArea) {
    saveGuideNotes(guideId, notesArea.value);
    const status = document.getElementById('notes-status');
    if(status) {
      status.textContent = 'Saved!';
      setTimeout(function() { status.textContent = ''; }, 2000);
    }
  }
});
```

## Benefits

By updating guide pages to use `guide-helper.js`:

1. **Automatic IndexedDB Backup** - Data is automatically backed up after each change
2. **Consistent Data Format** - All guides use the same storage format
3. **Better Code Organization** - Shared utilities reduce duplication
4. **Future-Proof** - Easy to add new features to all guides at once
5. **Easier Maintenance** - Changes to storage logic only need to be made in one place

## Detailed Migration Guide

### Step 1: Add Import Statement

At the top of your guide's `<script>` section, add:

```javascript
import { saveGuideProgress, saveGuideNotes } from '../js/guide-helper.js';
```

**Note:** This requires your guide to be a module. Make sure the `<script>` tag has `type="module"`:

```html
<script type="module">
  import { saveGuideProgress, saveGuideNotes } from '../js/guide-helper.js';
  // ... rest of guide code
</script>
```

### Step 2: Replace Progress Save

**Before:**
```javascript
markBtn.addEventListener('click', function() {
  progress[guideId] = {
    completed: true,
    date: new Date().toISOString()
  };
  localStorage.setItem('compendium-progress', JSON.stringify(progress));
  // ... update UI
});
```

**After:**
```javascript
markBtn.addEventListener('click', function() {
  saveGuideProgress(guideId, true);
  // ... update UI (no need to update localStorage)
});
```

### Step 3: Replace Notes Save

**Before:**
```javascript
saveNotesBtn.addEventListener('click', function() {
  if(notesArea) {
    localStorage.setItem(notesKey, notesArea.value);
    // ... show status
  }
});
```

**After:**
```javascript
saveNotesBtn.addEventListener('click', function() {
  if(notesArea) {
    saveGuideNotes(guideId, notesArea.value);
    // ... show status
  }
});
```

### Step 4: Remove Manual Progress Management

You can simplify your code by removing manual progress object management:

**Remove this:**
```javascript
const progress = JSON.parse(localStorage.getItem('compendium-progress') || '{}');
```

**The function handles it internally** (though keeping it for reading initial state is fine).

## Common Patterns

### Pattern 1: Conditional Save

If you have conditional progress saves:

```javascript
// Before
if (userCompleted) {
  progress[guideId] = { completed: true, date: ... };
  localStorage.setItem('compendium-progress', JSON.stringify(progress));
}

// After
if (userCompleted) {
  saveGuideProgress(guideId, true);
}
```

### Pattern 2: Auto-Save Notes

If notes are auto-saved on change:

```javascript
// Before
notesArea.addEventListener('change', function() {
  localStorage.setItem(notesKey, notesArea.value);
});

// After
notesArea.addEventListener('change', function() {
  saveGuideNotes(guideId, notesArea.value);
});
```

### Pattern 3: Multiple Progress States

If you track different states:

```javascript
// Before
progress[guideId] = {
  completed: true,
  reviewed: true,
  pages: 5,
  date: new Date().toISOString()
};
localStorage.setItem('compendium-progress', JSON.stringify(progress));

// After (simplified - just save completion)
saveGuideProgress(guideId, true);

// Note: For complex tracking, you may need to keep manual management
// The helper functions provide the common case of boolean completion
```

## Backward Compatibility

### Old Code Still Works

If a guide page is NOT updated to use guide-helper:
- All existing functionality continues to work
- Data is still saved to localStorage
- Users can still export and import
- The guide remains fully functional

### Gradual Migration

You can update guides gradually:
- Update one guide as a test
- Verify functionality works
- Update remaining guides
- No rush - old and new code work together

## Testing Your Changes

### Test Checklist

- [ ] Import statement doesn't cause errors
- [ ] Guide loads without console errors
- [ ] "Mark as Completed" button works
- [ ] Progress shows as completed in main page
- [ ] Notes save correctly
- [ ] Notes load on page refresh
- [ ] Export includes the guide's data
- [ ] Data appears in IndexedDB backup
- [ ] Restore recovers the data

### Quick Test Commands

In browser console while on a guide:

```javascript
// Check if guide helper imported correctly
console.log(typeof saveGuideProgress); // should be 'function'

// Check localStorage was updated
console.log(JSON.parse(localStorage.getItem('compendium-progress')));

// Check IndexedDB backup was created
const req = indexedDB.open('compendium-backup', 1);
req.onsuccess = () => {
  const db = req.result;
  const trans = db.transaction(['backups'], 'readonly');
  const store = trans.objectStore('backups');
  const getReq = store.getAll();
  getReq.onsuccess = () => console.log('Backups:', getReq.result);
};
```

## Troubleshooting

### Issue: Import Error

**Error:** `Uncaught SyntaxError: The requested module does not provide an export`

**Solution:**
- Verify the import path is correct: `../js/guide-helper.js`
- Make sure guide file is in `/guides/` directory
- Ensure script tag has `type="module"`

### Issue: Function Not Found

**Error:** `saveGuideProgress is not defined`

**Solution:**
- Verify import statement is at the top of script
- Import must come before first use
- Check for typos in function names

### Issue: Data Not Backing Up

**Error:** Data doesn't appear in IndexedDB

**Solution:**
- Check browser console for errors
- Verify IndexedDB is enabled in browser
- Check browser's storage quota hasn't been exceeded
- Note: guide-helper functions fail silently (console warnings only)

## API Reference

### saveGuideProgress()

```javascript
saveGuideProgress(guideId, completed = true)
```

**Parameters:**
- `guideId` (string, required) - The guide identifier
- `completed` (boolean, optional) - Mark as completed (default: true)

**Returns:** None (but triggers IndexedDB backup)

**Example:**
```javascript
saveGuideProgress('petroleum-refining', true);
```

### saveGuideNotes()

```javascript
saveGuideNotes(guideId, notes)
```

**Parameters:**
- `guideId` (string, required) - The guide identifier
- `notes` (string, required) - The notes content to save

**Returns:** None (but triggers IndexedDB backup)

**Example:**
```javascript
saveGuideNotes('petroleum-refining', 'Important: Check safety precautions');
```

## Advanced Usage

### Custom Progress Fields

If your guide needs to track more than just completion:

```javascript
// The helper provides the basic case
saveGuideProgress(guideId, true);

// For advanced fields, you can still use localStorage directly
const progress = JSON.parse(localStorage.getItem('compendium-progress') || '{}');
progress[guideId] = {
  completed: true,
  reviewed: true,
  pages: 5,
  difficulty: 'advanced',
  date: new Date().toISOString()
};
localStorage.setItem('compendium-progress', JSON.stringify(progress));

// Then trigger backup manually
const importExport = await import('../js/import-export.js');
await importExport.autoBackupProgress();
```

## Performance Notes

### No Performance Impact

- Functions are lightweight
- IndexedDB operations are async (non-blocking)
- Auto-backup happens in background
- No noticeable delay for users

### Data Size

- Each backup: ~100-500 KB (depending on notes)
- IndexedDB quota: Usually 50 MB+
- Multiple backups can be stored
- Old backups automatically managed

## Getting Help

If you encounter issues:

1. Check the console for error messages
2. Review this document for solutions
3. Check `EXPORT_FEATURES.md` for more details
4. Review example guides in the codebase
5. Verify import path is correct for your location

## Summary

Updating guide pages to use auto-backup is simple:

1. Add one import statement
2. Replace `localStorage.setItem()` calls with helper functions
3. Everything else stays the same

This ensures all user data is automatically protected with IndexedDB backups while maintaining the same user experience.
