#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { connectSFTP, getRemoteFileInfo, compareMods, deployMods, uploadPath, ensureRemoteDir } from './lib/sftp.js';
import { askConfirmation } from './lib/prompt.js';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(__dirname);
const serverDir = path.join(rootDir, 'releases', 'server');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    autoConfirm: args.includes('-y') || args.includes('--yes'),
    skipLibraries: args.includes('--skip-libraries')
  };
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

/**
 * Load SFTP configuration from environment
 */
function loadSFTPConfig() {
  const requiredVars = ['SFTP_HOST', 'SFTP_USER', 'SFTP_PASS'];
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    host: process.env.SFTP_HOST,
    port: parseInt(process.env.SFTP_PORT || '22'),
    user: process.env.SFTP_USER,
    pass: process.env.SFTP_PASS,
    remotePath: process.env.SFTP_REMOTE_PATH || '/minecraft/server'
  };
}

/**
 * Scan entire server directory for deployment
 */
async function scanServerDirectory(serverDir, options = {}) {
  const { skipLibraries = false } = options;
  const items = [];

  async function scanDir(currentDir, relativePath = '') {
    const dirContents = await fs.readdir(currentDir);

    for (const item of dirContents) {
      const itemPath = path.join(currentDir, item);
      const stats = await fs.stat(itemPath);
      const relativeName = path.posix.join(relativePath, item);

      // Skip libraries directory if flag is set
      if (skipLibraries && (relativeName === 'libraries' || relativeName.startsWith('libraries/'))) {
        continue;
      }

      if (stats.isDirectory()) {
        items.push({
          name: relativeName,
          localPath: itemPath,
          type: 'directory',
          action: getSyncAction(relativeName)
        });
        // Recursively scan subdirectories
        await scanDir(itemPath, relativeName);
      } else {
        items.push({
          name: relativeName,
          localPath: itemPath,
          type: 'file',
          size: stats.size,
          action: getSyncAction(relativeName)
        });
      }
    }
  }

  await scanDir(serverDir);
  return items;
}

/**
 * Determine sync action for a path
 */
function getSyncAction(relativePath) {
  const topLevel = relativePath.split('/')[0];

  // Directories that should be completely synchronized (no extra remote files)
  const exactSyncDirs = ['mods', 'libraries', 'kubejs', 'configureddefaults'];

  if (exactSyncDirs.includes(topLevel)) {
    return 'exact-sync';
  }

  return 'upload-only'; // Upload local files, but don't remove extra remote files
}

/**
 * Analyze what needs to be deployed
 */
async function analyzeDeployment(sftp, items, remotePath, options = {}) {
  const { skipLibraries = false } = options;
  console.log('🔍 Analyzing deployment requirements...');

  const toUpload = [];
  const toDelete = [];
  const unchanged = [];
  const toProtect = [];

  // Files that should never be overwritten if they exist remotely
  const protectedFiles = [
    'banned-ips.json',
    'banned-players.json',
    'blacklist.json',
    'whitelist.json',
    'ops.json'
  ];

  // Check local files against remote
  for (const item of items) {
    if (item.type === 'directory') continue; // Skip directory entries, we only care about files

    const fileName = path.basename(item.name);
    const remoteItemPath = path.posix.join(remotePath, item.name);
    const remoteInfo = await getRemoteFileInfo(sftp, remoteItemPath);

    // Check if this is a protected file that already exists remotely
    if (protectedFiles.includes(fileName) && remoteInfo.exists) {
      toProtect.push(item);
      console.log(`   🔒 Protected: ${item.name} (existing file preserved)`);
      continue;
    }

    if (!remoteInfo.exists || (remoteInfo.size !== item.size)) {
      toUpload.push(item);
    } else {
      unchanged.push(item);
    }
  }

  // Check for remote files that should be deleted (exact-sync directories only)
  let exactSyncDirs = ['mods', 'libraries', 'kubejs', 'configureddefaults'];

  // Remove libraries from sync if skipping
  if (skipLibraries) {
    exactSyncDirs = exactSyncDirs.filter(dir => dir !== 'libraries');
  }

  for (const syncDir of exactSyncDirs) {
    const remoteDirPath = path.posix.join(remotePath, syncDir);
    const remoteDirInfo = await getRemoteFileInfo(sftp, remoteDirPath);

    if (remoteDirInfo.exists && remoteDirInfo.isDirectory) {
      try {
        const remoteFiles = await sftp.list(remoteDirPath);
        const localFiles = items
          .filter(item => item.name.startsWith(syncDir + '/') && item.type === 'file')
          .map(item => path.basename(item.name));

        for (const remoteFile of remoteFiles) {
          if (remoteFile.type === '-' && !localFiles.includes(remoteFile.name)) {
            toDelete.push({
              name: path.posix.join(syncDir, remoteFile.name),
              remotePath: path.posix.join(remoteDirPath, remoteFile.name)
            });
          }
        }
      } catch (error) {
        console.log(`   ⚠️  Could not list remote directory ${syncDir}: ${error.message}`);
      }
    }
  }

  console.log(`   📋 Analysis: ${toUpload.length} to upload, ${unchanged.length} unchanged, ${toDelete.length} to delete, ${toProtect.length} protected`);

  return { toUpload, toDelete, unchanged, protected: toProtect };
}

