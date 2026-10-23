// STUB (WP18 replaces) — auxiliary systems & evolutions (metadata only; no behavior yet).
function aux(id, name, desc, evolvesWith, evolution) {
  return { id, name, desc, icon: `icon_${id}`, maxLevel: 5, evolvesWith, evolution, levelDesc: () => 'Improved.', update() {} };
}
function evo(id, name, desc, from, requires) {
  return { id, name, desc, icon: `icon_${id}`, maxLevel: 1, from, requires, levelDesc: () => desc, update() {} };
}

export const AUX = {
  teslaCoil: aux('teslaCoil', 'Tesla Coil', 'Zaps nearby foes with chain lightning.', 'boiler', 'thunderhead'),
  rocketPods: aux('rocketPods', 'Rocket Pods', 'Volleys of homing rockets.', 'explosiveTips', 'hellfire'),
  flakTurret: aux('flakTurret', 'Flak Turret', 'Auto-aiming flak gun.', 'quickLoader', 'flakStorm'),
  clockDrones: aux('clockDrones', 'Clockwork Drones', 'Orbiting drones that shoot for you.', 'clockwork', 'droneArmada'),
  mineLayer: aux('mineLayer', 'Mine Layer', 'Drops proximity mines in your wake.', 'extraBallast', 'devilsMinefield'),
  steamVents: aux('steamVents', 'Scalding Vents', 'A searing aura of steam.', 'ironHide', 'scaldingNimbus'),
  broadside: aux('broadside', 'Broadside Battery', 'Flank cannons fire perpendicular to your hull.', 'rifling', 'shipOfTheLine'),
  gyroSaws: aux('gyroSaws', 'Gyro-Saws', 'Orbiting buzzsaws shred the close.', 'bigBore', 'buzzsawHalo'),
};
export const AUX_ORDER = Object.keys(AUX);

export const EVOLUTIONS = {
  thunderhead: evo('thunderhead', 'Thunderhead Dynamo', 'Constant arcs to every foe in range.', 'teslaCoil', 'boiler'),
  hellfire: evo('hellfire', 'Hellfire Barrage', 'Eight-rocket volleys with huge blasts.', 'rocketPods', 'explosiveTips'),
  flakStorm: evo('flakStorm', 'Flak Storm', 'Twin flak cannons, relentless.', 'flakTurret', 'quickLoader'),
  droneArmada: evo('droneArmada', 'Clockwork Armada', 'Six drones in formation.', 'clockDrones', 'clockwork'),
  devilsMinefield: evo('devilsMinefield', "Devil's Minefield", 'Mines everywhere, chain detonations.', 'mineLayer', 'extraBallast'),
  scaldingNimbus: evo('scaldingNimbus', 'Scalding Nimbus', 'A huge scalding cloud that shreds armor.', 'steamVents', 'ironHide'),
  shipOfTheLine: evo('shipOfTheLine', 'Ship of the Line', 'Full broadsides every second.', 'broadside', 'rifling'),
  buzzsawHalo: evo('buzzsawHalo', 'Grand Buzzsaw Halo', 'A ring of giant saws.', 'gyroSaws', 'bigBore'),
};
