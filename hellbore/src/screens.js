// Menus and screens: title, rig bay, play, pause, forge, game over, victory, settings, records, help.
import { RIGS, WEAPONS, UPGRADES, PACTS, STRATA, MAX_WEAPON_LEVEL, stratumDef } from './data.js';
import { drawText, textWidth, renderLogo, wrapText } from './font.js';
import { drawHUD, drawBanner } from './hud.js';
import { Player } from './player.js';
import { audio } from './audio.js';
import { rigUnlocked, writeSave } from './save.js';
import { rgb, clamp, shuffle, fmtInt, fmtTime, TAU, ease } from './util.js';

const C = {
  title: '#ffcf8a',
  text: '#e8d8c8',
  dim: '#8a7a6c',
  hot: '#ff6a40',
  good: '#9ef08a',
  bad: '#ff5a4a',
  gold: '#ffd060',
};

// ====================================================================== menu widget

const touchUI = () => window.hellbore?.input.mode === 'touch';

export class Menu {
  constructor(items, opts = {}) {
    this.items = items;
    this.idx = opts.start ?? 0;
    this.rects = [];
    this.lastMouse = { x: -1, y: -1 };
    this.skipDisabled();
  }

  skipDisabled(dir = 1) {
    for (let k = 0; k < this.items.length; k++) {
      const it = this.items[this.idx];
      if (it && !(it.disabled && it.disabled())) return;
      this.idx = (this.idx + dir + this.items.length) % this.items.length;
    }
  }

  move(d) {
    this.idx = (this.idx + d + this.items.length) % this.items.length;
    this.skipDisabled(d);
    audio.play('ui');
  }

  activate(it) {
    if (it.disabled && it.disabled()) {
      audio.play('deny');
      return;
    }
    if (it.action) {
      it.action();
    } else if (it.right) {
      it.right();
      audio.play('ui');
    }
  }

  update(input) {
    const m = input.out.menu;
    if (m.up) this.move(-1);
    if (m.down) this.move(1);
    const it = this.items[this.idx];
    if (it) {
      if (m.left && it.left) {
        it.left();
        audio.play('ui');
      }
      if (m.right && it.right) {
        it.right();
        audio.play('ui');
      }
      if (m.confirm) this.activate(it);
    }
    const ms = input.mouse;
    if (input.mode === 'kbm' && (ms.x !== this.lastMouse.x || ms.y !== this.lastMouse.y)) {
      this.lastMouse = { x: ms.x, y: ms.y };
      const i = this.rects.findIndex((r) => r && ms.x >= r.x && ms.x <= r.x + r.w && ms.y >= r.y && ms.y <= r.y + r.h);
      if (i >= 0 && i !== this.idx && !(this.items[i].disabled && this.items[i].disabled())) {
        this.idx = i;
        audio.play('ui', { vol: 0.5 });
      }
    }
    for (const c of input.clicks) {
      const i = this.rects.findIndex((r) => r && c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h);
      if (i < 0) continue;
      this.idx = i;
      const item = this.items[i];
      const r = this.rects[i];
      if (item.left && item.right && !item.action) {
        if (c.x < r.x + r.w / 2) item.left();
        else item.right();
        audio.play('ui');
      } else this.activate(item);
      input.clicks.length = 0;
      break;
    }
  }

  /** Centered vertical list. */
  draw(ctx, cx, y, opts = {}) {
    const gap = Math.round((opts.gap ?? 13) * (touchUI() ? 1.45 : 1));
    const minW = opts.width ?? 120;
    const t = performance.now() / 1000;
    this.rects = [];
    this.items.forEach((it, i) => {
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const sel = i === this.idx;
      const dis = it.disabled && it.disabled();
      const w = Math.max(minW, textWidth(label) + 24);
      const r = { x: Math.round(cx - w / 2), y: y + i * gap - 3, w, h: gap - 1 };
      this.rects.push(r);
      if (sel) {
        ctx.fillStyle = 'rgba(255,110,60,0.18)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = 'rgba(255,140,80,0.8)';
        ctx.fillRect(r.x, r.y, 2, r.h);
        ctx.fillRect(r.x + r.w - 2, r.y, 2, r.h);
      }
      const col = dis ? '#5a4e46' : sel ? '#fff4e0' : it.color || C.text;
      const wob = sel ? Math.round(Math.sin(t * 8) * 0.6) : 0;
      drawText(ctx, label, cx + wob, y + i * gap, { color: col, align: 'center' });
    });
  }
}

function dim(ctx, W, H, a = 0.6) {
  ctx.fillStyle = `rgba(6,2,4,${a})`;
  ctx.fillRect(0, 0, W, H);
}

