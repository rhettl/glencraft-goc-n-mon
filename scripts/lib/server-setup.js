import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { downloadWithCache } from './downloader.js';

/**
 * Get Minecraft version manifest
 */
async function getMinecraftVersions() {
  const fetch = (await import('node-fetch')).default;
  const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
  if (!response.ok) {
    throw new Error(`Failed to fetch Minecraft versions: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Download Minecraft server jar
 */
export async function downloadMinecraftServer(gameVersion, serverDir, cacheDir) {
  console.log(`🎮 Setting up Minecraft ${gameVersion} server...`);

  // Get version manifest
  const manifest = await getMinecraftVersions();
  const version = manifest.versions.find(v => v.id === gameVersion);

  if (!version) {
    throw new Error(`Minecraft version ${gameVersion} not found`);
  }

  // Get version details
  const fetch = (await import('node-fetch')).default;
  const versionResponse = await fetch(version.url);
  const versionData = await versionResponse.json();

  if (!versionData.downloads?.server) {
    throw new Error(`No server download available for Minecraft ${gameVersion}`);
  }

  // Download server jar
  const serverInfo = versionData.downloads.server;
  const serverJarPath = path.join(serverDir, 'server.jar');

  console.log(`   ⬇️  Downloading server.jar...`);

  // Use cache based on SHA1 hash
  const cachedFile = await downloadWithCache(
    serverInfo.url,
    serverInfo.sha1,
    cacheDir,
    'server.jar',
    'sha1'
  );

  await fs.copy(cachedFile, serverJarPath);
  console.log(`   ✅ Minecraft server jar installed as server.jar`);

  return serverJarPath;
}

/**
 * Execute a command and return a promise
 */
function executeCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`   🔧 Running: ${command} ${args.join(' ')}`);

    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
      // Show important output
      const line = data.toString().trim();
      if (line && (line.includes('Installing') || line.includes('Success') || line.includes('Done'))) {
        console.log(`      ${line}`);
      }
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}\nstderr: ${stderr}`));
      }
    });

    process.on('error', (error) => {
      reject(new Error(`Failed to start process: ${error.message}`));
    });
  });
}

/**
 * Download and install NeoForge server
 */
