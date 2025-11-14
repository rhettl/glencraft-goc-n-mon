import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

/**
 * Download a file with caching based on hash
 */
export async function downloadWithCache(url, expectedHash, cacheDir, filename, hashType = 'sha512') {
  const cacheFile = path.join(cacheDir, `${expectedHash}.mod`);

  // Check if file already exists in cache
  if (await fs.pathExists(cacheFile)) {
    console.log(`   📋 Using cached: ${filename}`);
    return cacheFile;
  }

  console.log(`   ⬇️  Downloading: ${filename}`);

  try {
    // Import fetch dynamically since it's ESM
    const fetch = (await import('node-fetch')).default;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.buffer();

    // Verify hash if provided
    if (expectedHash) {
      const actualHash = crypto.createHash(hashType).update(buffer).digest('hex');
      if (actualHash !== expectedHash) {
        throw new Error(`${hashType.toUpperCase()} mismatch for ${filename}. Expected: ${expectedHash}, Got: ${actualHash}`);
      }
    }

    // Save to cache
    await fs.ensureDir(cacheDir);
    await fs.writeFile(cacheFile, buffer);

    console.log(`   ✅ Downloaded and cached: ${filename}`);
    return cacheFile;

  } catch (error) {
    throw new Error(`Failed to download ${filename}: ${error.message}`);
  }
}

/**
 * Filter mods for server compatibility
 */
export function filterServerMods(mods) {
  return mods.filter(mod => {
    // Include mods that work on server (both or server-only)
    return mod.side === 'both' || mod.side === 'server';
  });
}

/**
 * Copy server assets (non-mod files)
 */
export async function copyServerAssets(metadataDir, serverDir) {
  console.log('📁 Copying server assets...');

  const assetDirs = [
    { source: 'configureddefaults', target: 'configureddefaults' },
    { source: 'kubejs', target: 'kubejs' },
    { source: 'datapacks', target: 'datapacks' },
    // Note: resourcepacks and shaderpacks typically not needed on server
    // but we can include them for completeness
    { source: 'resourcepacks', target: 'resourcepacks' },
    { source: 'shaderpacks', target: 'shaderpacks' }
  ];

  let copiedCount = 0;

  for (const { source, target } of assetDirs) {
    const sourcePath = path.join(metadataDir, source);
    const targetPath = path.join(serverDir, target);

    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, targetPath);
      console.log(`   ✓ Copied ${source}`);
      copiedCount++;
    }
  }

  console.log(`   Copied ${copiedCount} asset directories`);
}

/**
 * Download and place mods for server
 */
export async function downloadServerMods(serverMods, cacheDir, serverModsDir) {
  console.log(`🔽 Downloading ${serverMods.length} server mods...`);

  await fs.ensureDir(cacheDir);
  await fs.ensureDir(serverModsDir);

  let downloadCount = 0;
  let cacheHitCount = 0;
  const errors = [];

  for (const mod of serverMods) {
    try {
      // For disabled mods, download the non-disabled version but save as disabled
      const isDisabled = mod.filename.endsWith('.disabled');
      const downloadFilename = isDisabled ? mod.filename.replace('.disabled', '') : mod.filename;

      // Download URL from Modrinth (always use non-disabled filename)
      const downloadUrl = `https://cdn.modrinth.com/data/${mod.modrinth.modId}/versions/${mod.modrinth.version}/${downloadFilename}`;

      // Download/get from cache
      const cachedFile = await downloadWithCache(downloadUrl, mod.sha512, cacheDir, mod.filename);

      // Copy to final location (preserve disabled state)
      const finalPath = path.join(serverModsDir, mod.filename);
      await fs.copy(cachedFile, finalPath);

      if (await fs.pathExists(path.join(cacheDir, `${mod.sha512}.mod`))) {
        cacheHitCount++;
      } else {
        downloadCount++;
      }

    } catch (error) {
      console.error(`   ❌ Failed: ${mod.filename} - ${error.message}`);
      errors.push({ mod: mod.filename, error: error.message });
    }
  }

  console.log(`   ✅ Successfully processed ${serverMods.length - errors.length} mods`);
  console.log(`   📥 Downloaded: ${downloadCount}, 📋 From cache: ${cacheHitCount}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Failed to download ${errors.length} mods:`);
    errors.forEach(({ mod, error }) => {
      console.log(`   ❌ ${mod}: ${error}`);
    });
  }

  return { success: serverMods.length - errors.length, failed: errors.length, errors };
}
