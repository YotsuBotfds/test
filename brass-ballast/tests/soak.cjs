#!/usr/bin/env node
// Soak-test matrix: runs tests/smoke.cjs across stages, bosses, modes and viewports with the
// autopilot and aggregates the results.
//
//   node brass-ballast/tests/soak.cjs [--out <dir>] [--only name1,name2] [--jobs 2] [--scale 1]
//
// Writes <out>/<name>/*.png screenshots and <out>/summary.json; prints a compact table.
// Exit code 1 if any config produced page errors or console errors.

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const BOSSES = ['ironMatriarch', 'kraken', 'stormEngine', 'behemoth', 'sunFurnace'];
const AP = 'debug=1&autostart=1&autopilot=1';

/** name → harness args. `seconds` is wall clock; speed=N fast-forwards game time. */
const CONFIGS = [
  { name: 'campaign-s1', query: `${AP}&speed=2`, seconds: 90 },
  ...[2, 3, 4, 5].map((n) => ({ name: `stage-${n}`, query: `${AP}&stage=${n}&level=${4 + n * 3}&god=1&speed=2`, seconds: 60 })),
  ...BOSSES.map((b, i) => ({ name: `boss-${b}`, query: `${AP}&boss=${b}&stage=${i + 1}&level=${6 + i * 3}&god=1&speed=2`, seconds: 60 })),
  { name: 'endless', query: `${AP}&mode=endless&god=1&speed=3&level=6`, seconds: 70 },
  { name: 'bossRush', query: `${AP}&mode=bossRush&god=1&speed=3&level=12`, seconds: 70 },
  { name: 'daily', query: `${AP}&mode=daily&god=1&speed=2`, seconds: 45 },
  { name: 'coop', query: `${AP}&god=1&speed=2`, seconds: 45, evalAt: ['3:BB.debug.addPlayer()'] },
  { name: 'build-max', query: `${AP}&god=1&stage=3&level=20&aux=teslaCoil:5,rocketPods:5,gyroSaws:5,mineLayer:5&passives=boiler:1,explosiveTips:1,bigBore:1,extraBallast:1`, seconds: 45 },
  { name: 'mobile-land', query: `${AP}&speed=2`, seconds: 35, viewport: '844x390', mobile: true },
  { name: 'mobile-port', query: `${AP}&speed=2`, seconds: 35, viewport: '390x844', mobile: true },
  { name: 'title', query: 'debug=1', seconds: 12 },
  { name: 'victory', query: `${AP}&god=1`, seconds: 20, evalAt: ['6:BB.debug.win()'] },
  { name: 'defeat', query: `${AP}`, seconds: 20, evalAt: ['6:BB.debug.lose()'] },
];

function parse(argv) {
  const a = { out: null, only: null, jobs: 2, scale: 1 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--out') a.out = argv[++i];
    else if (k === '--only') a.only = argv[++i].split(',');
    else if (k === '--jobs') a.jobs = Number(argv[++i]);
    else if (k === '--scale') a.scale = Number(argv[++i]);
  }
  a.out ||= path.join(require('os').tmpdir(), `bb-soak-${Date.now()}`);
  return a;
}

function runOne(cfg, out, scale) {
  return new Promise((resolve) => {
    const dir = path.join(out, cfg.name);
    const seconds = Math.max(8, Math.round(cfg.seconds * scale));
    const args = [
      path.join(__dirname, 'smoke.cjs'),
      '--query', cfg.query,
      '--seconds', String(seconds),
      '--shots', dir,
      '--shot-every', String(Math.max(5, Math.round(seconds / 4))),
      '--quiet',
    ];
    if (cfg.viewport) args.push('--viewport', cfg.viewport);
    if (cfg.mobile) args.push('--mobile');
    for (const e of cfg.evalAt || []) args.push('--eval-at', e);
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      let report = null;
      try {
        report = JSON.parse(stdout);
      } catch {
        report = { parseError: true, stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 2000) };
      }
      resolve({ name: cfg.name, code, query: cfg.query, seconds, report });
    });
  });
}

(async () => {
  const a = parse(process.argv);
  fs.mkdirSync(a.out, { recursive: true });
  const queue = CONFIGS.filter((c) => !a.only || a.only.includes(c.name));
  const results = [];
  let idx = 0;
  const worker = async () => {
    while (idx < queue.length) {
      const cfg = queue[idx++];
      const r = await runOne(cfg, a.out, a.scale);
      results.push(r);
      const rep = r.report || {};
      const dr = rep.debugReport || {};
      const line = [
        r.name.padEnd(20),
        `page:${(rep.pageErrors || []).length}`,
        `err:${(rep.consoleErrors || []).length}`,
        `warn:${(rep.consoleWarnings || []).length}`,
        `404:${(rep.failedRequests || []).length}`,
        `state:${dr.state ?? '?'}`,
        `fps:${dr.fps ?? '?'}`,
        `stage:${dr.run?.stage ?? '?'}`,
        `wave:${dr.run?.wave ?? '?'}`,
        `lvl:${dr.run?.level ?? '?'}`,
        `kills:${dr.run?.kills ?? '?'}`,
        `dir:${dr.director ?? '?'}`,
      ].join('  ');
      console.log(line);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, a.jobs) }, worker));
  results.sort((x, y) => queue.findIndex((c) => c.name === x.name) - queue.findIndex((c) => c.name === y.name));
  fs.writeFileSync(path.join(a.out, 'summary.json'), JSON.stringify(results, null, 2));
  console.log(`\nsummary: ${path.join(a.out, 'summary.json')}`);
  const bad = results.filter((r) => (r.report?.pageErrors || []).length || (r.report?.consoleErrors || []).length || r.report?.parseError);
  process.exit(bad.length ? 1 : 0);
})();
