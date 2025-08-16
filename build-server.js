import fs                      from 'fs';
import { join }                from 'path';
import { parsePlInstanceData } from './lib/common.js';
import { compileSparseStructures } from './lib/compareStructures.js';
import { ServerBuilder }       from './lib/server-builder.js';

import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(import.meta.url);

const modPackData = JSON.parse(fs.readFileSync('./modpack.json', 'utf-8'));
const plInstance = parsePlInstanceData('../../mmc-pack.json');
const pack       = new ServerBuilder({
  ...modPackData,
  game:          'minecraft',
  formatVersion: 1,
  dependencies:  {
    minecraft: plInstance.Minecraft?.version || '1.21.1',
    neoforge:  plInstance.Neoforge?.version || '21.1.196'
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
await pack.addDirectory('../ftbquests', 'ftbquests');
await pack.addDirectory('../kubejs', 'kubejs');
await pack.addFile('../default-server.properties', 'default-server.properties');

fs.writeFileSync('sparsestructures.json5', compileSparseStructures({ idBasedSalt: false }), 'utf8');
await pack.addFile('sparsestructures.json5', 'configureddefaults/config/sparsestructures.json5');

await pack.installServer();
await pack.buildArchive(`./GlenCraft-CogAndMon-server.zip`);
