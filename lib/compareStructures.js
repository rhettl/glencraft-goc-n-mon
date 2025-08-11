import { readFileSync, writeFileSync } from 'fs';
import json5             from 'json5';
import { join, resolve } from 'path';
const __dirname = resolve(import.meta.dirname || process.cwd());

/**
 * This will compare a given input list with a list of known structures by matching their `structure` props and provide a list of new and missing structures.
 *
 * @param {Array<Object>} parsed -- parsed list of structures with `structure` and `factor` props
 * @param {Array<Object>} knownStructures -- list of known structures with `structure`, `factor`, `customSpread`, and `dimension` props
 * @return {Object} -- comparison including arrays of `new` and `missing` structures
 */
export function compareStructures (parsed, knownStructures) {
  const knownStructuresMap  = new Map(knownStructures.map(s => [ s.structure, s ]));
  const parsedStructuresMap = new Map(parsed.map(s => [ s.structure, s ]));

  const newStructures     = [];
  const missingStructures = [];

  for (const [ structure, knownStructure ] of knownStructuresMap) {
    if (!parsedStructuresMap.has(structure)) {
      missingStructures.push(knownStructure);
    }
  }

  for (const [ structure, parsedStructure ] of parsedStructuresMap) {
    if (!knownStructuresMap.has(structure)) {
      newStructures.push(parsedStructure);
    }
  }

  return {
    new:     newStructures,
    missing: missingStructures
  };
}

/**
 * Rewrite the known structures json5 file with the new structures and missing structures.
 * missing structures will be removed, new structures will be added.
 *
 * format:
 * ```json5
 * [
 *   // Dimensions
 *   // Overworld: <count>
 *   <list of structures where `dimension` is "overworld">
 *
 *   // Nether: <count>
 *   <list of structures where `dimension` is "the_nether">
 *
 *   // End: <count>
 *   <list of structures where `dimension` is "the_end">
 *
 *   // Aether: <count>
 *   <list of structures where `dimension` is "aether">
 *
 *   // Deep Dark: <count>
 *   <list of structures where `dimension` is "deep_dark">
 *
 *   // Deep Blue: <count>
 *   <list of structures where `dimension` is "deep_blue">
 *
 *   // New Structures: <count>
 *   <list of structures where `dimension` is undefined>
 *
 * ]
 * ```
 *
 * @param knownStructures
 * @param comparison
 */
export function commitStructures (knownStructures, comparison) {
  const updatedStructures = knownStructures.filter(s => !comparison.missing.some(m => m.structure === s.structure));
  updatedStructures.push(...comparison.new);

  const groupedByDimension = groupByDimension(updatedStructures);

  // console.log(Object.getOwnPropertyNames(groupedByDimension));

  const output = `[
  // Dimensions
  // Overworld: ${groupedByDimension['overworld'].length}
${groupedByDimension['overworld'].map(s => `  ${formattedStringify(s)},`).join('\n')}
  
  // Nether: ${groupedByDimension['the_nether'].length}
${groupedByDimension['the_nether'].map(s => `  ${formattedStringify(s)},`).join('\n')}
  
  // End: ${groupedByDimension['the_end'].length}
${groupedByDimension['the_end'].map(s => `  ${formattedStringify(s)},`).join('\n')}
  
  // Aether: ${groupedByDimension['aether'].length}
${groupedByDimension['aether'].map(s => `  ${formattedStringify(s)},`).join('\n')}
  
  // Deep Dark: ${groupedByDimension['deep_dark'].length}
${groupedByDimension['deep_dark'].map(s => `  ${formattedStringify(s)},`).join('\n')}
  
  // Deep Blue: ${groupedByDimension['deep_blue'].length}
${groupedByDimension['deep_blue'].map(s => `  ${formattedStringify(s)},`).join('\n')}
  
  // New Structures: ${groupedByDimension['new']?.length ?? 0}
${(groupedByDimension['new'] ?? []).map(s => `  ${formattedStringify(s)},`).join('\n')}
  
]`

  writeFileSync(join(__dirname, 'knownStructures.json5'), output, 'utf8');
}

