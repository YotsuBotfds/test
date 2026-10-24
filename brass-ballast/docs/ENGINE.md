# Brass & Ballast — Engine cheat-sheet (WP1)

The **real** engine API, for content agents (enemies, bosses, weapons, upgrades, stages, HUD,
achievements). DESIGN.md §4 is the contract; this file documents what the code actually does,
including extras. Source: `js/game/*.js`, `js/core/{loop,spatial}.js`, `js/debug.js`,
`js/autopilot.js`.

## 0. Conventions

| thing | rule |
|---|---|
| units | world units ≈ CSS px at zoom 1. Infinite sky, origin = run start. +x right, **+y down**. |
| angles | radians, `0 = +x`, **positive = clockwise on screen**. Sprites face +x. |
| time | `dt` in seconds (≤ 1/30 per step, already × timeScale × slow-mo). `world.time` = sim seconds. |
| speeds | u/s. AI helpers take **base** speeds and multiply by `e.speedMult` themselves. If you write `e.vx` yourself, multiply by `e.speedMult`. |
| fire rate | use `cooldown(e, key, secs, dt)` (honors `e.fireRateMult`) or multiply your own timers by `e.fireRateMult`. |
| enemy damage | pass **base** numbers. `world.fire` with `owner: e` multiplies damage by `e.dmgMult` (stage × mods × …) and speed by `run.mods.enemyBulletSpeed`. Same for `addHazard({owner})` and `explode({team:'enemy', owner})`. |
| player damage | **not** auto-scaled: weapons compute `base × stats.damage × run.mods.playerDmg`. |
| errors | every content hook is wrapped: a throw logs once (`[world] enemy:<id>:update threw`) and the game continues. Don't rely on it. |
| info objects | `info` passed to hooks/events is often a **reused** object — copy fields you keep. |

Imports content code typically needs:
```js
import { Sprites } from '../../gfx/sprites.js';
import * as AI from '../../game/ai.js';          // steering & firing helpers (§4)
import { TAU, clamp, angleDiff } from '../../core/math.js';
```

## 1. World (`world`) — passed to every hook

Fields: `game, run, rng (seeded RNG — use it for gameplay randomness), events, fx, particles,
renderer, weather, input, audio, director, time, dt, players[], enemies[], bosses[], pBullets[],
eBullets[], pickups[], hazards[], spatial (SpatialHash)`.

