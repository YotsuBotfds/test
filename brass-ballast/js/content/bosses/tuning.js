// Campaign boss toughness (integration tuning). Each boss def keeps its designed BASE_HP —
// destructible parts, armour and phase thresholds are authored against it — and its spawned hp
// is BASE_HP × BOSS_TOUGHNESS[id]. Parts that scale with `maxHp / BASE_HP` scale along, so a
// tougher boss means a longer fight with the same structure, not a damage sponge.
//
// Measured with the autopilot (god mode, random level-up builds) at the level a campaign player
// typically has on arrival — stage 1 ≈ L6, 2 ≈ L10, 3 ≈ L14, 4 ≈ L18, 5 ≈ L22 — the fights last
// about 2 min (stage 1) rising to ~4 min (final). Humans aim worse than the bot, so expect a
// little longer. Endless and boss rush scale on top of this with run.bossHpMult.

export const BOSS_TOUGHNESS = {
  ironMatriarch: 2.6, //  5850 hp → ~2 min bot fight at L6
  kraken: 2.9, // 10556 hp → ~2.6 min at L10
  stormEngine: 7.2, // 27360 hp → ~3 min at L14
  behemoth: 8.4, // 43680 hp → ~3.5 min at L18
  sunFurnace: 6.4, // 48000 hp → ~4 min at L22 (many hits are halved by the shell plates)
};

/** Spawn hp for a boss def from its designed base hp. */
export function bossHp(id, base) {
  return Math.round(base * (BOSS_TOUGHNESS[id] ?? 1));
}