function groupByDimension (structures) {
  return structures
    .sort((a, b) => a.structure.localeCompare(b.structure))
    .map(structure => ({
      structure:    structure.structure,
      factor:       structure.factor ?? 1, // Default to 1 if factor is not defined
      customSpread: structure.customSpread ?? false, // Default to false if customSpread is not defined
      dimension:    structure.dimension ?? 'new', // Default to 'new' if dimension is not defined
    }))
    .reduce((acc, structure) => {
      const dimension = structure.dimension ?? 'new';
      if (!acc[dimension]) {
        acc[dimension] = [];
      }
      acc[dimension].push(structure);
      return acc;
    }, {});
}

function formattedStringify (obj) {
  return JSON.stringify(obj)
    .replace(/":/g, '": ') // Remove quotes from keys
    .replace(/\{/g, '{ ')  // Add space after opening brace
    .replace(/}/g, ' }')   // Add space before closing brace
    .replace(/,/g, ', ')   // Add space after commas
}

export function compileSparseStructures ({ spreadFactor = 2, idBasedSalt = true } = {}) {
  const knownStructures    = json5.parse(readFileSync(join(__dirname, 'knownStructures.json5'), 'utf8'));
  const groupedByDimension = groupByDimension(knownStructures);

  return `// ### THE MOD REQUIRES A RESTART OF THE GAME TO APPLY CHANGES ###
{
  // this is the main spread factor (default is 2)
  //
  // tips: a spread factor can be a decimal number (such as 1.5)
  //       a spread factor of 1 means all structure's placements are not modified (useful if you want to use only custom spread factors)
  //       a spread factor above 1 means all structures are rarer
  //       a spread factor below 1 means all structures are more common
  //       a spread factor of 0 disables all structures entirely
  "spreadFactor": ${spreadFactor},

  // Some structure mods/datapacks do not specify a custom salt or use the same salt for all their structures, which might cause structure overlap.
  // Enabling this is supposed to reduce this phenomenon, as all structure sets will have their own salt, hashed from their id.
  // If unsure, leave this enabled.
  "idBasedSalt": ${idBasedSalt ? 'true' : 'false'},

  // this is a list of custom spread factors
  "customSpreadFactors": [
    // example of the mansion being doubled in rarity (the mod's default)
    // add the structures you want to modify in the format:
    // (don't forget to remove "//", and use dots for decimal numbers)
    //
    // {
    //     "structure": "namespace:structure_name",
    //     "factor": number
    // },
    //
    // where "structure" is a structure_set or the name of a structure
    // /!\\ if you put the name of a structure, all structures in its set will be modified
    // (example: "minecraft:village_plains" will modify all structures in the "villages" set)
    // see https://minecraft.wiki/w/Tutorials/Custom_structures#Structure_Set for more info
    //
    // tip: you can dump all structure sets in a file by running the custom command /dumpstructuresets
    // tip: the same spread factors rules apply here (set to 0 to disable said structure)

    // Dimensions
    // Overworld: ${groupedByDimension['overworld'].length}
${groupedByDimension['overworld'].map(s => `  ${s.customSpread ? '' : '//'}  ${formattedStringify(s)},`).join('\n')}
  
    // Nether: ${groupedByDimension['the_nether'].length}
${groupedByDimension['the_nether'].map(s => `  ${s.customSpread ? '' : '//'}  ${formattedStringify(s)},`).join('\n')}
  
    // End: ${groupedByDimension['the_end'].length}
${groupedByDimension['the_end'].map(s => `  ${s.customSpread ? '' : '//'}  ${formattedStringify(s)},`).join('\n')}
  
    // Aether: ${groupedByDimension['aether'].length}
${groupedByDimension['aether'].map(s => `  ${s.customSpread ? '' : '//'}  ${formattedStringify(s)},`).join('\n')}
  
    // Deep Dark: ${groupedByDimension['deep_dark'].length}
${groupedByDimension['deep_dark'].map(s => `  ${s.customSpread ? '' : '//'}  ${formattedStringify(s)},`).join('\n')}
  
    // Deep Blue: ${groupedByDimension['deep_blue'].length}
${groupedByDimension['deep_blue'].map(s => `  ${s.customSpread ? '' : '//'}  ${formattedStringify(s)},`).join('\n')}
  ]
}`;
}