function heading(ctx, text, W, y, color = C.title, scale = 2) {
  drawText(ctx, text, W / 2, y, { scale, color, align: 'center' });
  const w = textWidth(text, scale);
  ctx.fillStyle = 'rgba(255,120,60,0.5)';
  ctx.fillRect(Math.round(W / 2 - w / 2), y + 7 * scale + 3, w, 1);
}

function fullscreenToggle() {
  try {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {});
  } catch {
    // Fullscreen is optional; some browsers refuse it.
  }
}

// ====================================================================== title

export class TitleScreen {
  constructor(app) {
    this.app = app;
    this.t = 0;
    const items = [
      { label: 'DESCEND', action: () => app.setScreen(new RigScreen(app)), color: C.hot },
      { label: 'DAILY DIG', action: () => app.setScreen(new RigScreen(app, { daily: true })) },
      { label: 'RECORDS', action: () => app.setScreen(new RecordsScreen(app, this)) },
      { label: 'SETTINGS', action: () => app.setScreen(new SettingsScreen(app, this)) },
      { label: 'HOW TO PLAY', action: () => app.setScreen(new HelpScreen(app, this)) },
    ];
    if (app.canInstall()) items.push({ label: 'INSTALL APP', action: () => app.install(), color: C.gold });
    this.menu = new Menu(items);
    this.logoScale = 0;
  }

  enter() {
    audio.music('title');
    if (!this.app.attract || this.app.attract.over) this.app.newAttract();
  }

  update(dt, input) {
    this.t += dt;
    const a = this.app.attract;
    a.update(dt, input);
    if (a.over) this.app.newAttract();
    if (this.app.canInstall() && !this.menu.items.some((i) => i.label === 'INSTALL APP')) {
      this.menu.items.push({ label: 'INSTALL APP', action: () => this.app.install(), color: C.gold });
    }
    this.menu.update(input);
  }

  render(ctx) {
    const { W, H } = this.app;
    this.app.attract.render(ctx);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(8,2,4,0.35)');
    g.addColorStop(0.5, 'rgba(8,2,4,0.55)');
    g.addColorStop(1, 'rgba(8,2,4,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const scale = clamp(Math.floor((W * 0.86) / 47), 3, 9);
    if (scale !== this.logoScale) {
      this.logoScale = scale;
      this.logo = renderLogo('HELLBORE', scale, [
        [0, '#fff2b0'],
        [0.35, '#ffb040'],
        [0.7, '#e8401c'],
        [1, '#7a0c0c'],
      ]);
    }
    const intro = ease.outBack(clamp(this.t / 0.9, 0, 1));
    const ly = Math.round(H * 0.16 - (1 - intro) * 40);
    const jitter = Math.sin(this.t * 13) > 0.97 ? 1 : 0;
    ctx.drawImage(this.logo, Math.round(W / 2 - this.logo.width / 2) + jitter, ly);
    const sub = 'TUNNEL BORING TO HELL';
    const sy = ly + this.logo.height + 4;
    drawText(ctx, sub, W / 2, sy, { color: '#ff8a5a', align: 'center', scale: W > 420 ? 2 : 1 });

    const my = Math.round(Math.max(sy + 30, H * 0.5));
    this.menu.draw(ctx, W / 2, my, { gap: 14 });

    const r = this.app.save.records;
    if (r.bestDepth > 0) {
      drawText(ctx, `DEEPEST ${r.bestDepth}M   HIGH SCORE ${fmtInt(r.bestScore)}`, W / 2, H - 22, { color: C.dim, align: 'center' });
    }
    const d = this.app.save.daily;
    if (d && d.date === this.app.today()) {
      drawText(ctx, `TODAY'S DAILY DIG ${fmtInt(d.score)} / ${d.depth}M`, W / 2, H - 33, { color: '#a08a70', align: 'center' });
    }
    drawText(ctx, this.app.hint(), W / 2, H - 11, { color: '#6a5a50', align: 'center' });
  }
}

// ====================================================================== rig bay

export class RigScreen {
  constructor(app, opts = {}) {
    this.app = app;
    this.daily = !!opts.daily;
    this.t = 0;
    this.idx = Math.max(0, RIGS.findIndex((r) => r.id === app.save.lastRig));
    this.preview = null;
    this.makePreview();
    this.menu = new Menu([
      {
        label: () => `<  ${RIGS[this.idx].name}  >`,
        left: () => this.cycle(-1),
        right: () => this.cycle(1),
      },
      {
        label: () => (this.unlocked ? 'DESCEND' : 'LOCKED'),
        action: () => this.go(),
        color: C.hot,
      },
      { label: 'BACK', action: () => app.setScreen(new TitleScreen(app)) },
    ], { start: 1 });
  }

