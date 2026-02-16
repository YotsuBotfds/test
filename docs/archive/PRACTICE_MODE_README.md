# Practice Mode - Quick Reference

## What is This?

A new practice tracking feature that lets users track which survival skills they've **actually practiced in real life**, separate from guides they've just **read**.

## Quick Start

1. **View a guide card** - You'll see a new 🔨 button in the bottom-left corner
2. **Click the button** - Marks that skill as practiced
3. **See the change** - Icon changes to ✋ with green highlight
4. **Use the filter** - Click "🔨 Practiced" button to see all your practiced skills

## Key Files

### Core Implementation
- **`js/practice-mode.js`** (9.5 KB) - Main practice tracking module

### Documentation
- **`PRACTICE_MODE_IMPLEMENTATION.md`** - Technical documentation for developers
- **`PRACTICE_MODE_USER_GUIDE.md`** - User guide with tips and troubleshooting
- **`PRACTICE_MODE_CHECKLIST.md`** - Complete implementation checklist
- **`EXECUTION_SUMMARY_PRACTICE_MODE.md`** - Detailed execution summary

### Integration
- **`js/cards.js`** - Updated to support practice buttons
- **`js/ui.js`** - Updated to support practice filtering
- **`js/app.js`** - Updated to initialize practice mode
- **`css/main.css`** - Updated with practice button styling
- **`index.html`** - Updated with practice filter button

## Features

### Track Practice Separately
- Read status and practice status are independent
- Click 🔨 to mark a skill as practiced
- Timestamp automatically recorded

### Filter & Organize
- "🔨 Practiced" filter shows only practiced guides
- Works with all other existing filters
- Combines with read/unread status

### View Statistics
```javascript
// In browser console:
practiceMode.getPracticeStats()
// Shows: total guides, practiced count, percentage, recent practice, this week
```

### Add Notes (Optional)
```javascript
// Via console:
practiceMode.setPracticeNotes('guide-id', 'Successfully lit fire with bow drill');
```

## Data Storage

- **Storage Key:** `compendium-practice`
- **Persists:** Across browser sessions
- **Privacy:** All data stays in your browser
- **Separate:** From reading progress data

## Visual Design

### Unpracticed Skill
```
🔨 Gray button
Tooltip: "I've practiced this skill"
```

### Practiced Skill
```
✋ Green button (#53d8a8)
Tooltip: "Practiced on Feb 15, 2024"
```

## Browser Support

- Chrome, Firefox, Safari, Edge
- Requires localStorage
- ES6 module compatible
- No external dependencies

## Integration Points

### With Reading Progress
- Independent from "completed" status
- Users can read without practicing
- Users can practice multiple times

### With Filtering
- New filter: "🔨 Practiced"
- Works with existing filters
- "Practiced" shows only practiced guides

### With Storage
- Uses app's storage module
- Follows existing patterns
- Sanitized for security

## Common Use Cases

### "Show me skills I've practiced"
→ Click "🔨 Practiced" filter

### "How much have I practiced?"
→ Run `practiceMode.getPracticeStats()` in console

### "Log my fire-starting practice"
→ Click 🔨 on fire guide, it changes to ✋

### "Add notes about my practice"
→ Run `practiceMode.setPracticeNotes('guide-id', 'notes here')`

## API at a Glance

```javascript
import * as practiceMode from './practice-mode.js';

// Core functions
practiceMode.init()                          // Initialize
practiceMode.markPracticed('guide-id')       // Mark as practiced
practiceMode.unmarkPracticed('guide-id')     // Unmark
practiceMode.getPracticeStatus('guide-id')   // Get status
practiceMode.getAllPracticed()               // Get all practiced

// Additional functions
practiceMode.getPracticeCount()              // Count
practiceMode.getPracticeNotes('guide-id')    // Get notes
practiceMode.setPracticeNotes('guide-id', 'notes') // Set notes
practiceMode.clearAllPractice()              // Clear all
practiceMode.getPracticeStats()              // Statistics
practiceMode.filterByPracticeStatus(cards, 'practiced') // Filter cards
```

## Accessibility

- Keyboard accessible (Tab navigation)
- Screen reader friendly (ARIA labels)
- Focus visible
- Respects reduced motion preferences
- Proper color contrast

## Performance

- No blocking operations
- Fast localStorage access
- GPU-accelerated animations
- Minimal DOM overhead

## Security

- Notes sanitized for XSS protection
- No external API calls
- Data stays in browser
- Follows app's security patterns

## Troubleshooting

### Button not appearing?
- Refresh the page
- Check JavaScript is enabled
- Try a different browser

### Data not saving?
- Check if browser allows localStorage
- Try clearing cache and refreshing
- Check browser console for errors

### Filter not working?
- Make sure you clicked the button
- Refresh page if needed
- Check if guides match the filter criteria

## Want More?

- **Technical Details:** See `PRACTICE_MODE_IMPLEMENTATION.md`
- **User Tips:** See `PRACTICE_MODE_USER_GUIDE.md`
- **Implementation Details:** See `PRACTICE_MODE_CHECKLIST.md`
- **Execution Summary:** See `EXECUTION_SUMMARY_PRACTICE_MODE.md`

---

**Status:** Complete and production-ready ✓
**Files:** 4 new documentation files, 5 modified source files
**Testing:** All scenarios verified and working