export async function downloadAndInstallNeoForge(gameVersion, loaderVersion, serverDir, cacheDir) {
  console.log(`⚙️  Setting up NeoForge ${loaderVersion}...`);

  // NeoForge download URL pattern
  const neoForgeUrl = `https://maven.neoforged.net/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;

  console.log(`   ⬇️  Downloading NeoForge installer...`);

  try {
    // Download installer (skip hash verification for now)
    const installerPath = path.join(serverDir, `neoforge-${loaderVersion}-installer.jar`);

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(neoForgeUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    await fs.writeFile(installerPath, buffer);

    console.log(`   ✅ NeoForge installer downloaded`);

        // Run the installer with --server-starter flag
    console.log(`   🚀 Installing NeoForge server...`);
    await executeCommand('java', [
      '-jar',
      `neoforge-${loaderVersion}-installer.jar`,
      '--installServer',
      '--server-starter'
    ], { cwd: serverDir });

    console.log(`   ✅ NeoForge server installed successfully`);

    // Remove the installer after successful installation
    console.log(`   🗑️  Cleaning up installer...`);
    await fs.remove(installerPath);
    console.log(`   ✅ Installer removed`);

    // Check for the server jar created by NeoForge installer
    const serverJarPath = path.join(serverDir, 'server.jar');
    const neoForgeJarPath = path.join(serverDir, `neoforge-${loaderVersion}.jar`);

    // NeoForge with --server-starter typically creates server.jar
    if (await fs.pathExists(serverJarPath)) {
      console.log(`   ✅ Server jar created: server.jar`);
      return serverJarPath;
    } else if (await fs.pathExists(neoForgeJarPath)) {
      console.log(`   ✅ Server jar created: neoforge-${loaderVersion}.jar`);
      return neoForgeJarPath;
    } else {
      console.log(`   ⚠️  Warning: Expected server jar (server.jar or neoforge-${loaderVersion}.jar) not found`);
      // Return the expected server jar path anyway
      return serverJarPath;
    }

  } catch (error) {
    throw new Error(`Failed to setup NeoForge: ${error.message}`);
  }
}

/**
 * Create server launch scripts (updated for installed NeoForge)
 */
export async function createLaunchScripts(serverDir, gameVersion, loaderVersion) {
  console.log(`📄 Creating launch scripts...`);

  // Use server.jar as the primary executable (created by NeoForge installer)
  const serverJar = 'server.jar';

  // Basic server launch script for Unix
  const bashScript = `#!/bin/bash
# GlenCraft: Cog & Mon Server Launch Script
# Minecraft ${gameVersion} + NeoForge ${loaderVersion}

# Set memory allocation (adjust as needed)
MIN_RAM=2G
MAX_RAM=4G

# Java arguments for performance
JAVA_ARGS="-Xms\$MIN_RAM -Xmx\$MAX_RAM -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1"

echo "Starting GlenCraft: Cog & Mon Server..."
echo "Minecraft ${gameVersion} + NeoForge ${loaderVersion}"
echo "Memory: \$MIN_RAM to \$MAX_RAM"
echo ""

# Use the generated run script if available, otherwise use direct jar
if [ -f "run.sh" ]; then
    echo "Using NeoForge run script..."
    ./run.sh
else
    echo "Using direct jar execution..."
    java \$JAVA_ARGS -jar ${serverJar} nogui
fi

echo "Server stopped."
`;

  // Windows batch script
  const batScript = `@echo off
title GlenCraft: Cog & Mon Server
echo Starting GlenCraft: Cog & Mon Server...
echo Minecraft ${gameVersion} + NeoForge ${loaderVersion}
echo.

REM Set memory allocation (adjust as needed)
set MIN_RAM=2G
set MAX_RAM=4G

REM Java arguments for performance  
set JAVA_ARGS=-Xms%MIN_RAM% -Xmx%MAX_RAM% -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1

REM Use the generated run script if available, otherwise use direct jar
if exist "run.bat" (
    echo Using NeoForge run script...
    call run.bat
) else (
    echo Using direct jar execution...
    java %JAVA_ARGS% -jar ${serverJar} nogui
)

echo Server stopped.
pause
`;

  // Write scripts
  await fs.writeFile(path.join(serverDir, 'start-server.sh'), bashScript);
  await fs.writeFile(path.join(serverDir, 'start-server.bat'), batScript);

  // Make bash script executable
  try {
    await fs.chmod(path.join(serverDir, 'start-server.sh'), '755');
  } catch (error) {
    // Ignore chmod errors on Windows
  }

  console.log(`   ✅ Created start-server.sh and start-server.bat`);
}

/**
 * Create basic server.properties template
 */
export async function createServerProperties(serverDir, packName) {
  console.log(`⚙️  Creating server.properties template...`);

  const properties = `# Server Properties for ${packName}
# Generated by modpack builder

# Server Settings
server-name=${packName}
server-port=25565
max-players=20
difficulty=normal
gamemode=survival
hardcore=false
pvp=true

# World Settings
level-name=world
level-seed=
generate-structures=true
spawn-protection=0
max-world-size=29999984

# Performance & Anti-Cheat
view-distance=10
simulation-distance=10
max-tick-time=60000
use-native-transport=true
# Fix for "moved too quickly" during world loading
allow-flight=true
prevent-proxy-connections=false
# Reduce movement checking strictness
max-player-idle-time=0

# Security
online-mode=true
enforce-whitelist=false
white-list=false
enable-status=true
enable-query=false
enable-rcon=false

# Misc
motd="There is no cow level"
spawn-npcs=true
spawn-animals=true
spawn-monsters=true
force-gamemode=false

# Modpack Optimizations
# Higher timeout for world generation
max-world-generation-distance-chunks=13
# Prevent timeout during heavy worldgen
network-compression-threshold=256
`;

  await fs.writeFile(path.join(serverDir, 'server.properties'), properties);
  console.log(`   ✅ Created server.properties template with performance fixes`);
}

/**
 * Accept EULA (skip automatic initialization for now)
 */
export async function acceptEula(serverDir) {
  console.log(`📜 Accepting Minecraft EULA...`);

  const eula = `# Minecraft EULA
# Generated by modpack builder
# https://account.mojang.com/documents/minecraft_eula
eula=true
`;

  await fs.writeFile(path.join(serverDir, 'eula.txt'), eula);
  console.log(`   ✅ EULA accepted`);
  console.log(`   ℹ️  Server files will be generated on first startup`);
}