  get rig() {
    return RIGS[this.idx];
  }

  get unlocked() {
    return rigUnlocked(this.app.save, this.rig);
  }

  makePreview() {
    this.fake = { time: 0, settings: {} };
    this.preview = new Player(this.fake, this.rig);
    this.preview.x = 0;
    this.preview.y = 0;
  }

  cycle(d) {
    this.idx = (this.idx + d + RIGS.length) % RIGS.length;
    this.makePreview();
  }

  go() {
    if (!this.unlocked) {
      audio.play('deny');
      return;
    }
    audio.play('select');
    this.app.save.lastRig = this.rig.id;
    writeSave(this.app.save);
    this.app.startRun(this.rig, { daily: this.daily });
  }

  update(dt, input) {
    this.t += dt;
    this.fake.time = this.t;
    const p = this.preview;
    p.heading = this.t * 0.6;
    p.aim = this.t * 0.6 + Math.sin(this.t * 1.3) * 0.8;
    p.spin += dt * 10;
    p.tread += dt * 20;
    if (input.out.menu.back) {
      audio.play('back');
      this.app.setScreen(new TitleScreen(this.app));
      return;
    }
    if (this.menu.idx !== 0 && (input.out.menu.left || input.out.menu.right)) {
      this.cycle(input.out.menu.left ? -1 : 1);
      audio.play('ui');
    }
    this.menu.update(input);
  }

  render(ctx) {
    const { W, H } = this.app;
    this.app.attract.render(ctx);
    dim(ctx, W, H, 0.78);
    heading(ctx, this.daily ? 'DAILY DIG' : 'RIG BAY', W, 12);
    if (this.daily) drawText(ctx, 'ONE MAP FOR EVERYONE, NEW EACH DAY', W / 2, 34, { color: C.dim, align: 'center' });
    const rig = this.rig;
    const unlocked = this.unlocked;
    const cy = Math.round(H * 0.3);
    // Turntable.
    ctx.fillStyle = 'rgba(255,140,80,0.08)';
    ctx.beginPath();
    ctx.ellipse(W / 2, cy + 6, 46, 30, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,140,80,0.3)';
    ctx.stroke();
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.scale(3, 3);
    if (!unlocked) ctx.filter = 'brightness(0)';
    this.preview.draw(ctx);
    ctx.restore();
    ctx.filter = 'none';

    let y = cy + 48;
    drawText(ctx, rig.name, W / 2, y, { scale: 2, color: unlocked ? rgb(rig.color) : C.dim, align: 'center' });
    y += 20;
    if (unlocked) {
      drawText(ctx, rig.desc, W / 2, y, { color: C.text, align: 'center' });
    } else {
      drawText(ctx, `LOCKED / ${rig.unlock.text}`, W / 2, y, { color: C.bad, align: 'center' });
    }
    y += 14;
    const bw = Math.min(120, W * 0.35);
    const lx = Math.round(W / 2 - bw / 2 - 30);
    const stat = (label, v) => {
      drawText(ctx, label, lx, y, { color: C.dim });
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(lx + 60, y + 1, bw, 5);
      ctx.fillStyle = unlocked ? rgb(rig.color) : '#4a3a34';
      ctx.fillRect(lx + 60, y + 1, Math.round(bw * clamp(v, 0.05, 1)), 5);
      y += 10;
    };
    stat('HULL', rig.hp / 150);
    stat('SPEED', rig.speed / 120);
    stat('DRILL', rig.drill / 80);
    stat('THRUST', 0.6 / rig.dashCd);
    const w = WEAPONS[rig.weapon];
    y += 2;
    drawText(ctx, `STARTS WITH ${w.name}`, W / 2, y, { color: unlocked ? rgb(w.color) : C.dim, align: 'center' });
    y += 18;
    this.menu.draw(ctx, W / 2, Math.max(y, H - 52), { gap: 14, width: 130 });
  }
}

// ====================================================================== play + pause

export class PlayScreen {
  constructor(app) {
    this.app = app;
    this.gameplay = true;
  }

  update(dt, input) {
    const g = this.app.game;
    if (input.out.pause && !g.player.dead) {
      audio.play('back');
      this.app.setScreen(new PauseScreen(this.app));
      return;
    }
    g.update(dt, input);
  }

