import fs, { existsSync }                                        from 'fs';
import { ftbQuestsCheck, getDirectorySize, parsePlInstanceData } from './lib/common.js';
import { compileSparseStructures }                               from './lib/compareStructures.js';
import { MrPackBuilder }       from './lib/mr-pack-builder.js';


if (!ftbQuestsCheck()) {
  console.warn('The FTB Quests config directory does not match the default. This may cause issues with the server.');
  console.warn('Please ensure that the FTB Quests config directory is correct before proceeding.');
  process.exit(1);
}

const modPackData = JSON.parse(fs.readFileSync('./modpack.json', 'utf-8'));
const plInstance = parsePlInstanceData('../../mmc-pack.json');
const pack       = new MrPackBuilder({
  ...modPackData,
  game:          'minecraft',
  formatVersion: 1,
  dependencies:  {
    minecraft: plInstance.Minecraft?.version || '1.21.1',
    neoforge:  plInstance.NeoForge?.version || '21.1.196'
  }
});

await pack.scanModsDirectory('../mods', {
  ensureMods: [
    /Oh-The-Trees-Youll-Grow-neoforge-.*\.jar/i,
  ],
  ignoreMods: [
    // /MoreCobblemonTweaks-neoforge-.*\.jar/i',
  ],
  ensureOptional: [
    /distraction_free_recipes-.*\.jar/i,
    /^emi.*\.jar/i,
    /^voicechat.*\.jar/i,
    /^CrashAssistant.*\.jar/i,
  ],
  includeAll: true
});
await pack.buildIndexJson();
await pack.buildIcon();
await pack.copyOverrideMods()

await pack.addOverrideDirectory('../configureddefaults', 'configureddefaults');
await pack.addOverrideDirectory('../datapacks', 'datapacks');
await pack.addOverrideDirectory('../resourcepacks', 'resourcepacks');
await pack.addOverrideDirectory('../kubejs', 'kubejs');
await pack.addOverrideFile('../icon.png', 'icon.png');
await pack.addOverrideFile('../servers.dat', 'servers.dat');
await pack.addOverrideFile('../options.txt', 'configureddefaults/options.txt');

fs.writeFileSync('sparsestructures.json5', compileSparseStructures({ idBasedSalt: false }), 'utf8');
await pack.addOverrideFile('sparsestructures.json5', 'configureddefaults/config/sparsestructures.json5');

await pack.buildArchive(`./GlenCraft-CogAndMon.mrpack`);
