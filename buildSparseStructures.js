import { existsSync, readFileSync }            from 'fs';
import json5                                   from 'json5';
import { join, resolve }                       from 'path';
import { commitStructures, compareStructures } from './lib/compareStructures.js';

const __dirname = resolve(import.meta.dirname || process.cwd());

const args = process.argv = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node buildSparseStructures.js <command> <inputFile>');
  process.exit(1);
}

const command   = args[0];
const inputFile = args[1] ? resolve(args[1]) : null;

if (!existsSync(inputFile)) {
  console.error(`Input file does not exist: ${inputFile}`);
  process.exit(1);
}

const knownStructures = json5.parse(readFileSync(join(__dirname, 'lib', 'knownStructures.json5'), 'utf8'));

const raw    = readFileSync(inputFile, 'utf8');
const parsed = json5.parse('[' + raw.toString() + ']');

const comparison = compareStructures(parsed, knownStructures);

switch (command) {
  case 'compare':
    console.log('New Structures:', comparison.new);
    console.log('Missing Structures:', comparison.missing);
    break;
  case 'commit':
    console.log('Committing changes to known structures...');
    commitStructures(knownStructures, comparison);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}


