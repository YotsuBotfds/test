// WP7 — synthesized sound-effect registry (names: DESIGN §4.17). Sounds live in sfx-combat.js,
// sfx-ui.js and sfx-loops.js; this module merges them and holds per-sound mixing metadata.
import { COMBAT } from './sfx-combat.js';
import { UI } from './sfx-ui.js';
import { LOOPS as RAW_LOOPS } from './sfx-loops.js';

/**
 * Output trims, measured with the ?check=1 offline renders in tests/preview/audio.html so every
 * sound lands near a target peak for its role (UI ≈ 0.3, guns ≈ 0.6, big booms ≈ 0.8) and nothing
 * exceeds 0.95 before the master compressor. Re-measure after changing a sound's synthesis.
 */
const LEVEL = {
  ui_move: 2.87, ui_select: 2.88, ui_back: 2.83, ui_error: 2.61, ui_card: 2.21, ui_buy: 1.96,
  ui_unlock: 1.55, ui_toggle: 2.7, ui_type: 1.79, ui_ding: 3.34,
  fire_cannon: 0.89, fire_gatling: 1.07, fire_blunderbuss: 0.8, fire_mortar: 0.96, fire_lance: 1.24,
  fire_harpoon: 1.08,
  tesla_zap: 3.04, rocket_launch: 1.49, flak_fire: 0.73, drone_fire: 3.78, mine_drop: 1.32,
  steam_vent: 1.8, broadside_fire: 1.13, saw_hit: 2.27,
  boost: 1.57, bomb_drop: 1.06, player_hit: 0.75, player_low: 1.0, shield_block: 1.26, revive: 2.55,
  level_up: 2.76, upgrade_pick: 2.54, evolve: 1.27,
  hit: 1.52, hit_crit: 0.95, hit_armor: 1.35, explode_small: 0.78, explode_medium: 0.7,
  explode_large: 0.47, explode_huge: 0.45, mortar_land: 1.07, burn: 2.6,
  enemy_shot: 2.06, enemy_cannon: 0.81, enemy_flak: 1.31, enemy_zap: 6.67, wasp_charge: 2.23,
  wraith_phase: 3.09, mortar_whistle: 2.67, carrier_launch: 2.32, tesla_hum: 2.07,
  pickup_xp: 2.55, pickup_cog: 3.42, pickup_repair: 4.95, pickup_steam: 3.73, pickup_bomb: 1.15,
  pickup_crate: 1.26,
  wave_start: 3.39, wave_clear: 1.22, boss_warning: 3.49, boss_roar: 0.69, boss_phase: 1.31,
  boss_death: 0.65, stage_clear: 1.14, game_over: 0.97, victory: 1.03, achievement: 4.04,
  thunder: 1.8,
  // Loops
  engine_hum: 0.86, wind_loop: 1.05, rain_loop: 0.39, lance_charge: 1.2, saw_whirr: 1.47,
};

/** Wrap a raw sound so its output passes through its LEVEL trim. */
function trimmed(name, fn) {
  const k = LEVEL[name] ?? 1;
  if (k === 1) return fn;
  return (ctx, out, o) => {
    const g = ctx.createGain();
    g.gain.value = k;
    g.connect(out);
    return fn(ctx, g, o);
  };
}

const RAW = { ...COMBAT, ...UI };

/**
 * One-shot sounds: (ctx: BaseAudioContext, out: AudioNode, opts: {t, pitch, ...}) => endTime.
 * @type {Record<string, (ctx: BaseAudioContext, out: AudioNode, opts: object) => number>}
 */
export const SFX = {};
for (const [name, fn] of Object.entries(RAW)) SFX[name] = trimmed(name, fn);

/**
 * Continuous loops: (ctx, out, {t, pitch}) => {pitch(p, at), stop(at)}.
 * @type {Record<string, (ctx: BaseAudioContext, out: AudioNode, opts: object) =>
 *   {pitch(p: number, at: number): void, stop(at: number): void}>}
 */
export const LOOPS = {};
for (const [name, fn] of Object.entries(RAW_LOOPS)) LOOPS[name] = trimmed(name, fn);

