// Lore, tips and flavour text for Brass & Ballast (DESIGN §12 WP11).
//
// Plain data only: no imports, so Node can import this module for validation. Tips describe
// mechanics exactly as DESIGN §2 documents them; if a number changes there, change it here too.
// Taunt and quip lines are capped at 70 characters so they fit a banner on one line.

/**
 * Codex entries, keyed by content id. Enemies, bosses, hulls, weapons (primaries, auxiliaries
 * and evolutions) and stages each get a lore blurb. Enemies and bosses also get a gameplay tip.
 * @type {{
 *   enemies: Record<string, {title: string, lore: string, tip: string}>,
 *   bosses: Record<string, {title: string, lore: string, tip: string}>,
 *   hulls: Record<string, {lore: string, tip?: string}>,
 *   weapons: Record<string, {lore: string, tip?: string}>,
 *   stages: Record<string, {lore: string, tip?: string}>
 * }}
 */
export const CODEX = {
  enemies: {
    gyroScout: {
      title: 'Hornets of the Gyre',
      lore: 'Brass-jacketed hornets stamped out by the gross in Syndicate foundries. Their gyroscopes ' +
        'keep them spinning sideways through the sky in a lazy sine weave, and they arrive in swarms ' +
        'thick enough to make a sensible captain reach for the rum. Individually they are nothing. ' +
        'Collectively they are an argument.',
      tip: 'Gyro Scouts have only 10 hp, so one cannon hit ends one. Their weave makes them hard to ' +
        'lead, so aim where they are heading rather than where they are.',
    },
    kiteBomber: {
      title: 'Kites of Ruin',
      lore: 'Stubby strafers that come sweeping across the sky in straight, merciless lines. Each ' +
        'one carries a crate of fused bombs and drops them on the spot where it thinks you will be, ' +
        'which is an insult to your intelligence and a terrible threat to your hull. The Syndicate ' +
        'calls this precision bombing. Sailors call it a good reason to keep moving.',
      tip: 'Kite Bombers drop bombs that fuse for 1.2 seconds with a 60-unit blast. Keep moving; ' +
        'never stand where a kite just passed over.',
    },
    balloonMine: {
      title: 'Mournful Balloons',
      lore: 'Patched gasbags stuffed with black powder and worse intentions. They drift toward you at ' +
        'a leisurely pace, humming to themselves, and detonate when they get close enough to ' +
        'matter. Shoot one down and it goes off anyway, so the only courteous thing to do with a ' +
        'balloon is to leave it alone.',
      tip: 'Balloon Mines explode when killed as well as when they reach you, with an 80-unit blast ' +
        'that hurts everyone nearby, you included. Pop them from long range.',
    },
    gunboat: {
      title: 'Plunder Dogs of the Iron Flag',
      lore: 'Syndicate privateers who learned to fly without ever learning to sail, which is the only ' +
        'thing they and the sea have ever agreed on. They hang in the air at a respectful distance ' +
        'and circle like sharks around a rowboat, loosing three-shot spreads on a steady clock. ' +
        'Their captains believe in discipline. Their cook does not.',
      tip: 'Gunboats hold about 350 units of range and fire a three-shot spread every 2 seconds. ' +
        'Close the distance to break their range, or boost sideways through the spread.',
    },
    clockWasp: {
      title: 'Winding Death',
      lore: 'A wasp of wound brass with a stinger like a surgeon’s needle and a temper to match. It ' +
        'circles and hums, then lunges with a sound like a music-box spring snapping. The Syndicate ' +
        'paints a red warning line across the sky before every dash, which is a courtesy from a ' +
        'machine that otherwise has no manners at all.',
      tip: 'A Clockwork Wasp shows a red telegraph line for half a second before its dash at 520 ' +
        'units per second. Step out of the line, then shoot it between dashes.',
    },
    flakIsland: {
      title: 'The Drifting Battery',
      lore: 'A chunk of sky-rock with a flak gun bolted to its back, wandering slowly across the cloud ' +
        'banks like a retired mountain. Its gunners aim with meticulous care at wherever you were a ' +
        'moment ago, which is why you should never stay where you were. Their shells burst into ' +
        'shrapnel and their shrapnel is the stuff of nightmares.',
      tip: 'A Flak Battery’s shell bursts into eight shards at the point it targets. Keep moving ' +
        'rather than holding still under its guns.',
    },
    carrier: {
      title: 'Mother of Hornets',
      lore: 'A gasbag the size of a cathedral, with a belly hangar that opens like a whale’s mouth to ' +
        'spit out gyro scouts every few seconds. It moves with the grace of a wet funeral and ' +
        'with roughly the same urgency. Your job is simple: kill the mother before her brood ' +
        'learns to fly in formation.',
      tip: 'Zeppelin Carriers launch three gyro scouts every 4 seconds and have 160 hp. Focus the ' +
        'carrier, or the hornets keep coming for as long as it stays up.',
    },
    teslaBuoy: {
      title: 'The Humming Buoys',
      lore: 'Tesla buoys bob in matched pairs on the swell, humming a low note that makes your teeth ' +
        'ache. Lightning leaps from one to the other, and anything caught in the stroke is cooked ' +
        'a little more with every tick. The Syndicate believes in redundancy, so they never ' +
        'deploy just one.',
      tip: 'Tesla Buoys spawn in linked pairs, and the arc between them hits for 8 damage per tick. ' +
        'Fight from outside the pair, never from between them.',
    },
    frigate: {
      title: 'The Ironclad Broadsider',
      lore: 'An ironclad that turns its armoured flank to present the most ostentatious broadside it ' +
        'can manage, then looses five cannonballs in a stately arc. The Syndicate calls this ' +
        'naval discipline. Your gunner calls it a bloody great target, and asks if he may please ' +
        'have a go.',
      tip: 'Frigates turn broadside to you and loose five-ball volleys. Keep moving rather than ' +
        'holding station in front of the ironclad.',
    },
    ornithopter: {
      title: 'The Flapping Ace',
      lore: 'Mechanical birds with an ace’s heart and a cheat’s eyes. They strafe through mid-range, ' +
        'firing aimed bursts of four shots, then twitch sideways out of the path of your best shots ' +
        'like a cat dodging a bath. Their pilots are hilariously smug about it, and sadly, they ' +
        'have every right to be.',
      tip: 'Ornithopters sidestep player shots and fire aimed bursts of four. A single straight shot ' +
        'is the easiest to dodge, so favour spreads and Flak Blunderbuss volleys.',
    },
    steamWraith: {
      title: 'The Pale Vapour',
      lore: 'A ghost of condensed boiler steam, shaped like a drowned sailor and drawn to lonely ' +
        'airships. It phases out of this world for two seconds, then re-forms right on top of a ' +
        'pilot and exhales a ring of twelve bullets that scatters everyone in the neighbourhood. ' +
        'The crew swears it whistles hymns. Nobody has stayed long enough to check.',
      tip: 'Steam Wraiths are invulnerable and translucent for 2 seconds while phased. Stop firing, ' +
        'reposition, and wait for them to solidify before you shoot again.',
    },
    mortarBarge: {
      title: 'The Lobbing Scow',
      lore: 'A barge of riveted iron that never comes close, preferring to lob shells from a polite ' +
        'distance. Each shell is aimed at the spot where you were when the gunners last looked, ' +
        'with a telegraph circle painted on the sky so you can admire the tactics before they ' +
        'kill you. It is, the crew insists, very civilised.',
      tip: 'Mortar Barges keep their distance and aim shells at your position, marked by a telegraph ' +
        'circle. Keep moving, because the shell lands where you were.',
    },
  },

  bosses: {
    ironMatriarch: {
      title: 'Flagship of the Syndicate',
      lore: 'Nearly four hundred units of riveted dreadnought wearing the Syndicate’s colours like a bad ' +
        'wedding dress. She keeps four deck turrets on her back, sweeps the sky with broadside ' +
        'fire, and only exposes her glowing core when she is good and ready. When she finally ' +
        'wakes up angry, she starts to smoke.',
      tip: 'Her four deck turrets can be destroyed. Clear them, then concentrate every shot on the ' +
        'core once it is exposed.',
    },
    kraken: {
      title: 'Terror of the Smog',
      lore: 'A clockwork squid the size of a parish, six segmented tentacles coiled through the ' +
        'factory smog. She sways, she slams, and she spits ink clouds so thick that the sky ' +
        'forgets which way is up. Her tentacles are fine engineering, which is why they can be ' +
        'cut off, and why she will grow angrier when you do.',
      tip: 'Tentacles slam along telegraphed lines and can be severed. Watch each telegraph and step ' +
        'off the line before the slam lands.',
    },
    stormEngine: {
      title: 'Thunder Made Iron',
      lore: 'A Tesla tower spun up on a storm-front and fitted with rotating arms that sweep the ' +
        'sky like a lighthouse with a grudge. She calls lightning down on telegraphed marks, drags ' +
        'your ship toward her with her magnetic pull, and orbits conductor spheres that snap at ' +
        'anything nearby. The storm is not her weather. It is her weapon.',
      tip: 'Lightning strikes are telegraphed on the ground first. Move off the marked spot before ' +
        'the bolt lands, and keep out of the sweep of the beam arms.',
    },
    behemoth: {
      title: 'The Admiral’s Fist',
      lore: 'Admiral Vex’s flagship-of-flagships, a carrier-battleship with a hangar that releases ' +
        'screaming ornithopters and a mortar battery that answers only to the Admiral’s whim. She ' +
        'builds walls of bullets with carefully placed gaps and then taunts you through them. Vex ' +
        'considers every gap a personal invitation, and every invitation a challenge.',
      tip: 'Find the gaps in the bullet walls and fly through them. Mortar barrages show their ' +
        'telegraph circles before they land, so move before the shadow reaches you.',
    },
    sunFurnace: {
      title: 'Heart of the Syndicate',
      lore: 'A colossal spherical foundry, its shell built from rotating armoured plates that part ' +
        'only to reveal the molten heart within. Slag spirals tumble out of the gaps, flame jets ' +
        'fire where you least expect them, and once she starts to shed her shell, she does not ' +
        'stop until the sky is on fire. The Syndicate calls her the finest work of the age. Vex ' +
        'calls her the end of your career.',
      tip: 'Shoot through the gaps between the rotating shell plates to reach the core. In the final ' +
        'phase, her desperation pattern is the one to watch for.',
    },
  },

  hulls: {
    dauntless: {
      lore: 'The first airship ever to fly under the Brass & Ballast flag, a sturdy cream-canvas ' +
        'gasbag with a brass gondola and a temperament like an old dog. It is not fast, not flashy, ' +
        'and not likely to let you down.',
    },
    cormorant: {
      lore: 'A lean, fast ship named for the diving bird, all fins and steam lungs. Her crew swears ' +
        'she can outrun her own shadow on a good day, and she will happily prove it if you let her.',
    },
    bulwark: {
      lore: 'Armour plate upon armour plate upon a sturdy keel, the Bulwark flies like a fortress ' +
        'that has decided, against all advice, to go to sea. She is slow to turn and impossible to ' +
        'argue with.',
    },
    tinker: {
      lore: 'Built by a tinkerer who insisted his ship could fly on spite alone. The Folly has more ' +
        'gears than sense and more sense than anybody expected, with one extra card slot for ' +
        'whatever brilliant idea he comes up with next.',
    },
    bane: {
      lore: 'Forged from the ribs of a Leviathan that once tried to eat a convoy. Her hull is still ' +
        'bitter about it, and she sails with the sort of confidence that only comes from having ' +
        'lived through it.',
    },
  },

  weapons: {
    brassCannon: {
      lore: 'The honest old brass cannon that every skyship started with and most still carry. It ' +
        'makes a sound like a dropped anvil and throws a ball that never hesitates. A reliable gun ' +
        'for a reliable captain.',
    },
    gatling: {
      lore: 'Six barrels turning on a crank, spinning up with a rising whine until the air around ' +
        'them rings. It is loud, it is wasteful, and it has made more than one Syndicate ace very ' +
        'sorry for mocking it.',
    },
    blunderbuss: {
      lore: 'A flared-barrel scattergun loaded with flak. Each blast throws six pellets in a cone ' +
        'so wide that aiming becomes a matter of faith, and the recoil knocks your ship sideways ' +
        'as a reminder of the cost of cheap ammunition.',
    },
    mortar: {
      lore: 'A squat, elegant siege gun that lobs its shells high over the battlefield. The shells ' +
        'come down where you point them, flatten everything in a wide circle, and make the sort of ' +
        'noise that gets people talking in every port from here to the Furnace.',
    },
    aetherLance: {
      lore: 'A thin, humming beam of captured aether that punches straight through everything in its ' +
        'path. It is elegant, ruthless and utterly indifferent to who else happens to be standing in ' +
        'the line of fire.',
    },
    harpoon: {
      lore: 'A barbed iron spear fired from a winch, tethered to the ship by a length of chain. It ' +
        'skewers three targets in a line and yanks them toward you hard enough to rattle teeth. The ' +
        'Syndicate has since banned the harpoon in tavern brawls.',
    },
    teslaCoil: {
      lore: 'A copper cage of coils crackling with stolen lightning. It lashes out at the nearest ' +
        'cluster of enemies and leaps from one victim to the next, so that a single crackle can ' +
        'cook a whole flight of scouts.',
    },
    rocketPods: {
      lore: 'Twin pods of homing rockets that scream off every few seconds to hunt the nearest ' +
        'enemy. They are unreliable in exactly the way that makes them spectacular, and they explode ' +
        'with enthusiasm when they do land.',
    },
    flakTurret: {
      lore: 'A rapid-fire flak turret that swivels on its own, picking out the nearest enemy within ' +
        'range and filling the sky with bursts. It never sleeps, never tires, and never asks for ' +
        'thanks.',
    },
    clockDrones: {
      lore: 'Clockwork drones that orbit the ship on tiny brass wings and open fire on whatever ' +
        'they can see. They are fussy about their winding and terribly loyal to the captain who ' +
        'remembered to oil them.',
    },
    mineLayer: {
      lore: 'A rack of proximity mines that drop from the ship’s keel on a steady schedule. They drift ' +
        'in the air like sinister dandelions, waiting for a Syndicate pilot to stroll too close. The ' +
        'Syndicate, sadly, keeps strolling too close.',
    },
    steamVents: {
      lore: 'Scalding vents along the hull release clouds of boiling steam that sear anything nearby ' +
        'and slow the unlucky. The vents are a little embarrassing to be around, and the crew has ' +
        'learned to stand well clear when they open.',
    },
    broadside: {
      lore: 'Batteries of cannons mounted along both flanks of the ship, firing perpendicular to the ' +
        'hull in a full, ceremonial salvo. The gun crews take their duty so seriously that they ' +
        'practice their salutes between broadsides.',
    },
    gyroSaws: {
      lore: 'A pair of spinning saw-blades that orbit the ship on gyroscopic arms, shredding anything ' +
        'they touch. They whistle as they turn, and the enemy learns very quickly to respect the ' +
        'sound.',
    },
    thunderhead: {
      lore: 'A Tesla coil overcharged past reason, bristling with sparks until it sings like a storm. ' +
        'Its lightning arcs wider and hits harder, and its engineers now sleep with fire extinguishers ' +
        'under their pillows.',
    },
    hellfire: {
      lore: 'The rocket pods, fed with a secret mix of tarry fuel and a few regrettable chemicals. ' +
        'The barrage that results makes the sky look like an opera house on fire, and the audience ' +
        'is never seen again.',
    },
    flakStorm: {
      lore: 'The flak turret taken to its logical conclusion, with a quickloader that never stops and ' +
        'barrels that heat to a faint red. The flak comes so thick and so fast that it becomes a ' +
        'weather event.',
    },
    droneArmada: {
      lore: 'Dozens of clockwork drones now, a swarm of brass wings and whirring gears that ' +
        'darkens the sun when they rise. Their winder has been retired from sleep permanently, ' +
        'and his cot is now a shrine to the drones.',
    },
    devilsMinefield: {
      lore: 'The mine layer’s reserves, replenished beyond any sane limit. The minefield that ' +
        'results turns the sky into a checkerboard of death, and the Syndicate pilots have started ' +
        'calling it the Devil’s own garden.',
    },
    scaldingNimbus: {
      lore: 'The steam vents swelled into a permanent cloud of boiling mist that trails the ship and ' +
        'scalds everything within reach. Fishermen on the Brassbay shore now refer to it as the ' +
        'Nimbus and do not like to say its name aloud.',
    },
    shipOfTheLine: {
      lore: 'The broadside batteries rifled to a fine edge and set in stacked decks along every flank. ' +
        'When she fires a full salvo, the sky goes white, the sea goes quiet and the admiralty ' +
        'writes a very nervous report.',
    },
    buzzsawHalo: {
      lore: 'The gyro-saws grown to a full halo, a ring of whirling blades that drinks the light and ' +
        'spits back shards of iron. Any enemy caught inside it leaves in several pieces, which the ' +
        'crew describes as a tidy finish.',
    },
  },

  stages: {
    brassbay: {
      lore: 'Dawn over the harbour, all gold and peach. Fishing smacks ring their bells below, patchwork ' +
        'fields roll away toward the sea, and the Syndicate’s first raiders come howling out of the ' +
        'clouds like they own the place. They do not, yet.',
    },
    smog: {
      lore: 'The factory-city of the Smog Wastes, where chimneys breathe out sepia haze and the ' +
        'streets run with soot and ambition. The people here have learned to cough politely and ' +
        'keep their heads down, which is the only sensible reaction to a city that never stops ' +
        'working.',
    },
    tempest: {
      lore: 'Tempest Reach, a slate-blue storm that never seems to end. Whitecaps stripe the dark sea, ' +
        'rocky islets jut like broken teeth, and lightning dances between the clouds as if it has ' +
        'been invited. The sailors here do not pray for calm. They pray for a good barometer.',
      tip: 'Wind gusts in Tempest Reach push your airship sideways. Counter-steer or boost out of a ' +
        'gust rather than fighting it head on.',
    },
    aurora: {
      lore: 'The Aurora Drift, a night of deep blue and violet where the snowy peaks glow under ribbons ' +
        'of light. Floating islands drift above the town lanterns, and the stars come out so close ' +
        'that you could hang a lantern off one. The Syndicate tends to ruin the view.',
    },
    furnace: {
      lore: 'The Furnace Crown: molten rivers, foundries roaring, and embers rising like sparks from a ' +
        'burning hymnbook. The heat tints the air crimson and the sky goes a shade of orange no ' +
        'painter has ever dared to use. This is where the Syndicate forges its ships, and where it ' +
        'intends to forge its legend.',
    },
  },
};