```js
// Spawning
world.spawnEnemy(typeOrDef, x, y, opts?) -> Enemy
//   opts: {elite: true|'armored'|'overclocked'|'volatile', hp (base hp, still scaled),
//          rawHp (exact, unscaled), hpMult, angle, vx, vy, parent, data (copied into e.data),
//          noDrops, wave, boss, invuln, untargetable, scale, sprite, layer, alt, r, xp, cogs,
//          dmgMult, speedMult, fireRateMult, contactDamage, mass}
world.spawnBoss(id, opts?) -> Enemy       // banner(name,title), boss music, roar, zoom punch,
                                          // def.intro(boss, world), 'boss:spawn'. Default pos:
                                          // centered, just above the top of the view.
world.bossPhase(boss, phase, {text?, sub?})  // sets boss.phase, sfx boss_phase, shake, event
world.killEnemy(e, info?)  world.removeEnemy(e)  /* silent, no drops/events */
world.killAllEnemies(includeBosses?)

// Combat
world.fire(opts) -> Projectile            // §2
world.explode(x, y, radius, damage, opts?) -> enemiesHit   // §5
world.warnExplode(x, y, radius, damage, delay=0.8, opts?)  // telegraph circle → explode
world.addHazard(h) -> Hazard              // §6
world.telegraphCircle(x, y, r, time, {color, onDone(world, h), follow, ox, oy, team})
world.telegraphLine(x1, y1, x2, y2, width, time, {color, onDone(world, h), follow})
world.damageEnemy(e, amount, info?) -> dealt
world.damagePlayer(p, amount, info?) -> bool   // true = hit consumed (damage or shield).
                                          // `amount` is a BASE number scaled like fire/explode/
                                          // addHazard: × (info.dmgMult ?? info.owner.dmgMult) when
                                          // the owner is an enemy. Don't pre-multiply; pass
                                          // info.scaled=true only if you already did.
world.loopSfx(key, name, on, {vol,pitch,x,y}?)   // run-owned audio loop: call every update while
                                          // on; stops when not refreshed, mutes while the sim is
                                          // halted (pause/level-up) and dies with the run
world.applyBurn(e, dps, time=3, owner?, heat=0)   world.applySlow(e, amt 0..0.8, time=1.5)
// burn: dps refreshes (max), plus optional stacking `heat` (total damage, decays with
// BURN_HEAT_TAU 2.5 s; Incendiary adds INCENDIARY_HEAT 0.5 × the hit — config.js)
world.clearEnemyBullets(x, y, r=Infinity, toXp=false) -> count

// Players & pickups
world.nearestPlayer(x, y, maxDist?)  world.randomPlayer()  world.alivePlayerCount()
world.healPlayer(p, amount)  world.revivePlayer(p, frac=0.4, text?)  world.playerDown(p)
world.dropPickup(type, x, y, value=1, {speed, angle, delay}?)   // xp|cog|repair|steam|bomb|crate
world.spawnXp(x, y, total)   world.vacuumPickups(all=false)

// Queries (skip dead / untargetable / phased)
world.nearestEnemy(x, y, maxDist?, filter?)   world.queryEnemies(x, y, r, out?)
world.enemyNearAngle(x, y, angle, maxAngle, maxDist)   world.countEnemies(filter?)
world.isVisible(x, y, margin=0)   world.viewRect(margin=0) -> {x0,y0,x1,y1,w,h}
world.offscreenPoint(margin=80, angle?) -> {x,y}   // just outside the view, along angle
world.wind -> {x,y}                                 // accel u/s² (weather gusts + Gale mod)

// Feel & presentation
world.shake(trauma 0..1, own=false)  world.kick(angle, px)  world.hitstop(s ≤ .2)  world.slowmo(scale, s)  world.zoomPunch(±a)
// own = the player's own guns/blasts/kills: ×0.6 and only up to trauma 0.4 (~3.5 px), so being
// hit (uncapped) still reads as danger. kick = directional recoil (px opposite the shot, ~80 ms,
// ≤ 4 px, × shake setting) — primaries kick instead of shaking. Player-team explode() is own.
world.flash(color, alpha)            // capped when reduced flashing is on
world.sfx(name, x?, y?, {vol, pitch, delay}?)      // positional
world.floatText(x, y, text, {color, size, life, crit}?)   world.announce(title, sub, {kind, time})
world.after(seconds, fn(world))      // sim-time timer (respects pause/slow-mo)
world.drawEnemySprite(ctx, e, sprite?, frame?, angle?, x?, y?, scale?)  // default enemy look
world.contentError(key, err)         // log-once helper
```

## 2. Projectiles — `world.fire(opts)`

