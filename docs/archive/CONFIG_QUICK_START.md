# Environment Config Quick Start

## What Was Added

Three new configuration components for the Survival App to manage environment-specific settings:

1. **js/config.js** - Main configuration ES6 module (230 lines)
2. **config/dev.json** - Development environment settings
3. **config/prod.json** - Production environment settings
4. **Updated app.js** - Integrated config system throughout
5. **Updated dev-server.js** - Sets X-Environment header

## Quick Test

Run the development server:
```bash
npm run dev
```

Then in browser console:
```javascript
// Check current environment
window.__APP_DEBUG__

// Check full config
window.__APP_CONFIG__

// See environment CSS class
document.documentElement.className
```

## Environment Detection

Automatically detects based on hostname:

| Hostname | Environment |
|----------|-------------|
| localhost, 127.0.0.1 | dev |
| 192.168.x.x, 10.x.x.x | dev |
| Contains "staging" | staging |
| Contains "stage" | staging |
| Contains "test" | staging |
| Everything else | production |

## What's Different

### Development (localhost)
- Service worker: **OFF** (prevent caching issues)
- Logging: **VERBOSE** (all debug messages shown)
- Cache busting: **ON** (always get fresh files)
- Console: **FULL DEBUG** (window.__APP_DEBUG__ available)

### Production
- Service worker: **ON** (offline functionality)
- Logging: **MINIMAL** (errors only)
- Cache busting: **OFF** (optimize performance)
- Console: **CLEAN** (minimal output)

## Using Config in Your Code

```javascript
import * as config from './config.js';

// Check environment
if (config.isDev()) {
  // Dev-only code
}

// Conditional logging
config.log('error', 'Something failed', error);
config.debug('Debug info', { key: value });

// Service worker control
if (config.shouldUseServiceWorker()) {
  // Register service worker
}

// Cache busting
const url = config.withCacheBuster('/data/guides.json');
```

## Available Functions

```javascript
getConfig()              // Full config object
isDev()                  // Boolean - dev environment?
isProd()                 // Boolean - production?
isStaging()              // Boolean - staging?
isDebug()                // Boolean - debug mode?
getEnvironment()         // Returns 'dev'/'staging'/'production'
getLogLevel()            // Returns log level string
shouldUseServiceWorker() // Boolean - register SW?
shouldBustCache()        // Boolean - add cache buster?
withCacheBuster(url)     // Add cache buster to URL
log(level, msg, data)    // Conditional log
debug(msg, data)         // Debug-only log
initialize()             // Called by app.js automatically
```

## Log Levels

- **debug** - Detailed diagnostics (dev only)
- **info** - Informational messages
- **warn** - Warning messages
- **error** - Error messages

Dev shows all levels, production shows errors only.

## CSS Classes for Styling

Document element gets environment class:

```css
/* Development indicator */
.env-dev {
  /* Dev-specific styles */
}

.env-staging {
  /* Staging-specific styles */
}

.env-production {
  /* Production-specific styles */
}
```

## Viewing Debug Info

### In Development Console:

```javascript
// Full configuration
window.__APP_CONFIG__
// Output: { debug: true, serviceWorker: false, logLevel: 'debug', ... }

// Environment flags
window.__APP_DEBUG__
// Output: { isDev: true, isProd: false, isStaging: false, isDebug: true, ... }

// Current environment
config.getEnvironment()
// Output: 'dev'
```

### Console Log Format:

```
[2026-02-15T06:25:30] [DEBUG] Message here
[2026-02-15T06:25:31] [ERROR] Error message here
```

## Common Tasks

### Disable Logging in Dev
Edit `config/dev.json`:
```json
{ "logLevel": "error" }  // Only show errors
```

### Test Service Worker in Dev
Edit `config/dev.json`:
```json
{ "serviceWorker": true }  // Enable for testing
```

### Disable Service Worker in Production
Edit `config/prod.json` (not recommended):
```json
{ "serviceWorker": false }
```

## Files Changed

- Created: `/sessions/sweet-great-darwin/mnt/survival-app/js/config.js` (230 lines)
- Created: `/sessions/sweet-great-darwin/mnt/survival-app/config/dev.json`
- Created: `/sessions/sweet-great-darwin/mnt/survival-app/config/prod.json`
- Modified: `js/app.js` (added config import + 15 log/debug calls)
- Modified: `scripts/dev-server.js` (added X-Environment header)

## Next Steps

1. Other modules can import and use config:
   ```javascript
   import * as config from './config.js';
   ```

2. Replace any `console.log()` calls with `config.debug()` or `config.log()`

3. Add conditional logic for environment-specific features

4. Use `config.withCacheBuster()` for cache-sensitive resources

## Support

All exports and functions are documented in `/sessions/sweet-great-darwin/mnt/survival-app/ENVIRONMENT_CONFIG_IMPLEMENTATION.md`
