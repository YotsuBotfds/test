#!/usr/bin/env node
// PWA verification (DESIGN §9): service worker install, precache, offline reload.
//
//   node brass-ballast/tests/pwa-check.cjs [--keep-precache] [--shots <dir>]
//
// Regenerates precache-manifest.js (unless --keep-precache), serves the game, opens
// index.html?sw=1&debug=1, waits for the worker to activate and take control, verifies the
// cache holds index.html and js/main.js under the version in precache-manifest.js, then goes
// offline and reloads. Prints a JSON verdict. Exit 1 on any failed check or page error.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    const root = execFileSync('npm', ['root', '-g']).toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

const argv = process.argv.slice(2);
const keepPrecache = argv.includes('--keep-precache');
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
const GAME_ROOT = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!keepPrecache) {
    execFileSync(process.execPath, [path.join(GAME_ROOT, 'tools', 'gen-precache.mjs')], {
      // Keep stdout clean: it carries only the JSON verdict.
      stdio: ['ignore', process.stderr, process.stderr],
    });
  }

  const { startServer } = await import(path.join(GAME_ROOT, 'tools', 'serve.mjs'));
  const srv = await startServer({});
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));

  const checks = [];
  const check = (name, ok, detail = null) => checks.push({ name, ok: !!ok, detail });
  const shot = async (label) => {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    await page.screenshot({ path: path.join(shotsDir, `${label}.png`) }).catch(() => {});
  };

  const verdict = { ok: false, url: '', checks, pageErrors, consoleErrors, failedRequests };
  try {
    const manifestSrc = fs.readFileSync(path.join(GAME_ROOT, 'precache-manifest.js'), 'utf8');
    const expectedVersion = (manifestSrc.match(/version:\s*'([0-9a-f]+)'/) || [])[1];
    check('precache-manifest.js has a version', !!expectedVersion, expectedVersion);
    const expectedCache = `brass-ballast-${expectedVersion}`;

    verdict.url = `${srv.url}index.html?sw=1&debug=1`;
    await page.goto(verdict.url, { waitUntil: 'load', timeout: 30000 });

    // Call initPWA ourselves in case main.js does not (it is idempotent).
    await page.evaluate(async () => {
      const m = await import('./js/pwa.js');
      m.initPWA();
    });

    const registered = await page
      .waitForFunction(
        () => navigator.serviceWorker.ready.then(() => true),
        null,
        { timeout: 20000, polling: 250 }
      )
      .then(() => true)
      .catch(() => false);
    check('service worker becomes ready', registered);

    // The first worker takes control via clients.claim(); wait for it so the offline reload
    // is served by the worker and not the network.
    const controlled = await page
      .waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
        timeout: 15000,
        polling: 200,
      })
      .then(() => true)
      .catch(() => false);
    check('page is controlled by the service worker', controlled);

    const cacheInfo = await page.evaluate(async () => {
      const names = await caches.keys();
      const mine = names.filter((n) => n.startsWith('brass-ballast-'));
      const out = { names: mine, index: false, main: false, count: 0 };
      for (const n of mine) {
        const c = await caches.open(n);
        const keys = (await c.keys()).map((r) => new URL(r.url).pathname);
        out.count = keys.length;
        out.index = keys.some((k) => k.endsWith('/index.html') || k === '/');
        out.main = keys.some((k) => k.endsWith('/js/main.js'));
      }
      return out;
    });
    check(
      `cache ${expectedCache} is the only brass-ballast cache`,
      cacheInfo.names.length === 1 && cacheInfo.names[0] === expectedCache,
      cacheInfo.names.join(', ') || 'none'
    );
    check('cache holds index.html', cacheInfo.index);
    check('cache holds js/main.js', cacheInfo.main);
    verdict.cache = { ...cacheInfo, expected: expectedCache };
    await shot('pwa-online');

    // Offline reload: navigation must come from the cached shell.
    await context.setOffline(true);
    let reloadOk = true;
    try {
      await page.reload({ waitUntil: 'load', timeout: 20000 });
    } catch (e) {
      reloadOk = false;
      check('offline reload completes', false, e.message.split('\n')[0]);
    }
    if (reloadOk) check('offline reload completes', true);
    await sleep(1200);

    const offline = await page.evaluate(() => ({
      title: document.title,
      hasCanvas: !!document.getElementById('game'),
      mainLoaded: performance
        .getEntriesByType('resource')
        .some((e) => e.name.endsWith('/js/main.js')),
      controlled: navigator.serviceWorker.controller !== null,
    })).catch((e) => ({ error: e.message }));
    verdict.offline = offline;
    check('document.title survives offline', offline.title === 'Brass & Ballast', offline.title);
    check('game canvas present offline', offline.hasCanvas);
    check('js/main.js loaded offline', offline.mainLoaded);
    await shot('pwa-offline');

    await context.setOffline(false);
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    check(
      'no console errors',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | ') || null
    );
    verdict.ok = checks.every((c) => c.ok);
  } catch (e) {
    check('harness ran to completion', false, e.message.split('\n')[0]);
    verdict.ok = false;
  } finally {
    await context.setOffline(false).catch(() => {});
    await browser.close().catch(() => {});
    await srv.close();
  }
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