```js
world.fire({
  team: 'player'|'enemy',     // default from owner.team, else 'player'
  kind: 'ball',               // sprite = sprite ?? (team==='player' ? 'pb_' : 'eb_') + kind
  sprite, frame,
  x, y, angle, speed,         // or vx, vy. Defaults: speed 600 (player) / 220 (enemy)
  r: 5, damage: 10,
  life: 2 (player) | 6 (enemy), range,      // range → life = range / speed
  pierce: 0 (Infinity ok), bounce: 0,       // bounce retargets nearest other enemy ≤ 300
  drag: 0 (1/s), accel: 0 (u/s²), maxSpeed, minSpeed,
  homing: 0 (rad/s), homingRange: 400, homingDelay: 0, target,
  lob: {tx, ty, time?, height?, marker?},   // arc, no collision in flight; lands → onLand/explode
                                            // (or direct hit). Enemy lobs draw a landing marker.
  explode: {radius, damage?, falloff?, visual?, sound?, shake?, burn?, clearBullets?, knockback?,
            team?, onExpire: true},         // on hit, on landing, and on expiry (unless onExpire:false)
  burn: {dps, time}, slow: {amt, time},     // applied on hit (slow also works vs players)
  knockback: 60, crit,                      // player shots roll owner.stats.crit if crit undefined
  scale: 1, spin: 0 (rad/s visual), alpha: 1,
  trail: 'smoke'|'spark'|'aether'|'steam'|'fire'|fn(p, world),
  glow: color|null,                         // additive glow; enemy default '#ff5a2a', glow:false = none
  glowSize: 3.2,
  wave: {amp, freq, phase?},                // sine weave perpendicular to travel
  owner, source: 'primary'|'aux:<id>'|'bomb'|'enemy'|…, element: 'kinetic'|'fire'|'shock'|'steam',
  dmgMult,                                  // enemy only: overrides owner.dmgMult
  noSpeedMod, noExplosive, noBurnChance, hitPlayers, hitEnemies,
  onHit(p, target, world), onExpire(p, world), onLand(p, world), update(p, dt, world),
  draw(ctx, p, world),                      // custom draw (ctx saved/restored, world transform)
  data: {},
}) -> Projectile
```
Projectile fields you may read/write: `x y vx vy angle speed t life r scale alpha z (lob height)
pierceLeft bounceLeft hitSet crit damage alive`. `p.kill(explode=false)` removes it next update.
Projectiles are **pooled**: don't keep references after it dies (check `p.alive`; `p.gen`
increments on reuse).

**Damage & crit flow (player shots):** crit rolled once at fire → on hit
`dmg = damage × (crit ? owner.stats.critMult : 1)` → `world.damageEnemy` (armored/invuln/
`dmgTakenMult`/`def.modifyDamage`) → numbers, sfx, `enemy:hit`, `def.onHit` → kill at hp ≤ 0.

**Engine-applied stats (weapons must NOT re-apply):**
- `stats.burnChance` — every hit by a player-owned projectile rolls it → burn
  `stats.burnDps × stats.damage` for 3 s (opt out: `noBurnChance`).
- `stats.explosive` — hits from `source: 'primary'` spawn a small explosion of radius
  `explosive × area` for **35%** of the hit damage (opt out: `noExplosive`).
- Weapons apply the rest: `damage, fireRate, projSpeed, projCount, spread, pierce, bounce, area,
  knockback (scaled again by owner.stats.knockback at impact), duration, cooldown`.

**Enemy shots:** `damage × (opts.dmgMult ?? owner.dmgMult)`, `speed × run.mods.enemyBulletSpeed`.
Player hitbox vs bullets is `player.hitR` (12) — generous on purpose. Boosting players have
i-frames, so shots pass through them (not consumed).

## 3. Enemies

Def (`ENEMIES[id]`, inline part/minion defs, `BOSSES[id]`):
```js
{ id, name, hp, r, speed, contactDamage, mass: 1, xp, cogs /*expected, fractional ok*/, score,
  sprite, scale: 1, alt: 1 /*shadow offset*/, layer: 0 /*<0 under, >0 over*/,
  manualMove, noContact, noSeparation, noRecycle, noKnockback, noElite, noScore, hpBar,
  shadow: false, volatile /*always explodes on death*/, immune: {burn, slow},
  shareDamage: true | 0..1,   // parts: true → all damage to parent (part immortal);
                              //        number → part takes it AND forwards that fraction
  init(e, world), update(e, dt, world), draw?(ctx, e, world), drawShadow?(ctx, e, world, ox, oy),
  onHit?(e, dealt, info, world), onDeath?(e, world, info), onContact?(e, player, world),
  modifyDamage?(e, amount, info, world) -> amount, onRecycle?(e, world) }
```
Enemy instance:
```js
{ id, type, def, name, team:'enemy', x, y, vx, vy, r, angle, scale, alpha, alt, layer, sprite,
  frame, t, alive, dead, hp, maxHp, isBoss, parent, parts[], phase, wave, elite, speedMult,
  fireRateMult, dmgMult, dmgTakenMult, contactDamage, mass, kbx, kby, flash, burn, slow,
  invuln, untargetable, phased, noDrops, fleeing, partner, state, timer, data, xp, cogs, score }
```
- Per frame: `t += dt` → `def.update` (skipped while `e.fleeing`) → integrate
  `x += (vx·(1−slow) + kbx)·dt` unless `manualMove` → decay knockback & flash → burn ticks
  (every 0.3 s) → soft separation → contact damage → recycle if > 2600 from every player.
