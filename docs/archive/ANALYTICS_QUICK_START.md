# Analytics Quick Start Guide

## For Users

### Accessing Your Analytics Dashboard

1. **Navigate to the Dashboard**
   - Click the "📊 Analytics" button in the tools bar (top right area)
   - Or navigate directly to `tools/stats.html`

2. **View Your Statistics**
   - **Quick Stats Grid**: See at-a-glance metrics about your learning
   - **Most Viewed Guides**: Bar chart showing your most-read guides
   - **Top Search Terms**: See what you search for most often
   - **Activity Heatmap**: Visual calendar of your daily usage (last 30 days)
   - **Achievements**: View all unlocked achievements with dates
   - **Session Statistics**: How long you spend learning

3. **Export Your Data**
   - Click "📥 Export Analytics" button
   - Downloads as JSON file to your computer
   - Great for personal records or analysis

4. **Clear Your Data**
   - Click "🗑️ Clear Analytics" button
   - Confirm the action (cannot be undone)
   - All tracking data is permanently deleted

## For Developers

### Using the Analytics API

```javascript
import * as analytics from './js/analytics.js';

// Analytics automatically initializes in app.js
// No additional setup needed!

// But if you need to track a custom event:
analytics.trackEvent('engagement', 'guide-view', 'fire-starting');
analytics.trackEvent('user-action', 'achievement-unlocked', 'master-survivalist');

// Get statistics programmatically:
const stats = analytics.getGuideStats();
const topSearches = analytics.getTopSearchTerms(10);
const sessions = analytics.getSessionStats();
const dailyUsage = analytics.getDailyUsageStats();
const loadTimes = analytics.getLoadStats();

// Manual achievement tracking:
analytics.trackAchievementUnlock('achievement-id');

// Export as JSON string:
const json = analytics.exportAnalyticsJSON();
console.log(json);

// Get all analytics data:
const allData = analytics.getAnalytics();
console.log(allData);

// Get storage size:
const sizeKB = analytics.getStorageSize() / 1024;
console.log(`Storage used: ${sizeKB}KB`);

// Clear everything:
analytics.clearAnalytics();
```

### What's Tracked Automatically

1. **Guide Views**
   - Tracked when user clicks on a guide card
   - Counts total views and tracks first/last viewed dates

2. **Search Terms**
   - Tracked when user types in search fields (min 2 characters)
   - Keeps track of frequency and first/last searched dates
   - Limited to last 100 unique terms

3. **Sessions**
   - Tracks page visibility (active/inactive time)
   - Records session duration and total page time
   - Keeps last 1000 sessions

4. **Daily Activity**
   - Records one entry per day when user is active
   - Keeps last 365 days
   - Used for activity heatmap

5. **Page Load Times**
   - Uses Performance API to measure load times
   - Keeps last 100 measurements
   - Useful for performance monitoring

6. **Achievements**
   - Records unlock timestamp for each achievement
   - Can be manually tracked via `trackAchievementUnlock()`

## Storage Locations

All data is stored in browser localStorage under these keys:

```
analytics-guide-views     // Guide view counts and dates
analytics-search-terms    // Search query history
analytics-achievements    // Achievement unlock dates
analytics-sessions        // Session duration data
analytics-daily-usage     // Daily activity dates
analytics-page-load       // Page load time measurements
```

## Privacy & Security

- **No External Servers**: All data stays on the user's device
- **No Tracking Services**: No Google Analytics, Mixpanel, etc.
- **User Controlled**: Users can clear data anytime
- **Transparent**: Dashboard shows exactly what's tracked
- **Offline**: Works completely without internet
- **No Cookies**: Uses only localStorage

## Troubleshooting

### "No data recorded yet" message
- This is normal on first visit
- Start using the app - click guides, search, spend time
- Check back later to see your activity

### Data not appearing in dashboard
- Try clicking "🔄 Refresh" button in dashboard
- Check that localStorage is enabled in browser
- Make sure you're not in private/incognito mode

### Want to disable analytics
- Open `js/app.js`
- Comment out line: `analytics.init();`
- Restart the app

### Lost my data
- If you cleared browser cache, localStorage is wiped
- To prevent loss, regularly use "📥 Export Analytics"
- Consider backing up your JSON export file

## Performance Notes

- **Minimal Impact**: Analytics adds <5ms overhead
- **Efficient Storage**: Aggregated data, not raw events
- **Auto-cleanup**: Old data automatically removed
- **No Blocking**: All tracking happens asynchronously

## Tips for Best Results

1. **Regular Exports**: Download your analytics as JSON monthly
2. **Review Trends**: Check your heatmap to see your learning patterns
3. **Track Progress**: Use the stats to motivate continued learning
4. **Export for Analysis**: Use exported JSON with spreadsheet tools
5. **Share Achievements**: Export stats to show your learning journey

## Questions?

The analytics module is self-contained and doesn't require external services. All functionality is built into the Survival Compendium and works completely offline.
