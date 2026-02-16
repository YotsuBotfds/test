# Practice Mode / Skill Checklist Implementation

## Overview

A comprehensive practice mode has been added to the survival app, allowing users to track hands-on physical skills separately from reading progress. This enables learners to distinguish between "I read about this skill" and "I've actually done this in real life."

## Features Implemented

### 1. Practice Mode Module (`js/practice-mode.js`)

A new ES6 module providing complete practice tracking functionality:

**Core Functions:**
- `init()` - Initializes the practice mode system
- `markPracticed(guideId, notes)` - Mark a skill as practiced with optional notes
- `unmarkPracticed(guideId)` - Remove practiced status
- `getPracticeStatus(guideId)` - Get practice data for a specific guide
- `getAllPracticed()` - Get all practiced guides
- `getPracticeCount()` - Get count of practiced guides
- `getPracticeNotes(guideId)` - Get notes for a practiced guide
- `setPracticeNotes(guideId, notes)` - Update notes for a practiced guide
- `clearAllPractice()` - Clear all practice data
- `filterByPracticeStatus(cards, filterType)` - Filter cards by practice status
- `getPracticeStats()` - Get overall practice statistics

**Data Storage:**
- Stored in localStorage with key prefix `compendium-practice`
- Format: `{ guideId: { practiced: boolean, practiceDate: ISO string, notes: string } }`
- Dates stored in ISO format for consistency
- Notes are sanitized to prevent XSS

### 2. Card UI Updates (`js/cards.js`)

Updated card rendering to support practice tracking:
- Imported `practiceMode` module
- Cards now dispatch events for practice listeners to attach

### 3. Filter System Updates (`js/ui.js`)

Enhanced filter buttons to support practice filtering:
- Added practice mode import
- New filter types:
  - `practiced` - Shows only guides marked as practiced
  - `unpracticed` - Shows only guides not yet practiced
- Filters work alongside existing read/unread and difficulty filters

### 4. Practice Button UI

Added visual practice indicator button on each card:

**Button Styling:**
- Location: Bottom-left of card (complements share button on bottom-right)
- Unpracticed state: `🔨` (hammer icon) - suggests "hands-on work"
- Practiced state: `✋` (hand icon) - indicates hands-on experience
- Green highlight (#53d8a8) when practiced
- Subtle hover effects with scaling
- Accessible with proper ARIA labels

**CSS Classes:**
- `.practice-btn` - Main button container
- `.practice-btn.practiced` - Applied when skill is marked as practiced
- `.practice-icon` - Icon container
- Dark theme compatible
- Respects reduced-motion preferences

### 5. App Initialization (`js/app.js`)

- Added practice mode import
- Integrated initialization call in `initializeApp()`
- Runs after cards are rendered for proper event binding

### 6. CSS Styling (`css/main.css`)

Comprehensive styling for practice mode UI:
- Practice button styling with color differentiation
- Practiced state uses success color (#53d8a8)
- Hover states with scale transform (1.05x)
- Active state with scale down (0.95x)
- Smooth transitions (0.2s)
- Print-friendly (button not visible in print)
- Reduced motion support

### 7. Filter Button (`index.html`)

Added "🔨 Practiced" filter button to the filter bar for easy access to practice tracking features.

## Data Structure

Practice data is stored as:
```javascript
{
  "guide-id": {
    "practiced": true,
    "practiceDate": "2024-02-15T10:30:00.000Z",
    "notes": "Successfully made a fire using bow drill method"
  },
  "another-guide": {
    "practiced": false
  }
}
```

## Usage

### For Users

1. **Mark a Skill as Practiced:**
   - Click the `🔨` icon on any guide card
   - Icon changes to `✋` with green highlight
   - Timestamp automatically recorded

2. **View Practiced Skills:**
   - Click the "🔨 Practiced" filter button
   - Shows only guides you've actually practiced

3. **Add Practice Notes:**
   - Via JavaScript API: `practiceMode.setPracticeNotes(guideId, "note text")`
   - Notes are sanitized and stored with practice data

4. **View Statistics:**
   - Use `practiceMode.getPracticeStats()` in console to see:
     - Total guides
     - Total practiced
     - Percentage practiced
     - Recent practice (last 7 days)
     - This week's practice

### For Developers

```javascript
// Import the module
import * as practiceMode from './practice-mode.js';

// Mark a guide as practiced
practiceMode.markPracticed('fire-starting-guide', 'Successfully lit fire with bow drill');

// Check if practiced
const status = practiceMode.getPracticeStatus('fire-starting-guide');
if (status?.practiced) {
  console.log('Practiced on:', status.practiceDate);
}

// Get all practiced guides
const practiced = practiceMode.getAllPracticed();

// Get statistics
const stats = practiceMode.getPracticeStats();
console.log(`${stats.totalPracticed}/${stats.totalGuides} guides practiced (${stats.percentagePracticed}%)`);

// Filter functionality
practiceMode.filterByPracticeStatus(cardElements, 'practiced');
```

## Visual Design Choices

1. **Icon Differentiation:**
   - `🔨` (hammer) for unpracticed - suggests work to be done
   - `✋` (hand) for practiced - indicates hands-on completion
   - Clear visual distinction from read status

2. **Color Scheme:**
   - Success green (#53d8a8) for practiced state
   - Matches achievement/completion theme
   - Maintains accessibility contrast ratios

3. **Position:**
   - Bottom-left of cards (opposite share button)
   - Easy to find consistently
   - Doesn't interfere with other card elements

4. **Separation from Reading Progress:**
   - Separate button from read checkmark
   - Distinct storage and filtering
   - Users can track both independently

## Storage & Persistence

- Data persists across browser sessions via localStorage
- Separate from reading progress (`compendium-progress`)
- Can be exported/imported if import-export system is expanded
- Automatically cleared via `clearAllPractice()` for full reset

## Browser Compatibility

- Works in all modern browsers with localStorage support
- Gracefully degrades if localStorage unavailable
- No external dependencies

## Testing Recommendations

1. Mark various guides as practiced
2. Check filter "Practiced" shows correct guides
3. Verify icons change and persist on refresh
4. Test on mobile devices
5. Verify accessibility with screen readers
6. Check reduced-motion preferences are respected

## Future Enhancements

Potential additions:
1. Practice notes modal dialog
2. Practice log/timeline view
3. Integration with achievements system
4. Streak tracking (consecutive days practiced)
5. Practice reminders/notifications
6. Export practice log with dates and notes
7. Category-specific practice progress
8. Milestone badges for practice goals