- `e.invuln` = takes no damage (sparks + clink); `e.untargetable` = ignored by shots, queries,
  homing, aim; `e.phased` = like untargetable + no contact + drawn translucent.
- Scaling at spawn: hp × `stage.hpMult` (bosses & their parts: × `run.bossHpMult` instead) ×
  `mods.enemyHp` × (1 + 0.5 per extra living player) × `opts.hpMult`; elite ×2.5 hp, ×3 xp,
  ×2.5 cogs, ×3 score. `dmgMult = stage.dmgMult × mods.enemyDmg`. `speedMult = mods.enemySpeed`.
  Overclocked: speed & fire rate ×1.4. Armored: 50% damage taken while hp > 50%. Volatile (and
  `mods.volatileAll`): telegraphed death blast.
- Default draw: elite rim (`Sprites.drawOutline`, gold) → sprite → burn/slow tint → flash. Custom
  `def.draw` can reuse it: `world.drawEnemySprite(ctx, e, 'enemy_x_turret', 0, e.data.aim)`.
- Death: `def.onDeath` → parts die with parent (no drops) → explosion sized by `r` (r ≥ 36 also
  leaves a falling wreck) → drops (xp × stage.xpMult × mods.xp; cogs × mods.cogs; small chance
  repair/steam/bomb (× mods.bombDrops); Armory Crate from elites: 45% forced / 10% random (×2
  under Elite Hunt), × 0.6 per crate already found this stage (`run.stageCrates`), at most 1 per
  wave — 2 under Elite Hunt — via `run.waveCrates`) → combo & score → codex →
  `enemy:killed`.
- Wave formations: `pair` sets `e.partner` / `e.data.partner` right after spawn (available from
  the first `update`, not in `init`).

## 4. AI helpers (`js/game/ai.js`)

```js
steerToward(e, tx, ty, speed, turnRate, dt) -> dist   // turn-limited, sets vx/vy
seek(e, tx, ty, speed, accel, dt) -> dist             // inertial, arrives softly
accelTo(e, vx, vy, accel, dt)
keepRange(e, target, min, max, speed, dt, dir?) -> dist   // strafes inside the band
orbit(e, cx, cy, radius, speed, dir ±1, dt) -> angleAroundCenter
faceToward(e, angle, rate, dt) -> remaining    faceVelocity(e, rate, dt, minSpeed?)
aimAngle(e, target, leadSpeed?)                // leads moving targets
fireSpread(world, e, angle, count, totalArc, opts) -> Projectile[]
fireRing(world, x, y, count, offset, opts)     // pass opts.owner = e for dmg scaling
fireAimed(world, e, target, {speed, lead, jitter, ...fireOpts})
cooldown(e, key, seconds, dt) -> bool          // e.data[key]; random first delay; × fireRateMult
setState(e, state, time)  timerDone(e, dt)  distToPlayer(world, e)  flee(e, x, y, speed, dt)
weave(e, amp, freq, phase?)
```
Typical enemy:
```js
update(e, dt, w) {
  const p = w.nearestPlayer(e.x, e.y); if (!p) return;
  AI.keepRange(e, p, 300, 400, this.speed, dt);
  AI.faceToward(e, AI.aimAngle(e, p), 3, dt);
  if (AI.cooldown(e, 'gun', 2, dt)) {
    AI.fireSpread(w, e, e.angle, 3, 0.4, { kind: 'orb', speed: 220, r: 7, damage: 10 });
    w.sfx('enemy_shot', e.x, e.y);
  }
}
```
Telegraphed dash (≥ 0.6 s for big hits):
```js
w.telegraphLine(e.x, e.y, e.x + Math.cos(a) * 400, e.y + Math.sin(a) * 400, e.r * 2, 0.5,
  { onDone: () => { if (e.alive) { e.state = 'dash'; e.timer = 0.4; } } });
```

