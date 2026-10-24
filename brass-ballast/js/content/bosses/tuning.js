// Campaign boss toughness (integration tuning). Each boss def keeps its designed BASE_HP —
// destructible parts, armour and phase thresholds are authored against it — and its spawned hp
// is BASE_HP × BOSS_TOUGHNESS[id]. Parts that scale with `maxHp / BASE_HP` scale along, so a
// tougher boss means a longer fight with the same structure, not a damage sponge.
//
// Measured with the autopilot (god mode, seeded random level-up builds, botskill 0.75–1 — the bot
// aims better than most humans, so a person takes ~20–40% longer) at the level a campaign player
// typically has on arrival — stage 1 ≈ L6, 2 ≈ L10, 3 ≈ L14, 4 ≈ L18, 5 ≈ L22. Bot fights land
// around 2.5 min (stage 1) rising to ~4 min (final), every phase getting ≥ 35 s of screen time
// (phase 1 ≈ half the fight). Build variance is large (±35%). Endless and boss rush scale on top
// of this with run.bossHpMult.

export const BOSS_TOUGHNESS = {
  ironMatriarch: 4, //  5175 hp → bot ~2.1–2.6 min at L6
  kraken: 8.5, //  9828 hp → ~2.7 min at L10
  stormEngine: 16, // 34960 hp → ~2.4–3.6 min at L14
  behemoth: 29, // 48880 hp → ~2.6–4.6 min at L18 (weak points: bridge ×2, hull hitboxes)
  sunFurnace: 21, // 34500 hp → ~4.1–4.3 min at L22 (shell plates halve most phase-1 hits)
};

/** Per-boss damage multiplier on top of the stage's dmgMult (bodies & parts; world.damagePlayer,
 *  hazards and shots all scale by the owner's dmgMult). Evens out the threat curve: the Storm
 *  Engine's lightning was the deadliest fight in the campaign, the Behemoth's broadsides the
 *  mildest. */
export const BOSS_DAMAGE = {
  ironMatriarch: 0.6,
  kraken: 0.7,
  stormEngine: 0.55,
  behemoth: 1.6,
  sunFurnace: 0.85,
};

/** Damage multiplier for a boss id (1 when untuned). */
export function bossDamage(id) {
  return BOSS_DAMAGE[id] ?? 1;
}

/** Spawn hp for a boss def from its designed base hp. */
export function bossHp(id, base) {
  return Math.round(base * (BOSS_TOUGHNESS[id] ?? 1));
}
