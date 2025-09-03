import fs       from 'fs';
import { join } from 'path';

import { fileURLToPath }                       from 'url';
import { ftbQuestsCheck, parsePlInstanceData } from './lib/common.js';
import { compileSparseStructures }             from './lib/compareStructures.js';
import { ServerBuilder }                       from './lib/server-builder.js';

const __dirname = fileURLToPath(import.meta.url);

if (!ftbQuestsCheck()) {
  console.warn('The FTB Quests config directory does not match the default. This may cause issues with the server.');
  console.warn('Please ensure that the FTB Quests config directory is correct before proceeding.');
  process.exit(1);
}
const modPackData = JSON.parse(fs.readFileSync('./modpack.json', 'utf-8'));
const plInstance = parsePlInstanceData('../../mmc-pack.json');
const pack       = new ServerBuilder({
  ...modPackData,
  game:          'minecraft',
  formatVersion: 1,
  dependencies:  {
    minecraft: plInstance.Minecraft?.version || '1.21.1',
    neoforge:  plInstance.NeoForge?.version || '21.1.197'
  }
});


await pack.scanModsDirectory('../mods', {
  ensureMods: [
    /ponderjs-neoforge-.*\.jar/i,
  ],
  ignoreMods: [
    /MoreCobblemonTweaks-neoforge-.*\.jar/i,
    /voicechat-neoforge.*\.jar/i,
  ]
});
await pack.buildIndexJson();
await pack.updateModpackJson(join(__dirname, '../modpack.json'));
await pack.buildIcon();
await pack.copyMods();
await pack.downloadServerJars();

await pack.addDirectory('../configureddefaults', 'configureddefaults');
await pack.addDirectory('../datapacks', 'datapacks');
await pack.addDirectory('../kubejs', 'kubejs');
await pack.addFile('../default-server.properties', 'default-server.properties');

fs.writeFileSync('sparsestructures.json5', compileSparseStructures({ idBasedSalt: false }), 'utf8');
await pack.addFile('sparsestructures.json5', 'configureddefaults/config/sparsestructures.json5');

await pack.installServer();
await pack.buildArchive(`./GlenCraft-CogAndMon-server.zip`);



/*
To create a Straw Golem, stand near the crops or farm. Place a carved pumpkin on top of a hay bale. After a moment of reflection about the life, the universe, and everything, your little guy will start look for and harvest a full-grown crop.


Place a chest near the crops and make sure &lit's not full.&r If you have more than one chest in the vicinity, the golem will choose a chest on its own

{@pagebreak}

The Straw Golem has a limited lifespan.

Every 10 minutes, theres a 1/5 chance it decays.
There are 4 decay states, from new to dying, with death thereafter
This lifespan goes down faster when the golem is exposed to the rain or when it stands in water
The golem shivers when in rain water or cold
You can protect your golem from rain by building it a Straw Hat
The golem decays if it takes enough damage
Lifespan is restored by feeding the golem wheat, which also heals it.
As your golem approaches old age, it will begin to to decay, and you will see visual changes to its texture. You may also start to see flies hovering about. Moreover, as it ages, its max lifespan is lowered.


Behaviour
- The golem is shy, and tends to avoid players
- The golem will be attacked by all raiders, and will flee them
- The golem will sometimes be munched on by farm animals, and will flee them
- When the golem flees, it drops anything it had in its hand
 */