  render(ctx) {
    const g = this.app.game;
    g.render(ctx);
    if (!g.player.dead) drawHUD(ctx, g, this.app.input, this.app.W, this.app.H);
    else drawBanner(ctx, g, this.app.W, this.app.H);
  }
}

export class PauseScreen {
  constructor(app) {
    this.app = app;
    this.confirm = false;
    audio.setDrill(0);
    audio.setRumble(0);
    this.menu = new Menu([
      { label: 'RESUME', action: () => this.resume(), color: C.hot },
      { label: 'SETTINGS', action: () => app.setScreen(new SettingsScreen(app, this)) },
      { label: 'HOW TO PLAY', action: () => app.setScreen(new HelpScreen(app, this)) },
      {
        label: () => (this.confirm ? 'REALLY ABANDON?' : 'ABANDON RUN'),
        action: () => {
          if (!this.confirm) {
            this.confirm = true;
            audio.play('warn');
            return;
          }
          app.game.playerDied();
          app.game.deathT = 0.01;
          app.setScreen(new PlayScreen(app));
        },
        color: C.bad,
      },
    ]);
  }

  resume() {
    audio.play('select');
    this.app.setScreen(new PlayScreen(this.app));
  }

  update(dt, input) {
    if (input.out.menu.back || input.out.pause) {
      this.resume();
      return;
    }
    if (this.menu.idx !== 3) this.confirm = false;
    this.menu.update(input);
  }

  render(ctx) {
    const { W, H } = this.app;
    const g = this.app.game;
    g.render(ctx);
    dim(ctx, W, H, 0.65);
    heading(ctx, 'PAUSED', W, Math.round(H * 0.18));
    const p = g.player;
    drawText(ctx, `${g.depth}M  /  ${g.sdef.name}  /  ${fmtTime(g.stats.time)}  /  ${g.stats.kills} KILLS`, W / 2, Math.round(H * 0.18) + 26, {
      color: C.dim,
      align: 'center',
    });
    const pacts = [...p.pacts].map((id) => PACTS.find((x) => x.id === id).name);
    if (pacts.length) drawText(ctx, pacts.join(' / '), W / 2, Math.round(H * 0.18) + 38, { color: '#c070ff', align: 'center' });
    this.menu.draw(ctx, W / 2, Math.round(H * 0.45), { gap: 14, width: 140 });
  }
}

// ====================================================================== forge

export class ForgeScreen {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.t = 0;
    this.pactTaken = false;
    this.msg = '';
    this.msgT = 0;
    const p = game.player;
    const si = game.stratum;
    const loopMul = 1 + game.loop * 0.5;
    this.loopMul = loopMul;
    audio.setDrill(0);
    audio.setRumble(0);
    audio.music('forge');

    const items = [];
    items.push({
      label: 'FULL REPAIR',
      cost: () => Math.round((20 + si * 12) * loopMul),
      info: () => `HULL ${Math.ceil(p.hp)} / ${p.maxHp}`,
      desc: 'PATCH EVERY BREACH. HULL BACK TO FULL.',
      can: () => p.hp < p.maxHp,
      buy: () => (p.hp = p.maxHp),
    });
    items.push({
      label: 'RESTOCK CHARGES',
      cost: () => Math.round((12 + si * 4) * loopMul),
      info: () => `${p.bombs} / ${p.maxBombs}`,
      desc: 'REFILL YOUR DEMOLITION CHARGES.',
      can: () => p.bombs < p.maxBombs,
      buy: () => (p.bombs = p.maxBombs),
    });
    items.push({
      label: () => `TUNE ${WEAPONS[p.weapon].name}`,
      cost: () => Math.round((45 + p.wlevel * 25) * loopMul),
      info: () => `LV ${p.wlevel}`,
      desc: 'BORE OUT THE BARRELS. +1 WEAPON LEVEL.',
      can: () => p.wlevel < MAX_WEAPON_LEVEL,
      buy: () => p.giveWeapon(p.weapon),
    });
    const ups = shuffle(UPGRADES.filter((u) => p.up[u.id] < u.max)).slice(0, 5);
    for (const u of ups) {
      items.push({
        label: u.name,
        cost: () => Math.round(u.cost[Math.min(p.up[u.id], u.max - 1)] * loopMul),
        pips: () => [p.up[u.id], u.max],
        desc: u.desc,
        can: () => p.up[u.id] < u.max,
        buy: () => {
          p.up[u.id]++;
          const before = p.maxHp;
          p.recalc();
          if (u.id === 'hull') p.heal(p.maxHp - before);
          if (u.id === 'bombs') p.bombs = p.maxBombs;
        },
      });
    }
    if (si >= 1) {
      const avail = shuffle(PACTS.filter((x) => !p.pacts.has(x.id))).slice(0, 2);
      for (const pact of avail) {
        items.push({
          label: pact.name,
          cost: () => 0,
          desc: pact.desc,
          pact: true,
          can: () => !this.pactTaken,
          buy: () => {
            p.pacts.add(pact.id);
            this.pactTaken = true;
            p.recalc();
            audio.play('roar', { pitch: 1.6, vol: 0.4 });
          },
        });
      }
    }
    this.items = items;
    const entries = items.map((it) => ({
      label: it.label,
      action: () => this.buy(it),
    }));
    entries.push({ label: 'CONTINUE DESCENT', action: () => this.leave(), color: C.hot });
    this.menu = new Menu(entries, { start: entries.length - 1 });
  }

