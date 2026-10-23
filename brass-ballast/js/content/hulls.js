// STUB (WP19 replaces) — player hulls. DESIGN §2.5.
export const HULLS = {
  dauntless: {
    id: 'dauntless', name: 'The Dauntless', title: 'Guild Cutter', sprite: 'hull_dauntless',
    desc: 'A balanced Free Skies cutter. Forgiving and dependable.', perk: 'Balanced.',
    base: { maxHp: 100, speed: 240 }, startAux: [], startPassives: {}, unlock: null,
  },
  cormorant: {
    id: 'cormorant', name: 'The Cormorant', title: 'Racing Zeppelin', sprite: 'hull_cormorant',
    desc: 'Lean and quick. Cheap boosts, thin plating.', perk: 'Starts with Aerodynamic Fins; +20% steam regen.',
    base: { maxHp: 70, speed: 290, boostCost: 20 }, startAux: [], startPassives: { fins: 1 }, unlock: { cogs: 500 },
  },
  bulwark: {
    id: 'bulwark', name: 'The Bulwark', title: 'Armored Airship', sprite: 'hull_bulwark',
    desc: 'A flying fortress. Slow, armored, bristling with cannon.', perk: 'Starts with a Broadside Battery.',
    base: { maxHp: 160, armor: 2, speed: 200 }, startAux: ['broadside'], startPassives: {}, unlock: { cogs: 1200 },
  },
  tinker: {
    id: 'tinker', name: "The Tinker's Folly", title: 'Experimental Gyrocraft', sprite: 'hull_tinker',
    desc: 'An inventor’s fever dream. More choices, more gadgets.', perk: '+1 card choice; starts with Clockwork Drones.',
    base: { maxHp: 90, speed: 235, extraChoices: 1 }, startAux: ['clockDrones'], startPassives: {}, unlock: { stage: 3 },
  },
  bane: {
    id: 'bane', name: "The Leviathan's Bane", title: 'Monster Hunter', sprite: 'hull_bane',
    desc: 'Built to kill dreadnoughts. Hits harder, rounds pierce.', perk: '+15% damage; +1 pierce.',
    base: { maxHp: 120, speed: 250, damage: 1.15, pierce: 1 }, startAux: [], startPassives: {}, unlock: { win: true },
  },
};
export const HULL_ORDER = ['dauntless', 'cormorant', 'bulwark', 'tinker', 'bane'];