/**
 * Main deployment function
 */
async function deploy() {
  console.log('🚀 Starting server deployment...\n');

  const { autoConfirm, skipLibraries } = parseArgs();

  try {
    // Check if server directory exists
    if (!await fs.pathExists(serverDir)) {
      throw new Error('Server directory not found. Run "npm run server" first.');
    }

    // Load SFTP configuration
    const sftpConfig = loadSFTPConfig();

    // Connect to SFTP
    const sftp = await connectSFTP(sftpConfig);

    try {
      // Check remote server directory
      console.log(`📂 Checking remote directory: ${sftpConfig.remotePath}`);
      const remoteInfo = await getRemoteFileInfo(sftp, sftpConfig.remotePath);

      if (!remoteInfo.exists) {
        console.log(`   ℹ️  Remote directory does not exist, will be created`);
      } else {
        console.log(`   ✅ Remote directory exists`);
      }

            // Scan entire server directory
      const items = await scanServerDirectory(serverDir, { skipLibraries });

      if (skipLibraries) {
        console.log('⚡ Libraries directory skipped (--skip-libraries flag)\n');
      }

      // Analyze what needs to be deployed
      const analysis = await analyzeDeployment(sftp, items, sftpConfig.remotePath, { skipLibraries });

      // Ask for confirmation if needed
      const hasChanges = analysis.toUpload.length > 0 || analysis.toDelete.length > 0;

      if (hasChanges && !autoConfirm) {
        console.log('\n📋 Deployment plan:');

        if (analysis.toUpload.length > 0) {
          console.log(`   ⬆️  ${analysis.toUpload.length} files to upload/update`);
        }

        if (analysis.toDelete.length > 0) {
          console.log(`   🗑️  ${analysis.toDelete.length} files to delete from remote`);
          analysis.toDelete.forEach(item => {
            console.log(`      - ${item.name}`);
          });
        }

        if (analysis.unchanged.length > 0) {
          console.log(`   ✅ ${analysis.unchanged.length} files unchanged`);
        }

        if (analysis.protected.length > 0) {
          console.log(`   🔒 ${analysis.protected.length} files protected from overwrite`);
        }

        console.log('\n⚠️  Files in config/ and world/ directories will be preserved');
        console.log('\u26a0️  Server management files (ops, whitelist, bans) will never be overwritten');
        console.log('\u26a0️  Only mods/, libraries/, kubejs/, and configureddefaults/ will be exactly synchronized');

        const confirmed = await askConfirmation('\n🚨 Continue with deployment?');

        if (!confirmed) {
          console.log('❌ Deployment cancelled by user');
          return false;
        }
      } else if (autoConfirm && hasChanges) {
        console.log('✅ Auto-confirming deployment (-y flag provided)');
      } else if (!hasChanges) {
        console.log('✅ No changes needed - server is already up to date!');
        return true;
      }

      // Perform deployment
      console.log('\n📤 Deploying files...');

      // Ensure remote directory exists
      await ensureRemoteDir(sftp, sftpConfig.remotePath);

            // Perform deletions first
      if (analysis.toDelete.length > 0) {
        console.log('\n🗑️  Removing obsolete files...');
        for (const item of analysis.toDelete) {
          try {
            console.log(`   🗑️  ${item.name}`);
            await sftp.delete(item.remotePath);
          } catch (error) {
            console.log(`      ⚠️  Could not delete ${item.name}: ${error.message}`);
          }
        }
      }

      // Perform uploads
      if (analysis.toUpload.length > 0) {
        console.log('\n📤 Uploading files...');

        for (let i = 0; i < analysis.toUpload.length; i++) {
          const item = analysis.toUpload[i];
          const progress = `(${i + 1}/${analysis.toUpload.length})`;
          const remotePath = path.posix.join(sftpConfig.remotePath, item.name);

          console.log(`   📤 ${progress} ${item.name}`);

          // Ensure parent directory exists
          const parentDir = path.posix.dirname(remotePath);
          await ensureRemoteDir(sftp, parentDir);

          // Upload the file
          await sftp.put(item.localPath, remotePath, {
            step: (totalTransferred, chunk, total) => {
              const percent = ((totalTransferred / total) * 100).toFixed(1);
              process.stdout.write(`\r      📤 Progress: ${percent}% (${formatBytes(totalTransferred)}/${formatBytes(total)})`);
            }
          });
          console.log(); // New line after progress
        }
      }

      console.log('\n✨ Deployment completed successfully!');
      console.log(`📍 Server location: ${sftpConfig.remotePath}`);

      if (analysis.protected.length > 0) {
        console.log(`🔒 ${analysis.protected.length} server management files were protected from overwrite`);
      }

      console.log('🎯 Your server is ready to start!');

        if (analysis.toUpload.some(item => item.name.includes('neoforge') || item.name === 'server.jar')) {
    console.log('\n📝 Server startup info:');
    console.log('   Use server.jar as your server executable');
    console.log('   Add your standard Java memory arguments');
    console.log('   Or use the provided start-server.sh/start-server.bat scripts');
  }

      return true;

    } finally {
      await sftp.end();
      console.log('🔌 SFTP connection closed');
    }

  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  deploy();
}

export { deploy };