  buy(it) {
    const p = this.game.player;
    const cost = it.cost();
    if (!it.can()) {
      audio.play('deny');
      this.say(it.pact ? 'ONE PACT PER FORGE' : 'NOTHING TO DO');
      return;
    }
    if (p.ore < cost) {
      audio.play('deny');
      this.say('NOT ENOUGH ORE');
      return;
    }
    p.ore -= cost;
    it.buy();
    audio.play('buy');
    this.say(it.pact ? 'THE PACT IS SEALED' : 'DONE');
  }

  say(m) {
    this.msg = m;
    this.msgT = 1.6;
  }

  leave() {
    audio.play('select');
    const g = this.game;
    g.openSeal();
    this.app.setScreen(new PlayScreen(this.app));
  }

  update(dt, input) {
    this.t += dt;
    this.msgT -= dt;
    this.game.particles.update(dt);
    if (input.out.menu.back) {
      this.menu.idx = this.menu.items.length - 1;
      audio.play('ui');
    }
    this.menu.update(input);
  }

  render(ctx) {
    const { W, H } = this.app;
    const g = this.game;
    const p = g.player;
    g.render(ctx);
    dim(ctx, W, H, 0.8);
    // Forge glow.
    const grd = ctx.createRadialGradient(W / 2, H, 10, W / 2, H, H * 0.8);
    grd.addColorStop(0, `rgba(255,110,30,${0.22 + 0.05 * Math.sin(this.t * 3)})`);
    grd.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    heading(ctx, 'THE FORGE', W, 10);
    drawText(ctx, `@ ${p.ore} ORE`, W / 2, 34, { color: rgb(g.sdef.colors.ore1), align: 'center' });

    const pw = Math.min(W - 24, 300);
    const x0 = Math.round(W / 2 - pw / 2);
    const rowH = touchUI() ? 18 : 12;
    let y = Math.max(48, Math.round(H * 0.42 - (this.menu.items.length * rowH) / 2));
    this.menu.rects = [];
    const entries = this.menu.items;
    entries.forEach((e, i) => {
      const sel = i === this.menu.idx;
      const r = { x: x0, y: y - Math.round((rowH - 7) / 2), w: pw, h: rowH - 1 };
      this.menu.rects.push(r);
      const it = this.items[i];
      if (sel) {
        ctx.fillStyle = 'rgba(255,110,60,0.2)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = 'rgba(255,140,80,0.8)';
        ctx.fillRect(r.x, r.y, 2, r.h);
      }
      if (!it) {
        drawText(ctx, e.label, W / 2, y, { color: sel ? '#fff4e0' : C.hot, align: 'center' });
        y += rowH;
        return;
      }
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const can = it.can();
      const cost = it.cost();
      const afford = p.ore >= cost;
      const col = !can ? '#5a4e46' : it.pact ? '#c070ff' : sel ? '#fff4e0' : C.text;
      drawText(ctx, label, x0 + 6, y, { color: col });
      let ix = x0 + 6 + textWidth(label) + 6;
      if (it.pips) {
        const [a, b] = it.pips();
        for (let k = 0; k < b; k++) {
          ctx.fillStyle = k < a ? '#ffb060' : 'rgba(255,255,255,0.15)';
          ctx.fillRect(ix + k * 5, y + 2, 4, 3);
        }
        ix += b * 5 + 4;
      }
      if (it.info) drawText(ctx, it.info(), ix, y, { color: C.dim });
      const ctext = !can ? (it.pact ? '-' : 'MAX') : cost === 0 ? 'FREE' : `${cost}`;
      drawText(ctx, ctext, x0 + pw - 6, y, { color: !can ? '#5a4e46' : afford ? C.gold : C.bad, align: 'right' });
      y += rowH;
    });

    const sel = this.items[this.menu.idx];
    const desc = sel ? sel.desc : 'SEAL BREAKS. THE NEXT STRATUM AWAITS.';
    const lines = wrapText(desc, pw - 12);
    let dy = Math.min(H - 14 - lines.length * 9, y + 10);
    for (const l of lines) {
      drawText(ctx, l, W / 2, dy, { color: '#d8c0a8', align: 'center' });
      dy += 9;
    }
    if (this.msgT > 0) drawText(ctx, this.msg, W / 2, dy + 4, { color: C.gold, align: 'center', alpha: Math.min(1, this.msgT * 2) });
  }
}

