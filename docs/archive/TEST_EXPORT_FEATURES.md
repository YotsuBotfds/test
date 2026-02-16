# Export Features Test Guide

This guide provides step-by-step instructions for testing the new multi-format export features.

## Prerequisites

- Open the Survival Compendium in a modern browser
- Have some test guides marked as completed
- Have some test notes saved

## Test Cases

### Test 1: Export Modal Opens

**Steps:**
1. Click the "📤 Export" button in the toolbar
2. Verify a modal appears with four export options

**Expected Results:**
- Modal displays centered on screen
- Four buttons visible: JSON, Notes (CSV), Progress (CSV), Notes (Markdown)
- Each button has a descriptive subtitle
- Cancel button at the bottom

**Status:** [ ] Pass [ ] Fail

---

### Test 2: Export as JSON

**Steps:**
1. Open Export modal
2. Click "📋 Export as JSON"
3. Check downloaded file

**Expected Results:**
- File downloads with name `compendium-backup-[timestamp].json`
- File contains valid JSON structure
- JSON includes version, exportDate, progress, theme, achievements, and notes
- File can be re-imported successfully

**Status:** [ ] Pass [ ] Fail

---

### Test 3: Export Notes as CSV

**Steps:**
1. Open Export modal
2. Click "📊 Export Notes as CSV"
3. Open downloaded file in a spreadsheet application

**Expected Results:**
- File downloads with name `compendium-notes-[timestamp].csv`
- File has two columns: "Guide ID" and "Notes"
- Each guide with notes appears as one row
- Notes with special characters are properly escaped
- File opens correctly in Excel, Google Sheets, or similar

**Status:** [ ] Pass [ ] Fail

---

### Test 4: Export Progress as CSV

**Steps:**
1. Open Export modal
2. Click "📈 Export Progress as CSV"
3. Open downloaded file in a spreadsheet application

**Expected Results:**
- File downloads with name `compendium-progress-[timestamp].csv`
- File has columns: "Guide ID", "Completed", "Pages Read", "Last Updated"
- Completed guides show "Yes" in Completed column
- File opens correctly in spreadsheet software
- Can be used for statistics and analysis

**Status:** [ ] Pass [ ] Fail

---

### Test 5: Export Notes as Markdown

**Steps:**
1. Open Export modal
2. Click "📝 Export Notes as Markdown"
3. Open downloaded file in text editor

**Expected Results:**
- File downloads with name `compendium-notes-[timestamp].md`
- File is valid Markdown format
- Contains title "Survival Compendium - Notes Export"
- Each guide is a level-2 heading (`##`)
- Notes appear under corresponding guide headings
- File renders correctly in Markdown viewers

**Status:** [ ] Pass [ ] Fail

---

### Test 6: Backup Reminder Appears

**Steps:**
1. Open browser DevTools (F12)
2. Open Console
3. Execute: `localStorage.setItem('compendium-last-export-date', new Date(Date.now() - 35*24*60*60*1000).toISOString())`
4. Reload the page
5. Look for backup reminder banner

**Expected Results:**
- Warning banner appears at top of page (below filter bar)
- Banner shows "⚠️ Your last backup was 35 days ago..."
- "Backup Now" button is visible and functional
- "Dismiss" button hides the banner
- Banner styling matches app theme

**Status:** [ ] Pass [ ] Fail

---

### Test 7: Backup Reminder - First Time

**Steps:**
1. Open browser DevTools (F12)
2. Clear localStorage: `localStorage.clear()`
3. Reload page
4. Look for backup reminder

**Expected Results:**
- Backup reminder appears for first-time users
- Message says "⚠️ Your reading progress has never been backed up..."
- "Backup Now" button works
- Can access export functionality from banner

**Status:** [ ] Pass [ ] Fail

---

### Test 8: Auto-Backup to IndexedDB

**Steps:**
1. Open browser DevTools (F12)
2. Go to Application tab
3. Expand "IndexedDB" in left sidebar
4. Look for "compendium-backup" database
5. Mark a guide as completed
6. Check IndexedDB again

**Expected Results:**
- "compendium-backup" database exists
- Database contains "backups" object store
- New backup entry appears after marking guide as completed
- Backup entry has data and timestamp fields
- Backup can be viewed in DevTools

**Status:** [ ] Pass [ ] Fail

---

### Test 9: Restore from IndexedDB

**Steps:**
1. Ensure some progress and notes are saved
2. Open DevTools
3. Clear localStorage: `localStorage.clear()`
4. Reload the page
5. Check for restore modal

**Expected Results:**
- Restore modal appears automatically
- Modal shows the date of available backup
- "Restore" button is present
- Clicking "Restore" recovers all data
- Page reloads and shows restored progress

**Status:** [ ] Pass [ ] Fail

---

### Test 10: Modal Closes Properly

**Steps:**
1. Open Export modal
2. Click outside the modal (on the overlay)
3. Try again and click Cancel button

**Expected Results:**
- Modal closes when clicking overlay
- Modal closes when clicking Cancel button
- Can open Export modal again after closing
- No console errors appear

**Status:** [ ] Pass [ ] Fail

---

### Test 11: Last Export Date Updates

**Steps:**
1. Open DevTools Console
2. Check: `localStorage.getItem('compendium-last-export-date')`
3. Note the timestamp
4. Export data (any format)
5. Check again: `localStorage.getItem('compendium-last-export-date')`

**Expected Results:**
- First check shows old date or null
- Second check shows current date/time
- Timestamp is ISO format
- Each export updates the date

**Status:** [ ] Pass [ ] Fail

---

### Test 12: Import Still Works

**Steps:**
1. Create a JSON backup using new export
2. Clear some localStorage data
3. Click "📥 Import Progress"
4. Select the JSON backup file
5. Verify data is restored

**Expected Results:**
- Import dialog opens
- Can select JSON file
- Data is imported correctly
- Page reloads with restored data
- Backward compatibility maintained

**Status:** [ ] Pass [ ] Fail

---

### Test 13: Mobile/Responsive

**Steps:**
1. Open in mobile browser or use DevTools responsive mode
2. Click "📤 Export" button
3. Test modal on small screen
4. Test all export options

**Expected Results:**
- Modal is readable on small screens
- Buttons are easy to tap
- Modal scrolls if necessary
- All functionality works on mobile
- No layout breaks

**Status:** [ ] Pass [ ] Fail

---

### Test 14: Accessibility

**Steps:**
1. Use keyboard to navigate
2. Tab through modal buttons
3. Test screen reader (if available)
4. Check ARIA attributes

**Expected Results:**
- All buttons are keyboard-accessible
- Tab order is logical
- Modal has proper ARIA attributes
- Screen reader announces modal correctly
- Buttons have proper labels

**Status:** [ ] Pass [ ] Fail

---

### Test 15: Error Handling

**Steps:**
1. Test with corrupted backup file (import)
2. Disable IndexedDB in DevTools settings
3. Export and save anyway
4. Check console for errors

**Expected Results:**
- Import shows error message for invalid file
- App doesn't crash if IndexedDB unavailable
- Warning messages appear in console
- App continues to function

**Status:** [ ] Pass [ ] Fail

---

## Summary

Total Passed: ___/15

### Issues Found:

(List any failing tests or issues discovered)

---

## Sign-Off

Tested by: ________________
Date: ________________
Browser: ________________
Notes: ________________
