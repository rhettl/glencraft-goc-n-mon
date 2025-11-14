/**
 * Mod scanning and parsing utilities
 */

import fs from 'fs';
import path from 'path';
import TOML from '@iarna/toml';

/**
 * Scan mods directory and index files, return mods and missing index files
 */
export async function scanModsAndIndex(instancePath) {
  console.log('🔍 Scanning mods and index files...');
  const modsPath = path.join(instancePath, 'minecraft/mods');
  const indexPath = path.join(modsPath, '.index');

  if (!fs.existsSync(modsPath)) {
    throw new Error('Mods directory not found');
  }

  if (!fs.existsSync(indexPath)) {
    throw new Error('Mods index directory not found');
  }

  // Get all mod files
  const modFiles = fs.readdirSync(modsPath)
    .filter(file => file.endsWith('.jar') || file.endsWith('.jar.disabled'))
    .sort();

  // Get all index files
  const indexFiles = fs.readdirSync(indexPath)
    .filter(file => file.endsWith('.toml'))
    .sort();

  console.log(`📦 Found ${modFiles.length} mod files`);
  console.log(`📋 Found ${indexFiles.length} index files`);

  // Check for missing index files by reading toml files to find referenced mods
  const missingIndexFiles = [];
  const modToIndex = new Map();
  const indexedMods = new Set();

  // Build map by reading index files to find which mods they reference
  for (const indexFile of indexFiles) {
    const indexFilePath = path.join(indexPath, indexFile);
    try {
      const filename = extractFilenameFromToml(indexFilePath);

      if (filename) {
        // Check if mod exists as enabled or disabled
        const enabledFile = filename;
        const disabledFile = `${filename}.disabled`;

        if (modFiles.includes(enabledFile)) {
          modToIndex.set(enabledFile, indexFile);
          indexedMods.add(enabledFile);
        } else if (modFiles.includes(disabledFile)) {
          modToIndex.set(disabledFile, indexFile);
          indexedMods.add(disabledFile);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Failed to read index file ${indexFile}: ${error.message}`);
    }
  }

  // Find mods without index files
  for (const modFile of modFiles) {
    if (!indexedMods.has(modFile)) {
      missingIndexFiles.push(modFile);
    }
  }

  if (missingIndexFiles.length > 0) {
    return { mods: [], missingIndexFiles };
  }

  // Parse all mod metadata from index files
  const mods = [];
  for (const [modFile, indexFile] of modToIndex.entries()) {
    const indexFilePath = path.join(instancePath, 'minecraft/mods/.index', indexFile);
    const modPath = path.join(modsPath, modFile);

    try {
      const modMetadata = await parseIndexFile(indexFilePath, modPath);
      mods.push(modMetadata);
    } catch (error) {
      console.warn(`⚠️  Failed to parse ${indexFile}: ${error.message}`);
    }
  }

  console.log(`✅ Successfully parsed ${mods.length} mod entries`);
  return { mods, missingIndexFiles: [] };
}

/**
 * Extract filename from TOML index file
 */
function extractFilenameFromToml(indexFilePath) {
  const indexContent = fs.readFileSync(indexFilePath, 'utf8');
  const parsed = TOML.parse(indexContent);
  return parsed.filename || null;
}

/**
 * Parse mod metadata from index file and mod file
 */
async function parseIndexFile(indexFilePath, modPath) {
  const indexContent = fs.readFileSync(indexFilePath, 'utf8');
  const modStats = fs.statSync(modPath);

  // Parse TOML content
  const metadata = TOML.parse(indexContent);

  // Check if mod is disabled
  const filename = path.basename(modPath);
  const isDisabled = filename.endsWith('.disabled');

  // Extract SHA512 hash from download section
  let sha512Hash = null;
  if (metadata.download?.hash && metadata.download?.['hash-format'] === 'sha512') {
    sha512Hash = metadata.download.hash;
  }

  // Extract Modrinth metadata from update section
  let modrinthData = null;
  if (metadata.update?.modrinth) {
    modrinthData = {
      modId: metadata.update.modrinth['mod-id'] || null,
      version: metadata.update.modrinth.version || null
    };
  }

  const result = {
    filename: filename,
    name: metadata.name || 'Unknown',
    version: metadata.version || 'Unknown',
    modid: metadata.modid || metadata.name?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'unknown',
    side: metadata.side || 'both',
    url: metadata.url || null,
    sha512: sha512Hash,
    size: modStats.size,
    lastModified: modStats.mtime.toISOString(),
    disabled: isDisabled
  };

  // Add Modrinth data if available
  if (modrinthData && (modrinthData.modId || modrinthData.version)) {
    result.modrinth = modrinthData;
  }

  return result;
}