/**
 * Loading-screen tips, each a single sentence about a real mechanic.
 * @type {string[]}
 */
export const TIPS = [
  'Boost costs 30 steam and grants i-frames for 0.35 seconds. Dash straight through a volley.',
  'Ballast bombs fuse for 0.6 seconds, then blast a 170-unit radius that clears every enemy bullet inside.',
  'Steam refills about 14 a second, so a boost every couple of seconds is sustainable.',
  'Kills within 2.5 seconds of each other build a combo, worth 10% more per link, up to five times.',
  'Taking damage resets your combo chain. A clean run pays better than a greedy one.',
  'Elite enemies drop Armory Crates half the time. Opening one gives you a bonus card on the spot.',
  'An evolution needs its auxiliary at level 5 and its partner passive. Boilers pair with Tesla Coils.',
  'Siege Mortar shells fly over enemies and only land at the aim point. They ignore collisions in flight.',
  'Workshop upgrades are permanent. Every cog you spend in the Hangar stays spent for every future run.',
  'After each boss comes a Refit: pick one of three rare-or-better cards and heal 40% of your hull.',
  'The Daily Squall rolls two random modifiers. You get one best score per day, so choose your moment.',
  'Balloon Mines explode when killed, hurting everything within 80 units. Pop them from afar.',
  'Clockwork Wasps draw a red line for half a second before they dash. Step off it and shoot between dashes.',
  'Flak Batteries burst into eight shards at the point they target. Keep moving under their guns.',
  'Steam Wraiths are invulnerable for their 2 seconds of phase. Wait for them to solidify, then fire.',
  'Mortar Barges aim at your position. Keep moving, because their shells land where you were.',
  'Ornithopters sidestep straight shots. Wide spreads and Flak Blunderbuss volleys hit them more often.',
  'The Aether Shield blocks one hit every 20 minus 4 times its level in seconds.',
  'Second gamepad? Press Start mid-run to drop into co-op as Player 2.',
  'The Harpoon Gun pierces three enemies in a line and knocks each one back hard.',
  'The Aether Lance pierces forever. A line of enemies is a line of targets.',
  'Blunderbuss pellets lose their speed fast. Fire at close range for the full punch.',
  'Pickups are magnetised within 90 units of you. A Lodestone Magnet widens that reach.',
  'Storms in Tempest Reach push your airship with gusts. Counter-steer or boost clear of them.',
  'The Emergency Balloon in the Workshop revives you once per run at 30% hull.',
];

