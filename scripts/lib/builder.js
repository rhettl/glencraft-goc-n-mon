import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';

/**
 * Load pack metadata from metadata/pack.json
 */
export async function loadPackMetadata(metadataDir) {
  console.log('📖 Loading pack metadata...');
  const packJsonPath = path.join(metadataDir, 'pack.json');

  if (!await fs.pathExists(packJsonPath)) {
    throw new Error('pack.json not found. Run sync script first.');
  }

  const packData = await fs.readJSON(packJsonPath);
  console.log(`   Found ${packData.mods.length} mods in metadata`);

  return packData;
}

/**
 * Categorize mods by download availability
 */
export function categorizeMods(mods) {
  const modrinthMods = [];
  const nonDownloadableMods = [];

  for (const mod of mods) {
    if (mod.modrinth && mod.modrinth.modId && mod.modrinth.version) {
      modrinthMods.push(mod);
    } else {
      nonDownloadableMods.push(mod);
    }
  }

  return { modrinthMods, nonDownloadableMods };
}

/**
 * Generate modrinth.index.json content
 */
export function generateModrinthIndex(modrinthMods, packInfo) {
  console.log('🔗 Generating Modrinth index...');

  const files = modrinthMods.map(mod => ({
    path: `mods/${mod.filename}`,
    hashes: {
      sha512: mod.sha512
    },
    env: {
      client: mod.side === 'both' || mod.side === 'client' ? 'required' : 'unsupported',
      server: mod.side === 'both' || mod.side === 'server' ? 'required' : 'unsupported'
    },
    downloads: [
      `https://cdn.modrinth.com/data/${mod.modrinth.modId}/versions/${mod.modrinth.version}/${mod.filename}`
    ],
    fileSize: mod.size
  }));

  console.log(`   Generated ${files.length} Modrinth download entries`);

  return {
    formatVersion: 1,
    game: 'minecraft',
    versionId: packInfo.gameVersion,
    name: packInfo.name,
    summary: packInfo.description,
    files,
    dependencies: {
      minecraft: packInfo.gameVersion,
      [packInfo.loaderType]: packInfo.loaderVersion
    }
  };
}

/**
 * Copy overrides (assets that aren't mods)
 */
export async function copyOverrides(metadataDir, tempDir) {
  console.log('📁 Copying overrides...');

  const overridesDir = path.join(tempDir, 'overrides');
  await fs.ensureDir(overridesDir);

  const assetDirs = [
    { source: 'configureddefaults', target: 'configureddefaults' },
    { source: 'kubejs', target: 'kubejs' },
    { source: 'datapacks', target: 'datapacks' },
    { source: 'resourcepacks', target: 'resourcepacks' },
    { source: 'shaderpacks', target: 'shaderpacks' }
  ];

  let copiedCount = 0;

  for (const { source, target } of assetDirs) {
    const sourcePath = path.join(metadataDir, source);
    const targetPath = path.join(overridesDir, target);

    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, targetPath);
      console.log(`   ✓ Copied ${source}`);
      copiedCount++;
    }
  }

  // Copy icon if it exists
  const iconPath = path.join(metadataDir, 'icon.png');
  if (await fs.pathExists(iconPath)) {
    await fs.copy(iconPath, path.join(tempDir, 'icon.png'));
    console.log(`   ✓ Copied icon.png`);
    copiedCount++;
  }

  console.log(`   Copied ${copiedCount} asset directories/files`);
}

/**
 * Create .mrpack file from index data and overrides
 */
export async function createMrpack(indexData, metadataDir, outputPath, distDir) {
  console.log('📦 Creating .mrpack file...');

  // Create temporary directory for building
  const tempDir = path.join(distDir, 'temp');
  await fs.ensureDir(tempDir);

  try {
    // Write modrinth.index.json
    console.log('   📝 Writing modrinth.index.json...');
    await fs.writeJSON(path.join(tempDir, 'modrinth.index.json'), indexData, { spaces: 2 });

    // Copy overrides
    await copyOverrides(metadataDir, tempDir);

    // Create the .mrpack archive
    console.log('   🗜️  Compressing to .mrpack...');
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const promise = new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`   ✓ Created ${path.basename(outputPath)} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
        resolve();
      });

      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.warn('   ⚠️  Archive warning:', err.message);
        } else {
          reject(err);
        }
      });

      archive.pipe(output);

      // Add all files from temp directory
      archive.directory(tempDir, false);
      archive.finalize();
    });

    return await promise;
  } finally {
    // Clean up temp directory
    await fs.remove(tempDir);
  }
}

/**
 * Report non-downloadable mods to the user
 */
export function reportNonDownloadableMods(nonDownloadableMods) {
  if (nonDownloadableMods.length === 0) {
    console.log('✅ All mods can be downloaded from Modrinth!');
    return;
  }

  console.log(`\n⚠️  Found ${nonDownloadableMods.length} mods that cannot be downloaded from Modrinth:`);
  console.log('   These mods will NOT be included in the modpack:\n');

  for (const mod of nonDownloadableMods) {
    const reason = !mod.modrinth ? 'No Modrinth data' :
                  !mod.modrinth.modId ? 'Missing mod ID' :
                  'Missing version ID';
    console.log(`   ❌ ${mod.name || mod.filename} (${reason})`);
  }

  console.log('\n   Consider manually uploading these mods to a hosting service or finding');
  console.log('   Modrinth alternatives if you want them included in the modpack.');
}

/**
 * Load package.json for naming
 */
export async function loadPackageInfo(rootDir) {
  const packagePath = path.join(rootDir, 'package.json');
  const packageData = await fs.readJSON(packagePath);
  return {
    name: packageData.name,
    version: packageData.version
  };
}

/**
 * Generate safe filename from package name and version
 */
export function generateOutputFilename(packageName, packageVersion) {
  return `${packageName}-v${packageVersion}.mrpack`;
}