## 5. Explosions — `world.explode(x, y, radius, damage, opts)`

`opts: {team: 'player'|'enemy'|'all' (default from owner), owner, source, falloff: 0.35
(1 − falloff·dist/radius), knockback, visual: 'small'|'medium'|'large'|'huge'|false (auto from
radius), sound (default explode_<size>, false = none), shake, clearBullets (true | 'xp'),
burn: {dps, time}, crit (multiplier), dmgMult, element}`. Enemy-team damage is scaled by
`opts.dmgMult ?? owner.dmgMult`. Ballast bombs: radius 170×area, 60×damage×playerDmg,
clear bullets.

## 6. Hazards & telegraphs — `world.addHazard(h)`

```js
{ x, y, r: 40, shape: 'circle'|'line'|'ring', x2, y2, width: 20, life: 1, delay: 0,
  team: 'enemy'|'player'|'all', damage /*per touch*/, tick: 0.25 /*s between hits per target*/,
  owner, dmgMult, color, telegraph: false, follow /*entity*/, ox, oy, alpha, fill: true,
  knockback, burn, slow, source, element, sound /*played when it arms*/,
  update?(h, dt, world), draw?(ctx, h, world), onDone?(h, world), onHit?(h, target, world), data }
```
- `t < delay` (or `telegraph: true` for its whole `life`) → pulsing warning that fills toward
  completion, **no damage**. Then active for `life` seconds. `h.alive = false` ends it early.
- Line hazards with `follow` keep their length/direction relative to the follower.
- Default looks: circle = translucent disc + rim; line = additive beam; ring = additive band.

## 7. Bosses (multi-part pattern)

```js
export default {
  id: 'ironMatriarch', name: 'The Iron Matriarch', title: 'Flagship of the Syndicate',
  boss: true, stage: 1, music: 'boss' /*'finalBoss' for the last*/, hp: 1500, r: 120,
  xp: 80, cogs: 60, score: 5000, sprite: 'boss_ironMatriarch', manualMove: true, noSeparation: true,
  init(b, w) {
    b.data.turrets = [-120, -40, 40, 120].map((ox) =>
      w.spawnEnemy(TURRET_DEF, b.x + ox, b.y, { parent: b, data: { ox } }));
    // Armored until phase 2 (set core.invuln = false to expose it); hits then go to the boss.
    b.data.core = w.spawnEnemy(CORE_DEF, b.x, b.y, { parent: b, invuln: true });
  },
  intro(b, w) { b.state = 'enter'; b.timer = 2.5; },
  update(b, dt, w) {
    // move body, then place parts (they're manualMove too):
    for (const t of b.data.turrets) if (t.alive) { t.x = b.x + t.data.ox; t.y = b.y; }
    if (b.phase === 0 && b.hp < b.maxHp * 0.66) w.bossPhase(b, 1, { text: 'Turrets overheating!' });
  },
};
const TURRET_DEF = { id: 'imTurret', hp: 220, r: 22, sprite: 'boss_im_turret', manualMove: true,
  noSeparation: true, shareDamage: 0.5 /* takes damage AND forwards 50% to the boss bar */ };
const CORE_DEF = { id: 'imCore', hp: 1, r: 40, manualMove: true, shareDamage: true /* proxy */ };
```
- Boss HP shown = `boss.hp / boss.maxHp` (parent authoritative). `world.bosses` = main bodies.
- Parts are in `boss.parts`; they skip recycling/separation/knockback, die with the boss and
  become wrecks. Destructible parts: give them hp and no/fractional `shareDamage`.
- Boss death is automatic: slow-mo, zoom punch, 12 chain explosions over 2 s, then the big blast,
  cog shower (`def.cogs × mods.cogs × max(1, bossHpMult)`), XP, 2 repairs + a bomb,
  `boss:killed`. Don't spawn your own death sequence (add flavor in `onDeath` if you like).
