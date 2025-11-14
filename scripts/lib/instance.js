/**
 * PrismLauncher instance utilities
 */

import fs from 'fs';
import path from 'path';

/**
 * Read and parse mmc-pack.json from instance directory
 */
export async function readInstanceConfig(instancePath) {
  console.log('📋 Reading instance configuration...');
  const configPath = path.join(instancePath, 'mmc-pack.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('mmc-pack.json not found in instance directory');
  }

  const configContent = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configContent);
}

/**
 * Validate and extract loader information from instance config
 */
export function validateLoader(instanceConfig) {
  console.log('🔍 Validating mod loader...');
  const components = instanceConfig.components || [];

  // Look for supported loaders
  const loaders = {
    neoforge: components.find(c => c.uid === 'net.neoforged'),
    fabric: components.find(c => c.uid === 'net.fabricmc.fabric-loader'),
    forge: components.find(c => c.uid === 'net.minecraftforge')
  };

  // Find minecraft version
  const minecraft = components.find(c => c.uid === 'net.minecraft');
  if (!minecraft) {
    throw new Error('No Minecraft version found in instance config');
  }

  // Determine active loader
  let activeLoader = null;
  if (loaders.neoforge) {
    activeLoader = { type: 'neoforge', version: loaders.neoforge.version };
  } else if (loaders.fabric) {
    activeLoader = { type: 'fabric', version: loaders.fabric.version };
  } else if (loaders.forge) {
    activeLoader = { type: 'forge', version: loaders.forge.version };
  } else {
    throw new Error('No supported mod loader found (neoforge, fabric, or forge)');
  }

  console.log(`   ✅ Found ${activeLoader.type} ${activeLoader.version}`);
  console.log(`   ✅ Minecraft ${minecraft.version}`);

  return {
    loader: activeLoader,
    minecraft: minecraft.version
  };
}
