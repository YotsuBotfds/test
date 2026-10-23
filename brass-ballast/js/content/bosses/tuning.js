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
  ironMatriarch: 2.3, //  5175 hp → bot ~2.1–2.6 min at L6
  kraken: 2.7, //  9828 hp → ~2.7 min at L10
  stormEngine: 9.2, // 34960 hp → ~2.4–3.6 min at L14
  behemoth: 9.4, // 48880 hp → ~2.6–4.6 min at L18 (weak points: bridge ×2, hull hitboxes)
  sunFurnace: 4.6, // 34500 hp → ~4.1–4.3 min at L22 (shell plates halve most phase-1 hits)
};

/** Spawn hp for a boss def from its designed base hp. */
export function bossHp(id, base) {
  return Math.round(base * (BOSS_TOUGHNESS[id] ?? 1));
}