/**
 * Admiral Vex and the boss crews' lines, per boss id. Each entry has three intro lines, three
 * phase-change lines and two death lines. Every line is at most 70 characters.
 * @type {Record<string, {intro: string[], phase: string[], death: string[]}>}
 */
export const TAUNTS = {
  ironMatriarch: {
    intro: [
      'Vex: Stand down, skyrat. The Matriarch has come for your harbour.',
      'Gunner: Dreadnought bearing! Guns hot, Captain, guns hot!',
      'Vex: Brassbay makes a fine scrapyard. Let us see how it sinks.',
    ],
    phase: [
      'Vex: Her deck guns are wounded. Her core is not. Fire at will!',
      'Vex: Smoke her out! Bring the scouts in and let them sting.',
      'Gunner: Boilers redlining! She’ll stink of it for a week!',
    ],
    death: [
      'Vex: Impossible. The Matriarch doesn’t sink. She... settles.',
      'Gunner: Abandon ship! Save the good brass and the cook!',
    ],
  },
  kraken: {
    intro: [
      'Vex: Ink in the lungs, skyrat. Let us see how you swim.',
      'Crew: She’s coming up through the smog! Tentacles on the port!',
      'Vex: Cut her arms off, and she cannot hug you to death.',
    ],
    phase: [
      'Vex: She’s going to sulk now. Sulking squids are very dangerous.',
      'Crew: Ink everywhere! Lamps out, eyes open, keep your heads!',
      'Vex: Another arm gone! Keep the pressure on her thrashing side!',
    ],
    death: [
      'Vex: Ah, the sea always keeps its promises, even the nasty ones.',
      'Crew: Cog shower incoming! Mind your hats and your fingers!',
    ],
  },
  stormEngine: {
    intro: [
      'Vex: The Engine is awake. Pray the lightning has a sense of humour.',
      'Crew: Conductor spheres spinning up! Keep metal off the top deck!',
      'Vex: Stay low, skyrat. The storm is only half of her arsenal.',
    ],
    phase: [
      'Vex: She’s pulling us in! Full steam, Captain, or we’ll be fried!',
      'Crew: Sweep arms overhead! Duck, dodge, and pray for mercy!',
      'Vex: Overcharged! The sky itself is angry at us now!',
    ],
    death: [
      'Vex: Grounded at last. How disappointing for the weather.',
      'Crew: Hull integrity holding. Mostly. Probably. Bring a bucket!',
    ],
  },
  behemoth: {
    intro: [
      'Vex: Behold the Admiral’s Fist, skyrat. Kneel, and be tallied.',
      'Crew: Hangar doors opening! Ornithopters on the wing!',
      'Vex: I hope you brought a bigger ship. Or a better excuse.',
    ],
    phase: [
      'Vex: Mortar crews, the window is open! Lob them a present!',
      'Vex: Walls of iron, skyrat. Find the gap, or find your grave.',
      'Crew: Admiral, the walls are shredded! She wants a fight!',
    ],
    death: [
      'Vex: Hah! Well flown, skyrat. Now I owe the cook a drink.',
      'Crew: Fist is down! Hats off for the Admiral’s finest!',
    ],
  },
  sunFurnace: {
    intro: [
      'Vex: The Furnace Crown is ours. Come and melt for it, skyrat.',
      'Crew: Shell plates rotating! Find the gaps, Captain, find them!',
      'Vex: She has burned empires. Your little skyship is kindling.',
    ],
    phase: [
      'Vex: She sheds her shell! Naked and furious, she is all heart!',
      'Crew: Slag spirals inbound! Flame jets on the starboard side!',
      'Vex: Desperation pattern engaged! Survive, if you can, skyrat!',
    ],
    death: [
      'Vex: The Heart is silent. The Syndicate... will need a new plan.',
      'Crew: Foundry’s out! The whole sky is cheering, Captain!',
    ],
  },
};