- Lightning: `w.weather.strike?.(x, y)` (visual + thunder); pair it with a telegraph/hazard.
- Optional def fields read by the engine/HUD: `frameR` (camera framing radius, default 0.75·r),
  `zoom` (camera base zoom for the fight, set by
  `game.onBossSpawn`; default 0.88 — never poke `camera.baseZoomMul` from `update`), `hudPhases`
  (hp fractions of the phase changes, drawn as boss-bar markers), `noFrame` (camera won't lean
  toward it). While a boss lives the camera leans toward it and zooms out (≥ 0.78 × `zoom`) to
  keep player and boss framed. Campaign toughness: `hp: bossHp(id, BASE_HP)` from
  `content/bosses/tuning.js` (one table for all five bosses; modes scale on top via
  `run.bossHpMult`). The same file's `BOSS_DAMAGE` / `bossDamage(id)` multiplies the `dmgMult`
  of a boss body and its parts at spawn (createEnemy), so every shot, hazard and contact scales.

## 8. Player (`js/game/player.js`)

```js
{ index, isPlayer: true, team: 'player', x, y, vx, vy, r: 22, hitR: 12, angle /*hull*/,
  aim /*turret*/, aimDist, alive, hp, steam, bombs, iframes, boostT, boosting, flash, slowT,
  hull /*HULLS def*/, stats, primary: {id, level, cd, kick, data}, aux: [{id, level, cd, kick, data}],
  passives: {id: level}, controls, firing, alt: 1, god, revivesLeft, rerolls, shieldReady,
  color, kills, brain /*bot fn*/, autoPick /*bot card picker*/ }
muzzle(dist=28) -> {x,y}     mountPos() -> {x,y}     local(lx, ly) -> {x,y}   // hull-local → world
recomputeStats()  heal(n)  addSteam(n)
hasAux(id) auxLevel(id) getAux(id) addAux(id) levelAux(id) evolveAux(evoId) removeAux(id)
passiveLevel(id) addPassive(id) levelPrimary()  doBoost(mx, my)  dropBomb()
```
- Movement: `v += move·accel·dt` (+ wind), drag `exp(−accel/speed·dt)` → terminal = `speed`.
  Boost: 650 u/s for 0.18 s, 0.35 s i-frames, `boostCost` steam, 0.25 s cooldown.
- Hit: armor subtracts (min 1), × `mods.playerDmgTaken`, 0.6 s i-frames, combo reset, hit-stop.
  Aether shield (`stats.shieldInterval`) blocks one hit; vengeance ring `8·L` shells × 15 dmg.
  0 hull → emergency balloon (`revivesLeft`) at 30%, else down; co-op partners revive at 40% on
  wave clear / refit.
- **Weapons**: `PRIMARIES[id].update(player, wpn, dt, world, input)` every frame with
  `input = {firing, angle}` (object reused). Set `wpn.kick = 1` on fire (turret recoil, decays in
  your code). `AUX/EVOLUTIONS[id]`: `init?(player, slot, world)`, `update(player, slot, dt, world)`,
  `drawUnder?(ctx, player, slot, world)`, `draw?(…)` (ctx saved/restored, world transform),
  `remove?(player, slot, world)` (on evolve/remove), `onLevel?(player, slot, world)`,
  optional `stats?(stats, level, player)` stat hook. Max 4 aux.
- Turret sprite `PRIMARIES[id].turret` at `HULL_MOUNTS[hull].turret` (from `gfx/art/ships.js`).

## 9. Stats (`player.stats`, `js/game/stats.js`)

Rebuild order: defaults → `hull.base` (numbers replace defaults) → `applyWorkshop(stats,
Save.meta.workshop)` → `PASSIVES[id].apply(stats, level, player)` → aux/primary `stats()` hooks →
`player.bonusAdd/bonusMul` (debug) → clamps. Defaults:
```
maxHp 100  armor 0  speed 240  accel 1500  steamMax 100  steamRegen 14  boostCost 30  bombsMax 2
pickupRadius 90  hpRegen 0  damage 1  fireRate 1  projSpeed 1  projCount 0  spread 1  pierce 0
bounce 0  crit .05  critMult 1.75  area 1  duration 1  cooldown 1 (min .2)  knockback 1  luck 0
xpGain 1  cogGain 1  burnChance 0  burnDps 6  explosive 0  shieldInterval 0  vengeance 0
rerolls 0  extraChoices 0  revives 0
```
`recomputeStats()` keeps hp/bombs/revives/rerolls consistent (gaining maxHp heals the gain).
Run modifiers are **not** folded into stats (`run.mods.playerDmg` is applied by weapons).