// ====================================================================== game over / victory

export class GameOverScreen {
  constructor(app, summary, recordFlags) {
    this.app = app;
    this.s = summary;
    this.flags = recordFlags;
    this.t = 0;
    const rig = RIGS.find((r) => r.id === summary.rig) || RIGS[0];
    this.menu = new Menu([
      { label: 'DESCEND AGAIN', action: () => app.startRun(rig), color: C.hot },
      { label: 'RIG BAY', action: () => app.setScreen(new RigScreen(app)) },
      { label: 'SURFACE', action: () => app.setScreen(new TitleScreen(app)) },
    ]);
  }

  update(dt, input) {
    this.t += dt;
    this.app.game.particles.update(dt);
    if (this.t > 0.6) this.menu.update(input);
  }

  render(ctx) {
    const { W, H } = this.app;
    this.app.game.render(ctx);
    dim(ctx, W, H, Math.min(0.82, this.t));
    const s = this.s;
    heading(ctx, 'HULL BREACHED', W, Math.round(H * 0.12), C.bad);
    if (this.flags.isDaily) {
      drawText(ctx, this.flags.daily ? 'DAILY DIG / NEW BEST TODAY' : 'DAILY DIG', W / 2, Math.round(H * 0.12) - 10, { color: this.flags.daily ? C.gold : C.dim, align: 'center' });
    }
    let y = Math.round(H * 0.12) + 30;
    drawText(ctx, `LOST AT ${s.depth}M IN ${stratumDef(s.stratum).name}`, W / 2, y, { color: C.text, align: 'center' });
    y += 16;
    const rows = [
      ['SCORE', fmtInt(s.score), this.flags.score],
      ['DEPTH', `${s.depth}M`, this.flags.depth],
      ['KILLS', `${s.kills}`],
      ['ORE MINED', `${s.ore}`],
      ['WARDENS SLAIN', `${s.bosses}`],
      ['TIME', fmtTime(s.time)],
    ];
    for (const [k, v, rec] of rows) {
      drawText(ctx, k, W / 2 - 6, y, { color: C.dim, align: 'right' });
      drawText(ctx, v, W / 2 + 6, y, { color: rec ? C.gold : C.text });
      if (rec && Math.floor(this.t * 3) % 2 === 0) drawText(ctx, 'NEW RECORD', W / 2 + 12 + textWidth(v), y, { color: C.gold });
      y += 10;
    }
    if (this.flags.unlocked) {
      y += 4;
      drawText(ctx, `NEW RIG UNLOCKED: ${this.flags.unlocked}`, W / 2, y, { color: C.good, align: 'center' });
      y += 10;
    }
    this.menu.draw(ctx, W / 2, Math.max(y + 16, H - 52), { gap: 14, width: 140 });
  }
}

export class VictoryScreen {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.t = 0;
    audio.music('victory');
    audio.play('victory');
    audio.setDrill(0);
    audio.setRumble(0);
    this.menu = new Menu([
      { label: 'DESCEND FURTHER', action: () => app.openForge(game), color: C.hot },
      {
        label: 'RETURN TO SURFACE',
        action: () => {
          app.finishRun(game, true);
          app.setScreen(new TitleScreen(app));
        },
      },
    ]);
  }

  update(dt, input) {
    this.t += dt;
    this.game.particles.update(dt);
    if (this.t > 1.2) this.menu.update(input);
  }

  render(ctx) {
    const { W, H } = this.app;
    this.game.render(ctx);
    dim(ctx, W, H, Math.min(0.8, this.t * 0.6));
    const s = this.game.summary();
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2);
    heading(ctx, 'THE HEART IS STILL', W, Math.round(H * 0.12), rgb([255, 200 + pulse * 40, 120]), W < 360 ? 1 : 2);
    let y = Math.round(H * 0.12) + 30;
    const lines = wrapText('YOU BORED THROUGH EVERY STRATUM AND SILENCED THE ABYSSAL HEART. BELOW IT, THE TUNNEL KEEPS GOING.', Math.min(W - 30, 300));
    for (const l of lines) {
      drawText(ctx, l, W / 2, y, { color: C.text, align: 'center' });
      y += 9;
    }
    y += 8;
    for (const [k, v] of [
      ['SCORE', fmtInt(s.score)],
      ['DEPTH', `${s.depth}M`],
      ['KILLS', `${s.kills}`],
      ['TIME', fmtTime(s.time)],
    ]) {
      drawText(ctx, k, W / 2 - 6, y, { color: C.dim, align: 'right' });
      drawText(ctx, v, W / 2 + 6, y, { color: C.gold });
      y += 10;
    }
    y += 4;
    drawText(ctx, 'HELLION RIG UNLOCKED', W / 2, y, { color: C.good, align: 'center' });
    this.menu.draw(ctx, W / 2, Math.max(y + 20, H - 40), { gap: 14, width: 160 });
  }
}