/** Grouping used by the preview page (and handy for docs). Every §4.17 name appears here. */
export const SFX_GROUPS = {
  UI: ['ui_move', 'ui_select', 'ui_back', 'ui_error', 'ui_card', 'ui_buy', 'ui_unlock', 'ui_toggle', 'ui_type', 'ui_ding'],
  Weapons: ['fire_cannon', 'fire_gatling', 'fire_blunderbuss', 'fire_mortar', 'fire_lance', 'fire_harpoon'],
  Aux: ['tesla_zap', 'rocket_launch', 'flak_fire', 'drone_fire', 'mine_drop', 'steam_vent', 'broadside_fire', 'saw_hit'],
  Player: ['boost', 'bomb_drop', 'player_hit', 'player_low', 'shield_block', 'revive', 'level_up', 'upgrade_pick', 'evolve'],
  Impacts: ['hit', 'hit_crit', 'hit_armor', 'explode_small', 'explode_medium', 'explode_large', 'explode_huge', 'mortar_land', 'burn'],
  Enemy: ['enemy_shot', 'enemy_cannon', 'enemy_flak', 'enemy_zap', 'wasp_charge', 'wraith_phase', 'mortar_whistle', 'carrier_launch', 'tesla_hum'],
  Pickups: ['pickup_xp', 'pickup_cog', 'pickup_repair', 'pickup_steam', 'pickup_bomb', 'pickup_crate'],
  Flow: ['wave_start', 'wave_clear', 'boss_warning', 'boss_roar', 'boss_phase', 'boss_death', 'stage_clear', 'game_over', 'victory', 'achievement', 'thunder'],
  Loops: Object.keys(LOOPS),
};

/**
 * Mixing metadata per sound. Defaults: gain 1, gap 0.03 s (min interval between starts),
 * max 6 concurrent, priority 1, jitter 0.04 (±4 % random pitch), duck 0 (music dip amount).
 * Priority decides voice stealing: a sound can only steal voices of equal or lower priority.
 */
