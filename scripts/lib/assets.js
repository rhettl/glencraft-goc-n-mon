/**
 * Asset copying utilities for additional modpack files
 */

import fs from 'fs';
import path from 'path';

/**
 * Copy additional modpack assets from instance to metadata directory
 */
export async function copyInstanceAssets(instancePath, metadataPath) {
  console.log('📁 Copying additional modpack assets...');

  const assetsConfig = [
    {
      name: 'configureddefaults',
      sourcePath: 'minecraft/configureddefaults',
      targetPath: 'configureddefaults',
      description: 'Default files managed by Configured Defaults mod'
    },
    {
      name: 'kubejs',
      sourcePath: 'minecraft/kubejs',
      targetPath: 'kubejs',
      description: 'KubeJS scripts'
    },
    {
      name: 'datapacks',
      sourcePath: 'minecraft/datapacks',
      targetPath: 'datapacks',
      description: 'Global datapacks (managed by Paxi mod)'
    },
    {
      name: 'resourcepacks',
      sourcePath: 'minecraft/resourcepacks',
      targetPath: 'resourcepacks',
      description: 'Global resource packs (managed by Paxi mod)'
    },
    {
      name: 'shaderpacks',
      sourcePath: 'minecraft/shaderpacks',
      targetPath: 'shaderpacks',
      description: 'Shader packs for visual effects'
    },
    {
      name: 'icon.png',
      sourcePath: 'minecraft/icon.png',
      targetPath: 'icon.png',
      description: 'Instance icon'
    },
    {
      name: 'servers.dat',
      sourcePath: 'minecraft/servers.dat',
      targetPath: 'servers.dat',
      description: 'Server list'
    }
  ];

  const copiedAssets = [];

  for (const asset of assetsConfig) {
    const sourcePath = path.join(instancePath, asset.sourcePath);
    const targetPath = path.join(metadataPath, asset.targetPath);

    if (fs.existsSync(sourcePath)) {
      try {
        // Ensure target directory exists
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // Copy file or directory
        if (fs.statSync(sourcePath).isDirectory()) {
          await copyDirectory(sourcePath, targetPath);
          console.log(`   ✅ Copied directory: ${asset.description}`);
        } else {
          fs.copyFileSync(sourcePath, targetPath);
          console.log(`   ✅ Copied file: ${asset.description}`);
        }

        copiedAssets.push(asset.name);
      } catch (error) {
        console.warn(`   ⚠️  Failed to copy ${asset.name}: ${error.message}`);
      }
    } else {
      console.log(`   ⏭️  Skipped ${asset.name}: not found`);
    }
  }

  return copiedAssets;
}

/**
 * Recursively copy a directory
 */
async function copyDirectory(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

/**
 * Clean up old asset copies before syncing new ones
 */
export function cleanAssetDirectories(metadataPath) {
  const assetDirs = ['configureddefaults', 'kubejs', 'datapacks', 'resourcepacks', 'shaderpacks'];
  const assetFiles = ['icon.png', 'servers.dat'];

  for (const dir of assetDirs) {
    const dirPath = path.join(metadataPath, dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  for (const file of assetFiles) {
    const filePath = path.join(metadataPath, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
