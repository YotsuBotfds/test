# CI/CD Quick Reference

## Local Build Commands

```bash
# View all available commands
make help

# Install dependencies
make install

# Development build and test
make build       # Build the app
make test        # Run tests
make dev         # Start dev server (http://localhost:8000)

# Quality checks
make check       # Check bundle sizes
make validate    # Validate HTML
make lint        # Run ESLint with auto-fix

# Full pipeline (like CI does)
make all         # install → build → validate → test → check

# Cleanup
make clean       # Remove dist/, build/, node_modules/
```

## CI/CD Workflows (Automatic)

### CI Pipeline (`.github/workflows/ci.yml`)
**Triggers:** Push to main OR Pull Request to main
**Steps:**
- Checkout → Node.js setup → Dependencies
- Build → CSS minify → Tests → HTML validate → Size check
- Artifact upload on failure

**Status:** Check GitHub Actions tab for results

### Deploy Pipeline (`.github/workflows/deploy.yml`)
**Triggers:** Push to main (after CI passes)
**Steps:**
- Checkout → Node.js setup → Dependencies
- Build → CSS minify → HTML validate → Size check → Deploy to Pages

**Status:** Check GitHub Actions tab and GitHub Pages settings

## Expected npm Scripts (from package.json)

```json
{
  "build": "node scripts/build.js",
  "build:css": "node scripts/minify-css.js",
  "build:validate": "node scripts/validate.js",
  "build:cache": "bash build.sh",
  "check-sizes": "node scripts/check-sizes.js",
  "dev": "npx serve . -l 8000",
  "test": "node tests/test-runner.js"
}
```

## File Locations

```
survival-app/
├── .github/workflows/
│   ├── ci.yml           (Runs on push/PR to main)
│   └── deploy.yml       (Runs on push to main)
├── Makefile             (Local build commands)
├── CI_CD_SETUP.md       (Full documentation)
├── CI_CD_QUICK_REFERENCE.md (This file)
├── package.json         (npm scripts)
├── build.sh             (Build script with exit codes)
└── ... (app files)
```

## Exit Codes

The CI pipeline will:
- **PASS** if all steps complete successfully
- **FAIL** if any step fails (except build:cache which is optional)
- **Upload artifacts** on failure for debugging (5-day retention)

## GitHub Pages Setup

To enable automatic deployment:

1. Go to repository Settings
2. Navigate to Pages section
3. Set source to `gh-pages` branch
4. Save

The deploy workflow creates the `gh-pages` branch automatically.

## Troubleshooting

### CI/CD not running?
- Check if branch is named `main` (not `master`)
- Verify GitHub Actions is enabled in Settings
- Check workflow files are in `.github/workflows/` directory

### Deploy not working?
- Ensure CI pipeline passes first
- Check GitHub Pages settings in repository
- Verify `GITHUB_TOKEN` has write permissions (automatic in Actions)

### Local build failing?
- Run `make clean && make install` to reset
- Check Node.js version: `node --version` (should be 18+)
- Check `npm --version` (should be recent)

### Bundle size checks failing?
- Review `.github/workflows/ci.yml` and `scripts/check-sizes.js`
- Adjust size budgets if needed
- Run `make check` locally to see current sizes

## Tips

- Use `make all` before pushing to catch issues locally
- Check GitHub Actions tab immediately after push
- Use `make clean` before major changes
- Keep `build.sh` exit codes intact for CI detection
