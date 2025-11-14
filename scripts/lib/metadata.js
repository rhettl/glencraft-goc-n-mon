/**
 * Metadata generation utilities
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const METADATA_DIR = path.join(__dirname, '../../metadata');

/**
 * Generate and save pack metadata
 */
export async function generateMetadata(instanceConfig, loaderInfo, mods) {
  console.log('📝 Generating metadata...');
  // Ensure metadata directory exists
  if (!fs.existsSync(METADATA_DIR)) {
    fs.mkdirSync(METADATA_DIR, { recursive: true });
  }

  // Read existing pack.json if it exists
  const packJsonPath = path.join(METADATA_DIR, 'pack.json');
  let packData = {};

  if (fs.existsSync(packJsonPath)) {
    packData = JSON.parse(fs.readFileSync(packJsonPath, 'utf8'));
  }

  // Update with scanned data
  const updatedPackData = {
    ...packData,
    name: packData.name || "GlenCraft: Cog & Mon",
    description: packData.description || "A comprehensive Minecraft modpack combining Cobblemon with Create mod automation.",
    version: packData.version || "0.1.0",
    scannedAt: new Date().toISOString(),
    instanceName: path.basename(process.env.MINECRAFT_INSTANCE_PATH),
    gameVersion: loaderInfo.minecraft,
    loaderType: loaderInfo.loader.type,
    loaderVersion: loaderInfo.loader.version,
    mods: mods
  };

  // Write updated pack.json
  fs.writeFileSync(packJsonPath, JSON.stringify(updatedPackData, null, 2));

  console.log(`✍️  Updated pack.json with ${mods.length} mods`);

  return updatedPackData;
}