// ====================================================================== settings / records / help

export class SettingsScreen {
  constructor(app, back) {
    this.app = app;
    this.back = back;
    const s = app.save.settings;
    const vol = (key, name) => ({
      label: () => `${name}  ${'|'.repeat(Math.round(s[key] * 10)).padEnd(10, '.')}`,
      left: () => this.set(key, clamp(Math.round((s[key] - 0.1) * 10) / 10, 0, 1)),
      right: () => this.set(key, clamp(Math.round((s[key] + 0.1) * 10) / 10, 0, 1)),
    });
    const tog = (key, name) => ({
      label: () => `${name}  ${s[key] ? 'ON' : 'OFF'}`,
      left: () => this.set(key, !s[key]),
      right: () => this.set(key, !s[key]),
    });
    this.menu = new Menu([
      vol('master', 'MASTER'),
      vol('music', 'MUSIC'),
      vol('sfx', 'EFFECTS'),
      tog('shake', 'SCREEN SHAKE'),
      tog('aimAssist', 'AIM ASSIST'),
      tog('autoFire', 'TOUCH AUTO-FIRE'),
      tog('showFps', 'SHOW FPS'),
      { label: 'TOGGLE FULLSCREEN', action: () => fullscreenToggle() },
      { label: 'BACK', action: () => this.leave(), color: C.hot },
    ]);
  }

  set(key, v) {
    this.app.save.settings[key] = v;
    this.app.applySettings();
    writeSave(this.app.save);
    if (key === 'sfx' || key === 'master') audio.play('ore');
  }

  leave() {
    audio.play('back');
    this.app.setScreen(this.back);
  }

  update(dt, input) {
    if (input.out.menu.back) {
      this.leave();
      return;
    }
    if (this.back.app && this.back instanceof TitleScreen) this.app.attract.update(dt, input);
    this.menu.update(input);
  }

  render(ctx) {
    const { W, H } = this.app;
    if (this.back instanceof PauseScreen) this.app.game.render(ctx);
    else this.app.attract.render(ctx);
    dim(ctx, W, H, 0.8);
    heading(ctx, 'SETTINGS', W, Math.round(H * 0.1));
    this.menu.draw(ctx, W / 2, Math.round(H * 0.1) + 36, { gap: 14, width: 180 });
    drawText(ctx, 'LEFT / RIGHT TO ADJUST', W / 2, H - 14, { color: C.dim, align: 'center' });
  }
}

export class RecordsScreen {
  constructor(app, back) {
    this.app = app;
    this.back = back;
    this.menu = new Menu([{ label: 'BACK', action: () => this.leave(), color: C.hot }]);
  }

  leave() {
    audio.play('back');
    this.app.setScreen(this.back);
  }

  update(dt, input) {
    if (input.out.menu.back) {
      this.leave();
      return;
    }
    this.app.attract.update(dt, input);
    this.menu.update(input);
  }

  render(ctx) {
    const { W, H } = this.app;
    this.app.attract.render(ctx);
    dim(ctx, W, H, 0.8);
    heading(ctx, 'RECORDS', W, Math.round(H * 0.08));
    const r = this.app.save.records;
    const bk = this.app.save.bossKills;
    let y = Math.round(H * 0.08) + 34;
    const rows = [
      ['DEEPEST DIG', `${r.bestDepth}M`],
      ['HIGH SCORE', fmtInt(r.bestScore)],
      ['DEEPEST STRATUM', r.bestDepth ? STRATA[Math.min(r.deepestStratum, 5)].name : '-'],
      ['DESCENTS', `${r.runs}`],
      ['CREATURES SLAIN', fmtInt(r.kills)],
      ['ORE MINED', fmtInt(r.ore)],
      ['HELL CONQUERED', `${r.wins}`],
    ];
    for (const [k, v] of rows) {
      drawText(ctx, k, W / 2 - 6, y, { color: C.dim, align: 'right' });
      drawText(ctx, v, W / 2 + 6, y, { color: C.text });
      y += 10;
    }
    y += 8;
    drawText(ctx, 'WARDENS', W / 2, y, { color: C.title, align: 'center' });
    y += 12;
    STRATA.forEach((s, i) => {
      const known = bk[i] > 0;
      drawText(ctx, known ? s.bossName : '? ? ?', W / 2 - 6, y, { color: known ? rgb(s.colors.seal) : '#5a4e46', align: 'right' });
      drawText(ctx, known ? `X${bk[i]}` : '-', W / 2 + 6, y, { color: C.dim });
      y += 10;
    });
    this.menu.draw(ctx, W / 2, Math.max(y + 12, H - 24), { width: 100 });
  }
}

