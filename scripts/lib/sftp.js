import fs from 'fs-extra';
import path from 'path';
import SftpClient from 'ssh2-sftp-client';

/**
 * Connect to SFTP server
 */
export async function connectSFTP(config) {
  console.log(`🔗 Connecting to SFTP server ${config.host}:${config.port}...`);

  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.user,
      password: config.pass
    });

    console.log(`   ✅ Connected to ${config.host}`);
    return sftp;
  } catch (error) {
    throw new Error(`Failed to connect to SFTP server: ${error.message}`);
  }
}

/**
 * Check if remote file exists and get its stats
 */
export async function getRemoteFileInfo(sftp, remotePath) {
  try {
    const stats = await sftp.stat(remotePath);
    return {
      exists: true,
      size: stats.size,
      isDirectory: stats.isDirectory()
    };
  } catch (error) {
    return { exists: false };
  }
}

/**
 * Ensure remote directory exists (create if it doesn't)
 */
export async function ensureRemoteDir(sftp, remotePath) {
  try {
    const info = await getRemoteFileInfo(sftp, remotePath);
    if (!info.exists) {
      await sftp.mkdir(remotePath, true); // recursive
    }
  } catch (error) {
    throw new Error(`Failed to create directory ${remotePath}: ${error.message}`);
  }
}

/**
 * Compare local and remote files for mods directory
 */
export async function compareMods(sftp, localModsDir, remoteModsDir) {
  console.log('📊 Comparing mods directory...');

  if (!await fs.pathExists(localModsDir)) {
    return { toUpload: [], toDelete: [], unchanged: [] };
  }

  const localFiles = await fs.readdir(localModsDir);
  const localMods = [];

  // Get local mod info
  for (const file of localFiles) {
    const localPath = path.join(localModsDir, file);
    const stats = await fs.stat(localPath);
    if (stats.isFile()) {
      localMods.push({ name: file, size: stats.size, localPath });
    }
  }

  // Get remote mod info
  const remoteInfo = await getRemoteFileInfo(sftp, remoteModsDir);
  let remoteMods = [];

  if (remoteInfo.exists && remoteInfo.isDirectory) {
    try {
      const remoteFiles = await sftp.list(remoteModsDir);
      remoteMods = remoteFiles
        .filter(file => file.type === '-') // regular files only
        .map(file => ({ name: file.name, size: file.size }));
    } catch (error) {
      console.log(`   ⚠️  Could not list remote mods: ${error.message}`);
    }
  }

  const toUpload = [];
  const unchanged = [];

  // Compare local vs remote
  for (const localMod of localMods) {
    const remoteMod = remoteMods.find(r => r.name === localMod.name);

    if (!remoteMod || remoteMod.size !== localMod.size) {
      toUpload.push({ ...localMod, size: localMod.size });
    } else {
      unchanged.push({ ...localMod, size: localMod.size });
    }
  }

  // Find mods to delete (exist remotely but not locally)
  const toDelete = remoteMods.filter(remoteMod =>
    !localMods.find(localMod => localMod.name === remoteMod.name)
  );

  console.log(`   📋 Analysis: ${toUpload.length} to upload, ${unchanged.length} unchanged, ${toDelete.length} to delete`);

  return { toUpload, toDelete, unchanged };
}

/**
 * Deploy mods directory selectively
 */
export async function deployMods(sftp, localModsDir, remoteModsDir, comparison) {
  console.log(`   🔄 Updating mods directory...`);

  // Ensure remote mods directory exists
  await ensureRemoteDir(sftp, remoteModsDir);

  // Upload new/changed mods
  for (let i = 0; i < comparison.toUpload.length; i++) {
    const mod = comparison.toUpload[i];
    const progress = `(${i + 1}/${comparison.toUpload.length})`;
    console.log(`      ⬆️  ${progress} ${mod.name} (${formatBytes(mod.size)})`);

    const remotePath = path.posix.join(remoteModsDir, mod.name);
    await sftp.put(mod.localPath, remotePath, {
      step: (totalTransferred, chunk, total) => {
        const percent = ((totalTransferred / total) * 100).toFixed(1);
        process.stdout.write(`\r         📤 Progress: ${percent}% (${formatBytes(totalTransferred)}/${formatBytes(total)})`);
      }
    });
    console.log(); // New line after progress
  }

  // Delete removed mods
  for (const mod of comparison.toDelete) {
    console.log(`      🗑️  Removing ${mod.name}`);
    const remotePath = path.posix.join(remoteModsDir, mod.name);
    try {
      await sftp.delete(remotePath);
    } catch (error) {
      console.log(`      ⚠️  Could not delete ${mod.name}: ${error.message}`);
    }
  }

  console.log(`   ✅ Mods updated (${comparison.toUpload.length} uploaded, ${comparison.toDelete.length} removed, ${comparison.unchanged.length} unchanged)`);
}

/**
 * Upload file or directory with progress tracking
 */
export async function uploadPath(sftp, localPath, remotePath, isDirectory) {
  if (isDirectory) {
    // For directories, we need to track progress manually
    const files = await getAllFiles(localPath);
    console.log(`      📁 Uploading directory with ${files.length} files...`);

    await sftp.uploadDir(localPath, remotePath, {
      step: (totalTransferred, chunk, total) => {
        const percent = ((totalTransferred / total) * 100).toFixed(1);
        process.stdout.write(`\r      📤 Progress: ${percent}% (${formatBytes(totalTransferred)}/${formatBytes(total)})`);
      }
    });
    console.log(); // New line after progress
  } else {
    // For single files, show file size
    const stats = await fs.stat(localPath);
    console.log(`      📄 Uploading ${formatBytes(stats.size)}...`);

    await sftp.put(localPath, remotePath, {
      step: (totalTransferred, chunk, total) => {
        const percent = ((totalTransferred / total) * 100).toFixed(1);
        process.stdout.write(`\r      📤 Progress: ${percent}% (${formatBytes(totalTransferred)}/${formatBytes(total)})`);
      }
    });
    console.log(); // New line after progress
  }
}

/**
 * Get all files in a directory recursively
 */
async function getAllFiles(dirPath) {
  const files = [];

  async function scan(currentPath) {
    const items = await fs.readdir(currentPath);
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stats = await fs.stat(fullPath);
      if (stats.isFile()) {
        files.push(fullPath);
      } else if (stats.isDirectory()) {
        await scan(fullPath);
      }
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