## 10. Cards & choices

- `rollChoices(player, world.rng, count, {pool: 'level'|'refit'|'crate', run, world})`;
  count = 3 + `stats.extraChoices` (crates: 3). Empty → engine offers Field Repairs / Salvage.
- `applyChoice(player, card, world)` runs first; the engine then **verifies by kind** and applies a
  fallback if nothing changed (`passive → addPassive`, `auxNew/auxLevel → addAux/levelAux`,
  `primaryLevel → levelPrimary`, `evolution → evolveAux`, `repair → heal 30%`,
  `cogs → run.cogs += card.value ?? 40`). So `applyChoice` may be minimal but must not double-apply.
- Then `recomputeStats()`, `run.upgrades.push(card.key)`, `upgrade:take`.
- Level-ups queue one pick per living player (co-op takes turns); the sim pauses
  (`game.state = 'levelup'`). Rerolls come from `player.rerolls` (= `stats.rerolls`).
- `game.choice` = `{req, player, cards, title, subtitle, pick(card), reroll() -> cards}` while open.

## 11. Run, director, game

`game.run` (DESIGN §4.10) plus: `day, cogFrac, killsByType, achievements[], stageReached,
summary, enemyFireRate, waveCrates, stageCrates, crateStage`. XP curve: `xpForLevel(L) = round(10 + 8(L−1) + 0.85(L−1)²)`
(steeper start, same late curve as before the balance pass).

Director (`game.director`, `world.director`): `state` ∈ intro | wave | breather | bossWarning |
boss | bossDown | refit | transition | victory. `progress` → `{t, duration, spawned, total,
alive, frac}` during waves (HUD wave bar). `formation(name, n, r, target)` → spawn points.
`forceBoss(id)`, `gotoStage(pos)`, `gotoWave(i)`, `skipWave()`.
- Waves end when every group has spawned, `t ≥ 0.6 × duration` (`EARLY_CLEAR`) and no wave enemy
  is alive; 25 s after `duration` leftovers flee. Counts × `mods.spawnRate`; `maxAlive` ×
  min(1.5, spawnRate). Dead-air guard: with ≤ 2 wave foes alive after the first 3 s, the next
  scheduled batch is pulled to within 1.2 s and the trickle fires every 0.7 s, so strong builds
  get a shorter, denser wave instead of an empty sky (`LULL_*` in director.js).
- Formations: `edge` (biased ahead of travel), `ring`, `line`, `cluster`, `flank`, `pair`,
  `front`, `behind`. Elite roll per spawn: `stage.eliteChance + mods.eliteChance`, halved for light
  craft (`def.xp ≤ 2`) (or group `elite: true|'armored'|…`, which also sets `e.forcedElite`).
  `run.waveCrates` resets at each wave start (crate cap, §3).
- Endless: `MODES.endless.makeWave(index, rng, run)`, `bossFor(index)`, `biomeFor(index)`,
  optional `stageFor(index, run)` and `bossHpMult(index, run)`; default scaling
  hp `1 + .16k + .004k²`, dmg `1 + .035k`, xp `1 + .06k` (k = wave − 1).
- Boss rush: `MODES.bossRush.bosses`, optional `bossHpMult(i, run)`.

Game (`game`): `state` ∈ boot | title | playing | paused | levelup | refit | transition |
gameover | victory; `startRun({mode, hull, weapon, seed?, modifiers?, stage?, wave?, boss?})`
(stage/wave 0-based), `pause() resume() togglePause() restart() quitToTitle() applySettings()
endRun(victory, {abandon})`, `addCoopPlayer(padIndex, {brain, autoPick})`, `addXp(v)`,
`openCrate(player)`, `fps`, `camera` (`shake, zoomPunch, baseZoomMul, override = {x,y}`),
`hitstop(s)`, `slowmo(scale, s)`, `screenFlash(color, a)`, `timeScale`, `god`, `debug`.

