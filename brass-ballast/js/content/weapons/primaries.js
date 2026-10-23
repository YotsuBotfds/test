// STUB (WP17 replaces) — primary cannons. All fire like the Brass Cannon for now.
// Shows the weapon contract: the weapon owns its cooldown and calls world.fire().

function cannonUpdate(def) {
  return function update(player, wpn, dt, world, input) {
    wpn.cd = (wpn.cd || 0) - dt;
    wpn.kick = Math.max(0, (wpn.kick || 0) - dt * 6);
    if (!input.firing || wpn.cd > 0) return;
    const s = player.stats;
    const b = def.base(wpn.level);
    wpn.cd = 1 / (b.rate * s.fireRate);
    const count = b.count + s.projCount;
    const m = player.muzzle();
    const dmg = b.damage * s.damage * (world.run?.mods?.playerDmg ?? 1);
    for (let i = 0; i < count; i++) {
      const a = input.angle + (i - (count - 1) / 2) * b.spread * s.spread;
      world.fire({
        team: 'player', kind: 'ball', x: m.x, y: m.y, angle: a, speed: b.speed * s.projSpeed,
        r: 6 * s.area, damage: dmg, life: 1.2, pierce: s.pierce, bounce: s.bounce,
        owner: player, source: 'primary', trail: 'smoke',
      });
    }
    wpn.kick = 1;
    world.fx.muzzle(m.x, m.y, input.angle);
    world.sfx(def.sfx, m.x, m.y);
  };
}

function primary(id, name, desc, sfx, unlock) {
  const def = {
    id, name, desc, sfx, unlock, icon: `icon_${id}`, turret: `turret_${id}`, maxLevel: 8,
    levelDesc: () => '+12% damage, +6% rate',
    base: (l) => ({ damage: 14 * (1 + 0.12 * (l - 1)), rate: 4 * (1 + 0.06 * (l - 1)), speed: 720, count: 1 + (l >= 3) + (l >= 6), spread: 0.12 }),
  };
  def.update = cannonUpdate(def);
  return def;
}

export const PRIMARIES = {
  brassCannon: primary('brassCannon', 'Brass Cannon', 'Reliable brass cannonballs.', 'fire_cannon', null),
  gatling: primary('gatling', 'Gatling Repeater', 'A hail of brass slugs once it spins up.', 'fire_gatling', { cogs: 300 }),
  blunderbuss: primary('blunderbuss', 'Flak Blunderbuss', 'Point-blank pellet storm.', 'fire_blunderbuss', { cogs: 400 }),
  mortar: primary('mortar', 'Siege Mortar', 'Lobbed shells that burst on landing.', 'fire_mortar', { cogs: 600 }),
  aetherLance: primary('aetherLance', 'Aether Lance', 'Piercing bolts of bottled lightning.', 'fire_lance', { cogs: 800 }),
  harpoon: primary('harpoon', 'Harpoon Gun', 'Heavy barbed harpoons that skewer lines of foes.', 'fire_harpoon', { cogs: 700 }),
};
export const PRIMARY_ORDER = ['brassCannon', 'gatling', 'blunderbuss', 'mortar', 'aetherLance', 'harpoon'];
