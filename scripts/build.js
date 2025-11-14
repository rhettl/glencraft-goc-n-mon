#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadPackMetadata,
  loadPackageInfo,
  categorizeMods,
  generateModrinthIndex,
  createMrpack,
  reportNonDownloadableMods,
  generateOutputFilename
} from './lib/builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(__dirname);
const metadataDir = path.join(rootDir, 'metadata');
const distDir = path.join(rootDir, 'dist');
const releasesDir = path.join(rootDir, 'releases');

/**
 * Main build function
 */
async function build() {
  console.log('🚀 Starting modpack build...\n');

  try {
    // Ensure output directories exist
    await fs.ensureDir(distDir);
    await fs.ensureDir(releasesDir);

    // Load metadata and package info
    const packData = await loadPackMetadata(metadataDir);
    const packageInfo = await loadPackageInfo(rootDir);

    // Categorize mods
    const { modrinthMods, nonDownloadableMods } = categorizeMods(packData.mods);

    console.log(`📊 Mod categorization:`);
    console.log(`   ✅ Modrinth downloadable: ${modrinthMods.length}`);
    console.log(`   ❌ Non-downloadable: ${nonDownloadableMods.length}\n`);

    // Generate Modrinth index
    const indexData = generateModrinthIndex(modrinthMods, {
      name: packData.name,
      description: packData.description,
      gameVersion: packData.gameVersion,
      loaderType: packData.loaderType,
      loaderVersion: packData.loaderVersion
    });

    // Create client .mrpack
    const clientFilename = generateOutputFilename(packageInfo.name, packageInfo.version);
    const clientOutput = path.join(releasesDir, clientFilename);
    await createMrpack(indexData, metadataDir, clientOutput, distDir);

    // Report results
    reportNonDownloadableMods(nonDownloadableMods);

    console.log(`\n✨ Build complete!`);
    console.log(`   Client modpack: ${path.relative(process.cwd(), clientOutput)}`);
    console.log(`\n🎯 Next steps:`);
    console.log(`   1. Test the .mrpack file in a launcher (MultiMC, Prism, etc.)`);
    console.log(`   2. Upload to GitHub releases or your preferred distribution method`);
    console.log(`   3. Consider creating a server pack build (coming soon)`);

  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  build();
}

export { build };