## 12. Events (`events` from `js/core/events.js`)

| event | payload / when |
|---|---|
| `run:start` | `{run}` after the player exists, before the director starts |
| `run:end` | `{run, victory, summary}` once (also on abandon: `summary.abandoned`) |
| `stage:start` / `stage:clear` | `{run, stage, index}` |
| `wave:start` / `wave:clear` | `{run, wave, index}` |
| `boss:spawn` / `boss:phase` / `boss:killed` | `{boss, id, phase?}` |
| `enemy:spawn` | `{enemy}` (after `def.init`) |
| `enemy:hit` | `{enemy, amount, crit, info}` |
| `enemy:killed` | `{enemy, info, player|null}` |
| `player:hit` / `player:dead` / `player:revive` / `player:join` | `{player, amount?, info?}` |
| `player:boost` / `player:bomb` | `{player}` |
| `pickup:collect` | `{player, type, value}` (value after xpGain/cogGain) |
| `levelup` | `{run, level}` |
| `upgrade:take` | `{player, card}` |
| `combo` | `{value, chain}` every 5 chained kills |
| `settings:change` | game re-applies volumes, touch layout, DPR cap (quality) |

Summary (`run:end`, results): DESIGN §4.11 fields plus `rank, elitesKilled, shotsFired,
bombsUsed, boosts, hull, weapon, modifiers, abandoned, upgrades`.

Persistence at run end: cogs banked, `Save.data.stats` updated, `Save.addHighscore(mode, …)`,
codex counts, unlocks (`tinker` when stage 3 reached in campaign/daily; `bane`, `stats.campaignWins++`
and `Save.data.unlocks.bossRush` on a campaign win; a Daily Squall win only counts in `stats.wins`).

## 13. Rendering order & helpers

World pass (`world.draw`): shadows (ship silhouettes offset (26,34)·alt, α .28) → hazards &
telegraphs → particles `low` → pickups → wrecks → enemies (layer −1, 0, +1) → players (aux
`drawUnder` → hull → props → turret → shield → aux `draw`) → player shots → particles `normal`,
`add` → `fx.drawEffects` → **enemy shots** → `fx.drawTexts`. Screen pass: `background.drawFront`
→ `weather.draw` → fog / low-hull vignette / flash → `hud.draw` → `input.drawOverlay`.
`renderer.blit(ctx, Sprites.get(name), x, y, angle, scale, alpha)` is a fast no-save draw
(call `renderer.applyWorld(ctx)` after a batch).

## 14. Debug (`?debug=1` → `window.BB`)

URL flags: `debug autostart autopilot mode hull weapon stage=N wave=N boss=<id> seed=N god mute
level=N aux=a,b[:lvl] passives=a,b[:lvl] mods=gale,fog speed=N nosw sw quality=auto|high|medium|low
botskill=0..1` (autopilot dodge skill, for difficulty checks).
```js
BB.game BB.world BB.run BB.Sprites BB.audio BB.events BB.Save BB.ENEMIES BB.BOSSES BB.Quality …
BB.debug.spawn(type, n=1, {dist, x, y, elite, …})   BB.debug.boss(id)   BB.debug.stage(n)
BB.debug.wave(n)  BB.debug.skipWave()  BB.debug.god(on)  BB.debug.give(id)  BB.debug.level(n)
BB.debug.xp(n)  BB.debug.heal()  BB.debug.killAll()  BB.debug.killBoss()  BB.debug.win()
BB.debug.lose()  BB.debug.timeScale(s)  BB.debug.addPlayer()  BB.debug.autopilot(on)
BB.debug.setting(key, value)  BB.debug.report()
```
Soak test: `node tests/smoke.cjs --query "debug=1&autostart=1&autopilot=1&boss=kraken&god=1"
--seconds 60 --shot-every 10 --shots <dir>`. With `autostart`+`autopilot` results screens restart
the run after 4 s.
