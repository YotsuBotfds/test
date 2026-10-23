#!/usr/bin/env node
// Headless Chromium smoke harness (DESIGN §10).
//
//   node brass-ballast/tests/smoke.cjs [--page index.html] [--query "autostart=1&debug=1"]
//     [--seconds 15] [--shots <dir>] [--shot-every 5] [--eval "<js>"]... [--eval-at <s>:<js>]...
//     [--viewport 1280x720] [--mobile] [--click-start] [--keys "<s>:<key>:<ms>"]... [--quiet]
//
// Prints a JSON report to stdout. Exit code 1 if the page threw uncaught errors.

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

function parseArgs(argv) {
  const a = {
    page: 'index.html',
    query: 'debug=1&nosw=1',
    seconds: 8,
    shots: null,
    shotEvery: 0,
    evals: [],
    evalAt: [],
    keys: [],
    viewport: '1280x720',
    mobile: false,
    clickStart: false,
    quiet: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--page') a.page = v();
    else if (k === '--query') a.query = v();
    else if (k === '--seconds') a.seconds = Number(v());
    else if (k === '--shots') a.shots = v();
    else if (k === '--shot-every') a.shotEvery = Number(v());
    else if (k === '--eval') a.evals.push(v());
    else if (k === '--eval-at') a.evalAt.push(v());
    else if (k === '--keys') a.keys.push(v());
    else if (k === '--viewport') a.viewport = v();
    else if (k === '--mobile') a.mobile = true;
    else if (k === '--click-start') a.clickStart = true;
    else if (k === '--quiet') a.quiet = true;
    else if (k === '--help' || k === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 9).join('\n'));
      process.exit(0);
    }
  }
  if (!/(^|&)nosw=/.test(a.query)) a.query += (a.query ? '&' : '') + 'nosw=1';
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const args = parseArgs(process.argv);
  const { startServer } = await import(path.join(__dirname, '..', 'tools', 'serve.mjs'));
  const srv = await startServer({});
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
  });
  const [vw, vh] = args.viewport.split('x').map(Number);
  const context = await browser.newContext({
    viewport: { width: vw, height: vh },
    deviceScaleFactor: args.mobile ? 2 : 1,
    hasTouch: args.mobile,
    isMobile: args.mobile,
  });
  const page = await context.newPage();
  const report = {
    url: '',
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    evals: [],
    shots: [],
    debugReport: null,
  };
  page.on('console', (msg) => {
    const t = msg.type();
    const text = msg.text();
    if (t === 'error') report.consoleErrors.push(text);
    else if (t === 'warning') report.consoleWarnings.push(text);
    else if (!args.quiet && /^\[(test|debug)\]/.test(text)) console.error(text);
  });
  page.on('pageerror', (err) => report.pageErrors.push(`${err.message}\n${err.stack || ''}`.slice(0, 2000)));
  page.on('requestfailed', (req) => report.failedRequests.push(`${req.url()} ${req.failure()?.errorText}`));
  page.on('response', (res) => {
    if (res.status() >= 400) report.failedRequests.push(`${res.status()} ${res.url()}`);
  });

  report.url = `${srv.url}${args.page}${args.query ? `?${args.query}` : ''}`;
  if (args.shots) fs.mkdirSync(args.shots, { recursive: true });
  const shot = async (label) => {
    if (!args.shots) return;
    const p = path.join(args.shots, `${label}.png`);
    await page.screenshot({ path: p });
    report.shots.push(p);
  };

  try {
    await page.goto(report.url, { waitUntil: 'load', timeout: 30000 });
  } catch (e) {
    report.pageErrors.push(`navigation: ${e.message}`);
  }
  await sleep(800);
  if (args.clickStart) {
    await page.mouse.click(vw / 2, vh / 2).catch(() => {});
  }
  for (const code of args.evals) {
    try {
      const r = await page.evaluate(code);
      report.evals.push({ code, result: r === undefined ? null : r });
    } catch (e) {
      report.evals.push({ code, error: e.message });
    }
  }

  const timed = args.evalAt.map((s) => {
    const i = s.indexOf(':');
    return { at: Number(s.slice(0, i)), code: s.slice(i + 1), done: false };
  });
  const keyEvents = args.keys.map((s) => {
    const [at, key, ms] = s.split(':');
    return { at: Number(at), key, ms: Number(ms || 300), done: false };
  });

  const start = Date.now();
  let nextShot = args.shotEvery > 0 ? args.shotEvery : Infinity;
  let shotIdx = 0;
  await shot('t0');
  while ((Date.now() - start) / 1000 < args.seconds) {
    const t = (Date.now() - start) / 1000;
    for (const ev of timed) {
      if (!ev.done && t >= ev.at) {
        ev.done = true;
        try {
          const r = await page.evaluate(ev.code);
          report.evals.push({ at: ev.at, code: ev.code, result: r === undefined ? null : r });
        } catch (e) {
          report.evals.push({ at: ev.at, code: ev.code, error: e.message });
        }
      }
    }
    for (const ke of keyEvents) {
      if (!ke.done && t >= ke.at) {
        ke.done = true;
        page.keyboard.down(ke.key).then(() => sleep(ke.ms)).then(() => page.keyboard.up(ke.key)).catch(() => {});
      }
    }
    if (t >= nextShot) {
      shotIdx++;
      await shot(`t${Math.round(t)}s`);
      nextShot += args.shotEvery;
    }
    await sleep(100);
  }
  await shot('final');
  try {
    report.debugReport = await page.evaluate(() =>
      window.BB && window.BB.debug && window.BB.debug.report ? window.BB.debug.report() : null
    );
  } catch (e) {
    report.debugReport = { error: e.message };
  }
  await browser.close();
  await srv.close();
  // Collapse repeated messages to keep reports readable.
  const collapse = (arr) => {
    const m = new Map();
    for (const s of arr) m.set(s, (m.get(s) || 0) + 1);
    return [...m].map(([s, n]) => (n > 1 ? `${s}  (×${n})` : s));
  };
  report.consoleErrors = collapse(report.consoleErrors);
  report.consoleWarnings = collapse(report.consoleWarnings);
  report.failedRequests = collapse(report.failedRequests);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pageErrors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