/**
 * Opening captain's log, shown on the title screen. At most 80 words.
 * @type {string}
 */
export const INTRO =
  'Captain’s log, the twenty-third of October. The Iron Syndicate’s armada has crossed the sea ' +
  'and set its sights on Brassbay, where my crew and I are sworn to keep the skies free. We have ' +
  'a sound hull, a good canvas, and a cannon that complains when it is cold. We do not have a ' +
  'retirement plan. Stand by your guns, my hearties, and whatever you do, do not look down.';

/**
 * Credits roll. Multi-line string, one credit per line.
 * @type {string}
 */
export const CREDITS = [
  'BRASS & BALLAST',
  'A steampunk skyship twin-stick shooter',
  '',
  'Designed and built by a team of Claude agents',
  '',
  'Every sprite drawn by hand, in code, at runtime.',
  'Every sound synthesized procedurally, in code.',
  'No external assets were harmed in the making of this game.',
  '',
  'THE CREW',
  'Chief Gunnery Clerk ..... the agent who counted every cannonball',
  'Keeper of the Sprockets ..... the agent who oiled the particle engine',
  'Head of Stokers ..... the agent who kept the steam pressure up',
  'Master of Brass Bands ..... the agent who composed the music',
  'Quartermaster of Rivets ..... the agent who drew every sprite',
  'Admiral of the Abandoned Ships ..... the agent who wrote the lore',
  'Lookout, Port Watch ..... the agent who tested every boss',
  'Ship’s Cook ..... the agent who fixed the bugs over tea',
  '',
  'Thank you for playing. Mind the ballast, and keep your gasbags full.',
].join('\n');

/**
 * Quips shown on the results screen after the captain falls. Twelve one-liners.
 * @type {string[]}
 */
export const DEATH_QUIPS = [
  'The sky is a harsh mistress, and she has never once been on time.',
  'Your hull has joined the clouds. The gulls are delighted with the news.',
  'Vex sends his regards and a fresh pot of tea. Better luck next voyage.',
  'Another proud captain, politely returned to the sea. Shall we begin again?',
  'The gasbags are sagging and the crew is weeping. Bring a bigger balloon.',
  'Splashdown is a fine way to end a bad day. Lovely view, though.',
  'Mind the ballast next time. It is not a suggestion, it is a warning.',
  'You went down like a bad soufflé: loudly, dramatically and in full view.',
  'The Syndicate will want a commemorative plaque. Their foundries are busy.',
  'Tea is served in the Admiral’s cabin. Your tab has been generously accepted.',
  'Fear not, Captain. The brass will be salvaged, polished and sold again.',
  'Too many cannons, not enough steam. An old and foolish story, retold yet again.',
];