const DEFAULT_META = { gain: 1, gap: 0.03, max: 6, prio: 1, jitter: 0.04, duck: 0, duckTime: 0 };
const META_RAW = {
  // UI — never stolen by gameplay noise, gentle jitter.
  ui_move: { gap: 0.025, max: 3, prio: 3, jitter: 0.02 },
  ui_select: { prio: 3, jitter: 0.01, max: 2 },
  ui_back: { prio: 3, jitter: 0.01, max: 2 },
  ui_error: { prio: 3, jitter: 0, max: 1, gap: 0.12 },
  ui_card: { prio: 3, max: 3 },
  ui_buy: { prio: 3, jitter: 0, max: 2 },
  ui_unlock: { prio: 3, jitter: 0, max: 2 },
  ui_toggle: { prio: 3, jitter: 0.02, max: 3 },
  ui_type: { prio: 2, gap: 0.02, max: 3, gain: 0.8 },
  ui_ding: { prio: 3, jitter: 0, max: 1 },
  // Weapons — fire constantly, so short gaps and low caps.
  fire_cannon: { gap: 0.035, max: 4 },
  fire_gatling: { gap: 0.035, max: 4, gain: 0.8 },
  fire_blunderbuss: { gap: 0.05, max: 3 },
  fire_mortar: { gap: 0.05, max: 3 },
  fire_lance: { gap: 0.04, max: 3 },
  fire_harpoon: { gap: 0.04, max: 3 },
  tesla_zap: { gap: 0.04, max: 3 },
  rocket_launch: { gap: 0.04, max: 4 },
  flak_fire: { gap: 0.04, max: 3 },
  drone_fire: { gap: 0.03, max: 3, gain: 0.8 },
  mine_drop: { gap: 0.06, max: 2 },
  steam_vent: { gap: 0.1, max: 2 },
  broadside_fire: { gap: 0.15, max: 2 },
  saw_hit: { gap: 0.04, max: 3 },
  // Player — important feedback.
  boost: { prio: 2, max: 2, gap: 0.08 },
  bomb_drop: { prio: 3, max: 2, gap: 0.1, duck: 0.35, duckTime: 0.9 },
  player_hit: { prio: 3, max: 2, gap: 0.06 },
  player_low: { prio: 3, max: 1, gap: 0.4, jitter: 0 },
  shield_block: { prio: 2, max: 2 },
  revive: { prio: 3, max: 1, jitter: 0, duck: 0.4, duckTime: 1.2 },
  level_up: { prio: 3, max: 1, jitter: 0, gap: 0.2, duck: 0.45, duckTime: 0.9 },
  upgrade_pick: { prio: 3, max: 1, jitter: 0 },
  evolve: { prio: 3, max: 1, jitter: 0, duck: 0.6, duckTime: 1.8 },
  // Impacts — the bulk of the noise; cheap to steal.
  hit: { gap: 0.03, max: 6, prio: 0, gain: 0.9 },
  hit_crit: { gap: 0.035, max: 4, prio: 1 },
  hit_armor: { gap: 0.035, max: 4, prio: 0 },
  explode_small: { gap: 0.03, max: 6 },
  explode_medium: { gap: 0.04, max: 4 },
  explode_large: { gap: 0.06, max: 3, prio: 2 },
  explode_huge: { gap: 0.1, max: 2, prio: 3, duck: 0.4, duckTime: 1.2 },
  mortar_land: { gap: 0.04, max: 4 },
  burn: { gap: 0.06, max: 3, prio: 0 },
  // Enemy ordnance — slightly quieter than ours so the player's guns lead the mix.
  enemy_shot: { gap: 0.03, max: 4, prio: 0, gain: 0.75 },
  enemy_cannon: { gap: 0.04, max: 4, gain: 0.8 },
  enemy_flak: { gap: 0.04, max: 3, gain: 0.8 },
  enemy_zap: { gap: 0.04, max: 3, gain: 0.8 },
  wasp_charge: { gap: 0.08, max: 3 },
  wraith_phase: { gap: 0.1, max: 2 },
  mortar_whistle: { gap: 0.08, max: 3 },
  carrier_launch: { gap: 0.1, max: 2 },
  tesla_hum: { gap: 0.15, max: 2 },
  // Pickups.
  pickup_xp: { gap: 0.025, max: 4, prio: 0, jitter: 0.02 },
  pickup_cog: { gap: 0.03, max: 4, prio: 1 },
  pickup_repair: { prio: 2, max: 2 },
  pickup_steam: { prio: 2, max: 2 },
  pickup_bomb: { prio: 2, max: 2 },
  pickup_crate: { prio: 2, max: 2 },
  // Flow stingers — one at a time, never jittered, never stolen.
  wave_start: { prio: 4, max: 1, gap: 0.5, jitter: 0, duck: 0.3, duckTime: 1.2 },
  wave_clear: { prio: 4, max: 1, gap: 0.5, jitter: 0, duck: 0.4, duckTime: 1 },
  boss_warning: { prio: 4, max: 1, gap: 1, jitter: 0, duck: 0.6, duckTime: 3 },
  boss_roar: { prio: 4, max: 1, gap: 0.5, jitter: 0, duck: 0.5, duckTime: 1.8 },
  boss_phase: { prio: 4, max: 1, gap: 0.5, jitter: 0, duck: 0.4, duckTime: 1 },
  boss_death: { prio: 4, max: 1, gap: 0.5, jitter: 0, duck: 0.7, duckTime: 2.5 },
  stage_clear: { prio: 4, max: 1, gap: 0.5, jitter: 0, duck: 0.6, duckTime: 1.8 },
  game_over: { prio: 4, max: 1, gap: 0.5, jitter: 0, duck: 0.8, duckTime: 2.4 },
  victory: { prio: 4, max: 1, gap: 0.5, jitter: 0, duck: 0.8, duckTime: 2.4 },
  achievement: { prio: 4, max: 2, gap: 0.3, jitter: 0, duck: 0.3, duckTime: 1 },
  thunder: { prio: 2, max: 2, gap: 0.4, jitter: 0.08 },
};

/** Resolved metadata for every sound (unknown names get defaults). */
export function sfxMeta(name) {
  return META[name] || DEFAULT_META;
}
const META = {};
for (const name of Object.keys(SFX)) META[name] = { ...DEFAULT_META, ...META_RAW[name] };
