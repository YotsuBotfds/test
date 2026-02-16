# PWA Features Quick Start Guide

## What Was Enhanced?

The Survival Compendium now has world-class PWA features for better installation, updates, and discovery.

## Key Features Enabled

### 1. Custom Install Banner
When users visit on a supported browser (Chrome, Edge, Opera, Samsung Internet):
- Attractive banner appears with app icon and description
- "Install" button triggers system install flow
- "Dismiss" button hides banner for 7 days
- Success toast appears after installation

### 2. Update Detection & Notification
- App automatically checks for updates every 24 hours
- When new service worker is available, update banner appears
- "Update Now" button refreshes with new version
- Banner auto-dismisses after 8 seconds if not interacted

### 3. App Shortcuts
Users can create homescreen shortcuts for:
- **Search Guides** - Quick access to guide search
- **Random Guide** - Jump to random survival guide
- **Tools** - Access interactive survival tools

### 4. Share Integration
App can receive shared URLs from other apps:
- Share button in user's app menu
- Auto-opens shared URL in the app
- Configured via share_target in manifest

### 5. App Store Listings
Screenshots prepared for:
- App stores showing narrow (phone) layout
- Wide (tablet) layout for responsive display

## For Developers

### Access PWA Functions

The PWA module is exported as `pwa` in app.js:

```javascript
// Manually check for updates
const hasUpdates = await pwa.checkForUpdates();

// Check if install is available
const canInstall = await pwa.canPromptForInstall();

// Trigger manual install prompt
const installed = await pwa.promptInstall();
```

### Monitor PWA Events

Browser events are automatically handled:
- `beforeinstallprompt`: Custom banner shows
- `appinstalled`: Success toast appears
- Service worker updates: Update banner triggers

### Customize Banner Text

Edit `js/pwa.js` showInstallBanner() function:
```javascript
banner.querySelector('.pwa-banner-title').textContent = 'Your Title';
banner.querySelector('.pwa-banner-description').textContent = 'Your Description';
```

### Modify Dismissal Period

In `js/pwa.js`, adjust DISMISS_DURATION constant:
```javascript
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
```

### Change Update Check Interval

In `js/pwa.js`, adjust SW_UPDATE_CHECK_INTERVAL:
```javascript
const SW_UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
```

## What Users See

### First Visit (Install-capable Browser)
1. Page loads normally
2. Install banner slides in from top
3. User can click Install → system install flow
4. Or dismiss → won't see again for 7 days
5. After install → success toast appears

### When App Updates
1. User sees "Update Available" banner at top
2. Can click "Update Now" to reload with new version
3. Or dismiss and update later
4. Banner auto-hides after 8 seconds if not touched

### On Home Screen
After installation, users see:
- App icon
- App name: "ZTH Survival"
- Quick access to:
  - App home
  - Search section
  - Random guide
  - Tools

## Files to Know

- **manifest.json** - App metadata, shortcuts, screenshots
- **js/pwa.js** - All PWA logic and UI
- **css/main.css** - Banner and toast styling (lines 3889+)
- **js/app.js** - Calls pwa.init() early in startup

## Testing in Development

### Test Install Banner
1. Open DevTools (F12)
2. Go to Application → Manifest
3. Click "Add to home screen" button
4. Or just trigger beforeinstallprompt event

### Test Update Detection
1. Modify `sw.js` slightly (add comment)
2. Service worker will update
3. Update banner should appear

### Responsive Testing
Use DevTools device toolbar:
- Portrait phone (< 480px)
- Tablet (480px-768px)
- Desktop (> 768px)

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Install Prompt | 68+ | - | - | 79+ |
| App Installed | 68+ | - | - | 79+ |
| Shortcuts | 84+ | - | - | 84+ |
| Share Target | 89+ | 71+ | - | 89+ |
| Service Worker | All | 44+ | 11.1+ | All |

## Troubleshooting

### Install Banner Not Showing
- Browser must support beforeinstallprompt
- Use Chrome, Edge, Opera, or Samsung Internet
- App must be served over HTTPS
- Make sure manifest.json is linked in index.html

### Update Banner Not Showing
- Service worker must actually update
- Changes to sw.js trigger updates
- Check browser console for SW logs
- May take up to 24 hours for auto-check

### Banner Styling Issues
- Check CSS at `/css/main.css` lines 3889+
- Verify CSS variable names (--accent, --surface, etc.)
- Test responsive breakpoints: 768px and 480px

## Performance Notes

- PWA module: ~313 lines, minimal impact
- No external dependencies
- All async/event-driven
- Doesn't block page rendering
- LocalStorage used for dismissal tracking

## Security

- No sensitive data collected
- Dismissal state stored in localStorage only
- No analytics or tracking
- Share target validates URL parameters
- Content Security Policy compatible

## Next Steps

1. Test installation on real device
2. Monitor user adoption metrics
3. Plan update rollout strategy
4. Consider PWA-specific analytics
5. Optimize app store screenshots

For more details, see PWA_ENHANCEMENT_SUMMARY.md