export class HelpScreen {
  constructor(app, back) {
    this.app = app;
    this.back = back;
    this.page = 0;
    this.menu = new Menu([
      { label: () => `<  ${['CONTROLS', 'THE DESCENT', 'TIPS'][this.page]}  >`, left: () => this.flip(-1), right: () => this.flip(1) },
      { label: 'BACK', action: () => this.leave(), color: C.hot },
    ]);
  }

  flip(d) {
    this.page = (this.page + d + 3) % 3;
  }

  leave() {
    audio.play('back');
    this.app.setScreen(this.back);
  }

  update(dt, input) {
    if (input.out.menu.back) {
      this.leave();
      return;
    }
    if (!(this.back instanceof PauseScreen)) this.app.attract.update(dt, input);
    this.menu.update(input);
  }

  render(ctx) {
    const { W, H } = this.app;
    if (this.back instanceof PauseScreen) this.app.game.render(ctx);
    else this.app.attract.render(ctx);
    dim(ctx, W, H, 0.85);
    heading(ctx, 'HOW TO PLAY', W, 10);
    const pages = [
      [
        ['KEYBOARD + MOUSE', C.title],
        'WASD MOVE. MOUSE AIMS. HOLD LEFT CLICK TO FIRE.',
        'ARROW KEYS AIM AND FIRE WITHOUT A MOUSE.',
        'SPACE OR SHIFT: DASH. RIGHT CLICK, E OR Q: CHARGE.',
        'ESC OR P: PAUSE.',
        ['GAMEPAD', C.title],
        'LEFT STICK MOVES. RIGHT STICK AIMS AND FIRES.',
        'A OR RB: DASH. B, X OR LB: CHARGE. START: PAUSE.',
        ['TOUCH', C.title],
        'LEFT THUMB ANYWHERE: MOVE STICK.',
        'RIGHT THUMB ANYWHERE: AIM AND FIRE STICK.',
        'TAP DASH AND BOMB ON THE RIGHT EDGE.',
      ],
      [
        ['DIG DOWN', C.title],
        'YOUR DRILL BITES ANY ROCK YOU DRIVE INTO.',
        'SOFT DIRT GIVES WAY FAST. DARK STONE TAKES TIME.',
        'SHOTS CHIP ROCK TOO. CHARGES BLOW CRATERS.',
        ['THE CAVE-IN', C.bad],
        'THE TUNNEL COLLAPSES BEHIND YOU. KEEP MOVING.',
        ['WARDENS', C.title],
        'EACH STRATUM ENDS IN AN ARENA AND ITS WARDEN.',
        'SLAY IT TO BREAK THE SEAL. SPEND ORE AT THE FORGE.',
        'SIX STRATA DOWN, SOMETHING IS WAITING.',
      ],
      [
        ['GOOD TO KNOW', C.title],
        'CRATES HOLD WEAPONS, POWERS, REPAIRS, CHARGES.',
        'GRAB THE SAME WEAPON AGAIN TO LEVEL IT UP.',
        'YELLOW-GREEN GAS POCKETS EXPLODE. USE THEM.',
        'DASHING MAKES YOU UNTOUCHABLE FOR A MOMENT.',
        'MOST BULLETS STOP AT ROCK. HELLFIRE DOES NOT.',
        'CRYSTALS AND GEMS ARE WORTH THE DETOUR.',
        'PACTS GIVE GREAT POWER AT A PRICE.',
        'SLAY WARDENS TO UNLOCK NEW RIGS.',
      ],
    ];
    let y = 36;
    const maxW = Math.min(W - 20, 330);
    for (const line of pages[this.page]) {
      if (Array.isArray(line)) {
        y += 3;
        drawText(ctx, line[0], W / 2, y, { color: line[1], align: 'center' });
        y += 11;
        continue;
      }
      for (const l of wrapText(line, maxW)) {
        drawText(ctx, l, W / 2, y, { color: C.text, align: 'center' });
        y += 9;
      }
    }
    this.menu.draw(ctx, W / 2, Math.max(y + 10, H - 34), { gap: 14, width: 150 });
  }
}

