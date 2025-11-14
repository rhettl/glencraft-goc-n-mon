#!/usr/bin/env node

import fs                                                         from 'fs-extra';
import path                                                       from 'path';
import { fileURLToPath }                                          from 'url';
import { loadPackMetadata, loadPackageInfo } from './lib/builder.js';
import { filterServerMods, copyServerAssets, downloadServerMods } from './lib/downloader.js';
import {
  downloadMinecraftServer,
  downloadAndInstallNeoForge,
  createLaunchScripts,
  createServerProperties,
  acceptEula
} from './lib/server-setup.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const rootDir     = path.dirname(__dirname);
const metadataDir = path.join(rootDir, 'metadata');
const releasesDir = path.join(rootDir, 'releases');
const cacheDir    = path.join(rootDir, '.file-cache');

/**
 * Build server pack by downloading mods and copying assets
 */
async function buildServer () {
  console.log('🖥️ Starting server pack build...\n');

  try {
    // Load metadata and package info
    const packData    = await loadPackMetadata(metadataDir);
    const packageInfo = await loadPackageInfo(rootDir);

    // Create server directory
    const serverDir     = path.join(releasesDir, 'server');
    const serverModsDir = path.join(serverDir, 'mods');

    console.log(`📁 Setting up server directory: ${path.relative(process.cwd(), serverDir)}`);
    await fs.ensureDir(serverDir);
    await fs.ensureDir(serverModsDir);

    // Filter mods for server compatibility
    const allMods        = packData.mods.filter(mod => mod.modrinth && mod.modrinth.modId && mod.modrinth.version);
    const serverMods     = filterServerMods(allMods);
    const clientOnlyMods = allMods.filter(mod => mod.side === 'client');

    console.log(`📊 Mod filtering for server:`);
    console.log(`   ✅ Server compatible: ${serverMods.length}`);
    console.log(`   ❌ Client-only (skipped): ${clientOnlyMods.length}`);

    if (clientOnlyMods.length > 0) {
      console.log(`\n📋 Skipping client-only mods:`);
      clientOnlyMods.forEach(mod => {
        console.log(`   • ${mod.name || mod.filename}`);
      });
    }

    console.log('');

    // Copy server assets
    await copyServerAssets(metadataDir, serverDir);

    console.log('');

    // Download server mods
    const result = await downloadServerMods(serverMods, cacheDir, serverModsDir);

    console.log('');

    // Download Minecraft server
    await downloadMinecraftServer(packData.gameVersion, serverDir, cacheDir);

    // Download and install NeoForge
    await downloadAndInstallNeoForge(packData.gameVersion, packData.loaderVersion, serverDir, cacheDir);

    // Create server configuration
    await createLaunchScripts(serverDir, packData.gameVersion, packData.loaderVersion);
    await createServerProperties(serverDir, packData.name);
    await acceptEula(serverDir);

    // Create server info file
    const serverInfo = {
      name:          packData.name,
      version:       packageInfo.version,
      gameVersion:   packData.gameVersion,
      loaderType:    packData.loaderType,
      loaderVersion: packData.loaderVersion,
      generatedAt:   new Date().toISOString(),
      mods:          {
        total:      serverMods.length,
        successful: result.success,
        failed:     result.failed
      }
    };

    await fs.writeJSON(path.join(serverDir, 'server-info.json'), serverInfo, { spaces: 2 });

    console.log(`\n✨ Server pack build complete!`);
    console.log(`   📍 Location: ${path.relative(process.cwd(), serverDir)}`);
    console.log(`   🎮 Game: Minecraft ${packData.gameVersion}`);
    console.log(`   ⚙️ Loader: ${packData.loaderType} ${packData.loaderVersion}`);
    console.log(`   📦 Mods: ${result.success}/${serverMods.length} successful`);

    if (result.failed > 0) {
      console.log(`\n⚠️  ${result.failed} mods failed to download. Check errors above.`);
    }

    console.log(`\n🎯 Next steps:`);
    console.log(`   1. Copy the server directory to your Minecraft server location`);
    console.log(`   2. Start server with: ./start-server.sh (Linux/Mac) or start-server.bat (Windows)`);
    console.log(`   3. Configure server.properties as needed`);
    console.log(`   4. Enjoy your modded server!`);

  } catch (error) {
    console.error('❌ Server build failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildServer();
}

export { buildServer };
