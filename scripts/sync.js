#!/usr/bin/env node

/**
 * Sync modpack metadata from PrismLauncher instance
 * Reads mods, configs, and settings from a working instance
 */

import fs from 'fs';
import dotenv from 'dotenv';
import { readInstanceConfig, validateLoader } from './lib/instance.js';
import { scanModsAndIndex } from './lib/mods.js';
import { generateMetadata } from './lib/metadata.js';
import { copyInstanceAssets, cleanAssetDirectories } from './lib/assets.js';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🔄 Syncing from PrismLauncher instance...');

  // Check environment variable
  const instancePath = process.env.MINECRAFT_INSTANCE_PATH;
  if (!instancePath) {
    console.error('❌ MINECRAFT_INSTANCE_PATH environment variable not set');
    console.error('   Copy .env.example to .env and set your instance path');
    process.exit(1);
  }

  console.log(`📂 Instance path: ${instancePath}`);

  if (!fs.existsSync(instancePath)) {
    console.error('❌ Instance path not found:', instancePath);
    process.exit(1);
  }

  try {
    // Read instance configuration
    const instanceConfig = await readInstanceConfig(instancePath);

    // Validate loader type
    const loaderInfo = validateLoader(instanceConfig);

    // Scan mods and index files
    const { mods, missingIndexFiles } = await scanModsAndIndex(instancePath);

    // Error if missing index files
    if (missingIndexFiles.length > 0) {
      console.error('❌ Missing .index/*.toml files for the following mods:');
      missingIndexFiles.forEach(mod => console.error(`   - ${mod}`));
      console.error('');
      console.error('   PrismLauncher failed to create index files for these mods.');
      console.error('   Try reinstalling the missing mods or remove them manually.');
      process.exit(1);
    }

    // Clean old asset copies
    cleanAssetDirectories('metadata');

    // Copy instance assets
    const copiedAssets = await copyInstanceAssets(instancePath, 'metadata');

    // Generate metadata
    const packData = await generateMetadata(instanceConfig, loaderInfo, mods);

    // Show summary
    console.log('\n📊 Summary:');
    console.log(`   Instance: ${packData.instanceName}`);
    console.log(`   Mods: ${mods.length}`);
    console.log(`   Assets: ${copiedAssets.length} copied (${copiedAssets.join(', ')})`);
    console.log(`   Game Version: ${packData.gameVersion}`);
    console.log(`   Loader: ${packData.loaderType} ${packData.loaderVersion}`);
    console.log(`   Synced: ${new Date(packData.scannedAt).toLocaleString()}`);

    console.log('✅ Sync complete!');

  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}



// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
