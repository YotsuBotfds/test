#!/usr/bin/env node
// WP2 input verification against tests/preview/input.html in headless Chromium.
//   node brass-ballast/tests/input-check.cjs [--shots <dir>]
// Exercises keyboard, mouse, fake gamepads (hot-plug, join, menu repeat) and CDP multi-touch.
// Prints PASS/FAIL lines; exit 1 on any failure or page error.

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// Fake Gamepad API installed before page scripts run.
const FAKE_PADS = `
  (() => {
    const mk = (i) => ({ index: i, id: 'Fake Brass Pad ' + i, connected: true, mapping: 'standard',
      timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      vibrationActuator: { type: 'dual-rumble', playEffect: (t, o) => { (window.__rumbles ||= []).push([i, t, o]); return Promise.resolve('complete'); } } });
    const pads = [null, null, null, null];
    window.__pads = {
      plug(i) { pads[i] = mk(i); },
      unplug(i) { pads[i] = null; },
      btn(i, b, v) { const p = pads[i]; p.buttons[b] = { pressed: v > 0.5, value: v }; },
      axes(i, a) { pads[i].axes = a; },
    };
    navigator.getGamepads = () => pads.slice();
  })();
`;

async function frames(page, n = 3) {
  await page.evaluate((k) => new Promise((res) => {
    let c = 0;
    const f = () => (++c >= k ? res() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
}

const ctl = (page, i = 0) => page.evaluate((k) => JSON.parse(JSON.stringify(window.__inp.input.controls(k))), i);
const counts = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__inp.counts)));

(async () => {
  const { startServer } = await import(path.join(__dirname, '..', 'tools', 'serve.mjs'));
  const srv = await startServer({});
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  };
  const url = `${srv.url}tests/preview/input.html`;

  /* ---------------------------------- desktop ---------------------------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(FAKE_PADS);
    const page = await ctx.newPage();
    watch(page);
    await page.goto(url);
    await page.waitForFunction(() => window.__inp);
    await frames(page, 5);

    await page.keyboard.down('KeyD');
    await page.keyboard.down('KeyW');
    await frames(page);
    let c = await ctl(page);
    check('WASD diagonal normalized', Math.abs(c.moveX - 0.7071) < 0.01 && Math.abs(c.moveY + 0.7071) < 0.01, `${c.moveX},${c.moveY}`);
    check('first interaction fired', await page.evaluate(() => window.__inp.first));
    await page.keyboard.up('KeyW');
    await page.keyboard.down('ArrowLeft');
    await frames(page);
    c = await ctl(page);
    check('arrows aim+fire (keys mode)', c.aimMode === 'keys' && c.fire && c.aimX === -1 && c.device === 'kbm', JSON.stringify([c.aimMode, c.fire, c.aimX]));
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('KeyD');

    let before = await counts(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyE');
    await frames(page, 4);
    let after = await counts(page);
    check('Space → exactly one boost edge (read twice/frame)', after.p0.boost - before.p0.boost === 1, `${after.p0.boost - before.p0.boost}`);
    check('E → one bomb edge', after.p0.bomb - before.p0.bomb === 1);
    check('E → menu tabR edge', (after.menu.tabR || 0) - (before.menu.tabR || 0) === 1);

    await page.mouse.move(900, 500);
    await page.mouse.move(960, 520);
    await frames(page);
    c = await ctl(page);
    check('mouse aim → mouseWorld', c.aimMode === 'mouse' && c.mouseWorld && !c.fire, JSON.stringify(c.mouseWorld));
    await page.mouse.down();
    await frames(page);
    c = await ctl(page);
    check('LMB fires', c.fire === true);
    await page.mouse.up();
    before = await counts(page);
    await page.mouse.click(960, 520, { button: 'right' });
    await frames(page, 3);
    after = await counts(page);
    check('RMB → bomb edge', after.p0.bomb - before.p0.bomb === 1);

    // Menu edges with OS key-repeat
    before = await counts(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Backspace');
    await frames(page, 3);
    after = await counts(page);
    const md = (k) => (after.menu[k] || 0) - (before.menu[k] || 0);
    check('menu down/confirm/tabL/back edges', md('down') === 1 && md('confirm') === 1 && md('tabL') === 1 && md('back') === 1, JSON.stringify(after.menu));

    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, 'desktop-kbm.png') });

    // ----- gamepads
    await page.evaluate(() => window.__pads.plug(0));
    await frames(page, 3);
    let pads = await page.evaluate(() => window.__inp.input.pads.map((p) => [p.index, p.player]));
    check('pad 0 hot-plugged and auto-bound to P1', pads.length === 1 && pads[0][1] === 0, JSON.stringify(pads));
    await page.evaluate(() => window.__pads.axes(0, [0.1, 0.1, 0.9, 0]));
    await frames(page);
    c = await ctl(page);
    check('LS inside dead zone → no move', c.moveX === 0 && c.moveY === 0);
    check('RS → stick aim + fire, device pad', c.aimMode === 'stick' && c.fire && c.aimX > 0.99 && c.device === 'pad', JSON.stringify([c.aimMode, c.fire, c.aimX, c.device]));
    await page.evaluate(() => window.__pads.axes(0, [0.6, 0, 0, 0]));
    await frames(page, 2);
    c = await ctl(page);
    check('RS released → aim lingers (stick, no fire)', c.aimMode === 'stick' && !c.fire && c.aimX > 0.99, c.aimMode);
    check('LS 0.6 rescaled', Math.abs(c.moveX - (0.6 - 0.18) / 0.82) < 0.02, `${c.moveX}`);
    await sleep(450);
    c = await ctl(page);
    check('linger expires → none', c.aimMode === 'none', c.aimMode);
    await page.evaluate(() => window.__pads.btn(0, 7, 0.8));
    await frames(page);
    c = await ctl(page);
    check('RT fires', c.fire === true);
    await page.evaluate(() => { window.__pads.btn(0, 7, 0); window.__pads.axes(0, [0, 0, 0, 0]); });

    before = await counts(page);
    await page.evaluate(() => window.__pads.btn(0, 0, 1));
    await frames(page, 4);
    await page.evaluate(() => window.__pads.btn(0, 0, 0));
    await frames(page, 2);
    after = await counts(page);
    check('pad A → one boost edge + one confirm', after.p0.boost - before.p0.boost === 1 && (after.menu.confirm || 0) - (before.menu.confirm || 0) === 1);

    // d-pad key-repeat: hold down 1.0 s → 1 + floor((1.0-0.35)/0.09) ≈ 8 edges
    before = await counts(page);
    await page.evaluate(() => window.__pads.btn(0, 13, 1));
    await sleep(1000);
    await page.evaluate(() => window.__pads.btn(0, 13, 0));
    await frames(page, 2);
    after = await counts(page);
    const reps = (after.menu.down || 0) - (before.menu.down || 0);
    check('d-pad held 1s → key-repeat (6..10 edges)', reps >= 6 && reps <= 10, `${reps}`);

    // Second pad joins
    await page.evaluate(() => window.__pads.plug(1));
    await frames(page, 3);
    await page.evaluate(() => window.__pads.btn(1, 9, 1));
    await frames(page, 3);
    await page.evaluate(() => window.__pads.btn(1, 9, 0));
    await frames(page, 2);
    after = await counts(page);
    pads = await page.evaluate(() => window.__inp.input.pads.map((p) => [p.index, p.player]));
    check('pad 1 Start → joinRequested → P2 bound', after.joins === 1 && pads[1][1] === 1, JSON.stringify(pads));
    await page.evaluate(() => window.__pads.axes(1, [-1, 0, 0, 1]));
    await frames(page);
    const c1 = await ctl(page, 1);
    const c0 = await ctl(page, 0);
    check('P2 reads only its pad', c1.moveX < -0.99 && c1.aimY > 0.99 && c1.fire && c0.moveX === 0, JSON.stringify([c1.moveX, c1.aimY, c0.moveX]));
    await page.evaluate(() => window.__pads.axes(1, [0, 0, 0, 0]));
    await page.evaluate(() => window.__inp.input.vibrate(0.7, 150, 1));
    const rumbles = await page.evaluate(() => window.__rumbles || []);
    check('vibrate → dual-rumble on P2 pad', rumbles.length >= 1 && rumbles.at(-1)[0] === 1 && rumbles.at(-1)[1] === 'dual-rumble', JSON.stringify(rumbles.at(-1)));
    await page.evaluate(() => window.__pads.unplug(1));
    await frames(page, 2);
    check('unplug → padCount 1', (await page.evaluate(() => window.__inp.input.padCount)) === 1);
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, 'desktop-pads.png') });
    await ctx.close();
  }

  /* ---------------------------------- mobile touch ---------------------------------- */
  for (const left of [false, true]) {
    const vw = 844;
    const vh = 390;
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${url}?opacity=0.7&noreadout=1${left ? '&left=1' : ''}`);
    await page.waitForFunction(() => window.__inp);
    await frames(page, 5);
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `touch-idle${left ? '-left' : ''}.png`) });
    const cdp = await ctx.newCDPSession(page);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
    const mvX = left ? 640 : 200;
    const aiX = left ? 200 : 640;
    await T('touchStart', [[mvX, 280, 1]]);
    await T('touchStart', [[mvX, 280, 1], [aiX, 260, 2]]);
    for (let k = 1; k <= 6; k++) {
      await T('touchMove', [[mvX + k * 10, 280 - k * 4, 1], [aiX + k * 2, 260 - k * 10, 2]]);
      await frames(page, 1);
    }
    await frames(page, 3);
    const c = await ctl(page);
    const meta = await page.evaluate(() => ({ dev: window.__inp.input.lastDevice, n: window.__inp.input.touch.activeTouches, R: window.__inp.input.touch.R }));
    check(`[${left ? 'left' : 'right'}-handed] touch move stick`, c.moveX > 0.5 && c.moveY < -0.1 && meta.dev === 'touch', JSON.stringify([c.moveX, c.moveY, meta]));
    check(`[${left ? 'left' : 'right'}-handed] touch aim stick fires upward`, c.aimMode === 'stick' && c.fire && c.aimY < -0.9 && c.aimAssist === true, JSON.stringify([c.aimMode, c.fire, c.aimX, c.aimY, c.aimAssist]));
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `touch-sticks${left ? '-left' : ''}.png`) });
    // Pull the move stick far → base drags along.
    const b0 = await page.evaluate(() => ({ ...window.__inp.input.touch.move }));
    await T('touchMove', [[mvX + 200, 280, 1], [aiX + 12, 200, 2]]);
    await frames(page, 2);
    const b1 = await page.evaluate(() => ({ ...window.__inp.input.touch.move }));
    check('base drags when pulled far', b1.bx - b0.bx > 100, `${b0.bx.toFixed(0)}→${b1.bx.toFixed(0)}`);
    // Lift aim: no fire, aim lingers
    // touchEnd lists the points being lifted: lift the aim thumb only.
    await T('touchEnd', [[aiX + 12, 200, 2]]);
    await frames(page, 2);
    const c2 = await ctl(page);
    check('aim lifted → no fire, aim lingers, still moving', !c2.fire && c2.aimMode === 'stick' && c2.moveX > 0.9, JSON.stringify([c2.fire, c2.aimMode, c2.moveX]));
    await T('touchEnd', [[mvX + 200, 280, 1]]);
    await frames(page, 2);
    const c3 = await ctl(page);
    check('all lifted → move zero', c3.moveX === 0 && c3.moveY === 0 && !c3.fire);

    // Buttons: read their layout and tap them.
    const lay = await page.evaluate(() => {
      const t = window.__inp.input.touch;
      return { boost: [t.boost.x, t.boost.y], bomb: [t.bomb.x, t.bomb.y], pause: [t.pause.x, t.pause.y] };
    });
    const before = await counts(page);
    // Boost while steering with the other thumb (true multi-touch).
    await T('touchStart', [[mvX, 300, 3]]);
    await T('touchStart', [[mvX, 300, 3], [lay.boost[0], lay.boost[1], 4]]);
    await frames(page, 2);
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `touch-boost${left ? '-left' : ''}.png`) });
    const held = await page.evaluate(() => window.__inp.input.controls(0).boostHeld);
    check('boost held while steering', held === true);
    await T('touchEnd', [[lay.boost[0], lay.boost[1], 4]]);
    await T('touchEnd', [[mvX, 300, 3]]);
    await frames(page, 2);
    for (const [k, id] of [['bomb', 5], ['pause', 6]]) {
      await T('touchStart', [[lay[k][0], lay[k][1], id]]);
      await frames(page, 2);
      await T('touchEnd', [[lay[k][0], lay[k][1], id]]);
      await frames(page, 2);
    }
    const st = await page.evaluate(() => window.__inp.input.touch.activeTouches);
    check('all touches released', st === 0, `${st}`);
    const after = await counts(page);
    check(`[${left ? 'left' : 'right'}-handed] BOOST/BOMB/PAUSE buttons → one edge each`,
      after.p0.boost - before.p0.boost === 1 && after.p0.bomb - before.p0.bomb === 1 && after.p0.pause - before.p0.pause === 1,
      JSON.stringify({ before: before.p0, after: after.p0, lay }));
    const handed = left ? lay.boost[0] < vw / 2 : lay.boost[0] > vw / 2;
    check('buttons on the aim side', handed, JSON.stringify(lay));
    await frames(page, 30);
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `touch-paused${left ? '-left' : ''}.png`) });
    await ctx.close();
  }

  await browser.close();
  await srv.close();
  check('no page/console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
