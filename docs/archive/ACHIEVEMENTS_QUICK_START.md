# Achievement System - Quick Start Guide

## What's New?

The achievement system has been completely revamped with 31 total achievements across 4 categories.

## Viewing Achievements

### Quick Modal View
- Click the **🏆 X/31** button in the toolbar
- Shows all achievements at a glance
- Locked achievements are dimmed
- Progress bars show current progress toward milestones

### Full Achievements Page
- Click the **📊 Stats** button next to the achievements button
- Navigate to `tools/achievements.html`
- View comprehensive statistics:
  - Total guides read
  - Categories explored
  - Current reading streak
  - Total achievements unlocked
- Share your achievements with a single click

## Achievement Categories

### Reading Milestones (8 achievements)
Progress through reading levels as you learn more:
- First Steps: 1 guide
- Student: 10 guides
- Eager Learner: 25 guides
- Scholar: 50 guides
- Knowledge Seeker: 75 guides
- Master: 100 guides
- Wisdom Collector: 150 guides
- Completionist: All guides

### Category Masters (9 achievements)
Complete all guides in a specific topic:
- Survivor: Critical guides
- Rebuilder: Civilization guides
- Field Medic: Medical guides
- Blacksmith: Crafts & manufacturing
- Engineer: Building & engineering
- Farmer: Agriculture & food
- Communications Expert: Communications
- Scientist: Science & research
- Defender: Security & defense

### Special Achievements (5 achievements)
- Explorer: Read from 5+ different categories
- Early Bird: Read 3 guides in one day
- Dedicated: Read for 7 consecutive days
- Week Warrior: Read for 14 consecutive days
- Month Master: Read for 30 consecutive days

### Content Creator (2 achievements)
- Scribe: Write notes on 10 guides
- Journalist: Write notes on 25 guides

## Tracking Your Progress

### Automatic Tracking
- **Reading Sessions**: Automatically logged by date
- **Reading Streaks**: Calculated from your daily activity
- **Progress**: Updated when you complete guides
- **Category Exploration**: Tracked as you read from different categories

### What Gets Tracked
1. **Guides Completed** - How many guides you've finished reading
2. **Categories Read** - Unique categories you've explored
3. **Daily Reading** - Whether you read guides each day
4. **Notes Written** - Guides where you've added notes
5. **Category Mastery** - Progress toward completing all guides in a category

## Tips for Unlocking Achievements

### To Maximize Progress:
1. **Read Across Categories** - Explore different topics to unlock Explorer
2. **Build Daily Habits** - Read a bit each day to build streaks
3. **Try Daily Challenges** - Read 3 guides on the same day for Early Bird
4. **Take Notes** - Add notes to guides to unlock Scribe achievements
5. **Deep Dive into Topics** - Complete entire categories for Master achievements

### Streak Tips:
- Streaks are based on calendar days
- Reading just 1 guide per day continues your streak
- Missing a day breaks the streak
- Open the achievements page to see your current streak
- Streaks can be reset with the Reset Progress button

## Sharing Your Achievements

### How to Share:
1. Go to the full Achievements page (click 📊 Stats)
2. Scroll to the "Share Your Progress" section
3. Click "Copy to Clipboard"
4. Paste into social media, email, or chat

### Share Preview:
```
I've unlocked X achievements in the Zero to Hero Survival Compendium! 🏆
📚 Read: X/185 guides
🔥 Current Streak: X days
Check out the compendium: https://example.com
```

## Data Stored Locally

### What Information is Saved:
- Which achievements you've unlocked
- When you unlocked each achievement
- Your daily reading history
- Current reading streak
- All your guide progress and notes

### Privacy:
- All data stored locally in your browser
- No data sent to servers
- Data persists across browser sessions
- Can be reset anytime with Reset Progress button

## Troubleshooting

### Achievements Not Unlocking?
1. Refresh the page
2. Ensure you've completed a guide (checkbox should show ✓)
3. Wait a moment - calculations happen in real-time
4. Check the modal or achievements page

### Streak Not Counting?
1. Make sure you're reading at least 1 guide per day
2. Missing a single day will break a streak
3. Streaks reset after a break but continue on next day
4. Check "Current Streak" on the achievements page

### Missing Data?
1. Check if you cleared browser data/cookies
2. Use Import Progress if you have a backup
3. Reset Progress will clear everything and start fresh

## API Reference for Developers

### Importing Functions:
```javascript
import * as achievements from './js/achievements.js';
```

### Key Functions:

#### Get Current Streak
```javascript
const streak = achievements.getCurrentStreak();
// Returns: number (days)
```

#### Get All Definitions
```javascript
const allAchievements = achievements.getAchievementDefs();
// Returns: Object with all 31 achievement definitions
```

#### Track Reading Session
```javascript
achievements.trackReadingSession(guideId);
// Called when a guide is completed
```

#### Check All Achievements
```javascript
achievements.checkAchievements(cards);
// Called to update and unlock achievements
// cards: NodeList of guide cards
```

#### Show Modal
```javascript
achievements.showAchievementsModal();
// Opens the quick view modal
```

#### Close Modal
```javascript
achievements.closeAchievementsModal();
// Closes the modal
```

## Files Modified/Created

| File | Purpose |
|------|---------|
| `js/achievements.js` | Core achievement logic (485 lines) |
| `tools/achievements.html` | Dedicated achievements page (680 lines) |
| `index.html` | Added Stats link button |
| `css/main.css` | Added progress indicator styles |

## Statistics to Track

On the achievements page, you can see:
- **Guides Read**: X out of 185 total
- **Categories Explored**: Number of different categories visited
- **Current Streak**: Days in a row of reading activity
- **Achievements Unlocked**: X out of 31 total

Each statistic has a progress bar showing your overall completion percentage.

## Next Steps

1. Start reading guides to unlock the first achievements
2. Visit the achievements page regularly to track progress
3. Try to build a reading streak
4. Explore different categories to unlock Explorer
5. Share your progress with others

Happy learning!
