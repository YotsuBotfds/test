// Auxiliary weapon systems & evolutions (WP18, DESIGN §2.7, §12 WP18).
//
// Def contract: {id, name, desc, icon:'icon_<id>', maxLevel, levelDesc(level), evolvesWith,
// evolution, init?(player, slot, world), update(player, slot, dt, world),
// draw?(ctx, player, slot, world), drawUnder?(…), remove?(player, slot, world)}.
// Evolutions add {from, requires} and are single-level legendaries that replace their source
// aux in the same slot (player.evolveAux).
//
// Behaviours live in aux-*.js (one file per family) and share helpers from aux-common.js; the
// hardware sprites they draw are registered by aux-art.js. Per-slot state lives in slot.data;
// every system publishes slot.cd / slot.cdMax (seconds) for HUD cooldown sweeps (cdMax 0 =
// continuous). All damage carries source 'aux:<id>' and honours stats.damage ×
// run.mods.playerDmg, cooldown, area, duration, projCount, knockback and crit.

import './aux-art.js';
import { TeslaCoil, Thunderhead } from './aux-tesla.js';
import { RocketPods, Hellfire } from './aux-rockets.js';
import { FlakTurret, FlakStorm } from './aux-flak.js';
import { ClockDrones, DroneArmada } from './aux-drones.js';
import { MineLayer, DevilsMinefield } from './aux-mines.js';
import { SteamVents, ScaldingNimbus } from './aux-steam.js';
import { Broadside, ShipOfTheLine } from './aux-broadside.js';
import { GyroSaws, BuzzsawHalo } from './aux-saws.js';

/** Build an aux def: metadata (UI/icon contract) + behaviour. */
function aux(id, name, desc, evolvesWith, evolution, behavior) {
  return { id, name, desc, icon: `icon_${id}`, maxLevel: 5, evolvesWith, evolution, ...behavior };
}

/** Build an evolution def (legendary, one level). */
function evo(id, name, desc, from, requires, behavior) {
  return {
    id, name, desc, icon: `icon_${id}`, maxLevel: 1, from, requires,
    legendary: true, levelDesc: () => desc, ...behavior,
  };
}

export const AUX = {
  teslaCoil: aux('teslaCoil', 'Tesla Coil', 'Zaps nearby foes with chain lightning.', 'boiler', 'thunderhead', TeslaCoil),
  rocketPods: aux('rocketPods', 'Rocket Pods', 'Volleys of homing rockets.', 'explosiveTips', 'hellfire', RocketPods),
  flakTurret: aux('flakTurret', 'Flak Turret', 'Auto-aiming flak gun.', 'quickLoader', 'flakStorm', FlakTurret),
  clockDrones: aux('clockDrones', 'Clockwork Drones', 'Orbiting drones that shoot for you.', 'clockwork', 'droneArmada', ClockDrones),
  mineLayer: aux('mineLayer', 'Mine Layer', 'Drops proximity mines in your wake.', 'extraBallast', 'devilsMinefield', MineLayer),
  steamVents: aux('steamVents', 'Scalding Vents', 'A searing aura of steam.', 'ironHide', 'scaldingNimbus', SteamVents),
  broadside: aux('broadside', 'Broadside Battery', 'Flank cannons fire perpendicular to your hull.', 'rifling', 'shipOfTheLine', Broadside),
  gyroSaws: aux('gyroSaws', 'Gyro-Saws', 'Orbiting buzzsaws shred the close.', 'bigBore', 'buzzsawHalo', GyroSaws),
};
export const AUX_ORDER = Object.keys(AUX);

export const EVOLUTIONS = {
  thunderhead: evo('thunderhead', 'Thunderhead Dynamo',
    'Constant arcs to every foe in range, and a storm burst of sky-bolts every few seconds.',
    'teslaCoil', 'boiler', Thunderhead),
  hellfire: evo('hellfire', 'Hellfire Barrage',
    'Eight-rocket volleys with huge incendiary blasts that leave the sky burning.',
    'rocketPods', 'explosiveTips', Hellfire),
  flakStorm: evo('flakStorm', 'Flak Storm',
    'Twin heavy flak cannons, relentless fire, bigger bursts and shrapnel.',
    'flakTurret', 'quickLoader', FlakStorm),
  droneArmada: evo('droneArmada', 'Clockwork Armada',
    'Six drones in formation fire faster — and dive kamikaze into the toughest foes.',
    'clockDrones', 'clockwork', DroneArmada),
  devilsMinefield: evo('devilsMinefield', "Devil's Minefield",
    'Mines everywhere: hurled spiked mines creep toward prey and chain-detonate.',
    'mineLayer', 'extraBallast', DevilsMinefield),
  scaldingNimbus: evo('scaldingNimbus', 'Scalding Nimbus',
    'A huge scalding cloud with geysers that shreds armour: foes inside take +25% damage.',
    'steamVents', 'ironHide', ScaldingNimbus),
  shipOfTheLine: evo('shipOfTheLine', 'Ship of the Line',
    'Full five-gun broadsides every second with explosive shells; every fourth is double-shotted.',
    'broadside', 'rifling', ShipOfTheLine),
  buzzsawHalo: evo('buzzsawHalo', 'Grand Buzzsaw Halo',
    'A ring of giant saws that breathes in and out around your ship.',
    'gyroSaws', 'bigBore', BuzzsawHalo),
};
