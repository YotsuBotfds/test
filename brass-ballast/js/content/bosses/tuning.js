// Campaign boss toughness (integration tuning). Each boss def keeps its designed BASE_HP —
// destructible parts, armour and phase thresholds are authored against it — and its spawned hp
// is BASE_HP × BOSS_TOUGHNESS[id]. Parts that scale with `maxHp / BASE_HP` scale along, so a
// tougher boss means a longer fight with the same structure, not a damage sponge.
//
// Balance pass: measured over 24+ full autopilot campaigns (botskill 0.55–0.7, sponge deaths,
// seeded runs, Brass Cannon) — every boss met with the build the run really has (arrival ≈ L9 /
// L14 / L18 / L22 / L26 with ~8–12 crate picks and a refit per boss). Median fights ≈ 2.3 / 2.6 /
// 3.5 / 4 / 4.7 min from stage 1 to the finale (a person takes ~20–40% longer), every phase
// reached in every run; build variance is large (±40%). The other primaries were checked too
// (two campaigns each): all finish, the Blunderbuss slowest on the Matriarch. Endless and boss
// rush scale on top of this with run.bossHpMult.

export const BOSS_TOUGHNESS = {
  ironMatriarch: 5.2, // 11700 hp → ~2.3 min
  kraken: 9.5, //       34580 hp → ~2.6 min (arms forward 75% to the body; regrow per phase)
  stormEngine: 17, //   64600 hp → ~3.5 min
  behemoth: 34, //     176800 hp → ~4 min (weak points: bridge ×2, hull hitboxes)
  sunFurnace: 21, //   157500 hp → ~4.7 min (shell plates halve most phase-1 hits)
};

/** Per-boss damage multiplier on top of the stage's dmgMult (bodies & parts; world.damagePlayer,
 *  hazards and shots all scale by the owner's dmgMult). Makes the threat rise stage by stage: the
 *  first two bosses stay onboarding fights (bot deaths in ~15–25% of runs), the Storm Engine's
 *  lightning was the deadliest fight in the campaign, the Behemoth's broadsides the mildest. */
export const BOSS_DAMAGE = {
  ironMatriarch: 0.65,
  kraken: 0.6,
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
