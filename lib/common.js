import crypto from 'crypto';
import fs     from 'fs';
import fetch  from 'node-fetch';

export function ensureDir (dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function rm (dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function parsePlInstanceData (filePath) {
  const plInstanceData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return plInstanceData.components.reduce((obj, next) => {
    obj[next.cachedName] = next;
    return obj;
  }, {})
}

export function isSupported (side, env, optional = false) {
  if (side === 'server' && [ 'server', 'both' ].includes(env)) {
    return optional ? 'optional' : 'required';
  } else if (side === 'client' && [ 'client', 'both' ].includes(env)) {
    return optional ? 'optional' : 'required';
  }
  return 'unsupported';
}

export function modIsDisabled (filePath) {
  // if filePath exists, it is enabled
  if (fs.existsSync(filePath)) {
    return false;
  }
  // if filePath does not exist, check for .disabled file
  const disabledFilePath = filePath + '.disabled';
  if (fs.existsSync(disabledFilePath)) {
    return true;
  }
  throw new Error(`File ${filePath} does not exist and no .disabled file found.`);
}

export function getFileSizeSync (filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    console.error(`Error getting file size for ${filePath}:`, error);
    return 0;
  }
}

export function getSha1Sync (filePath) {
  try {
    const hash = crypto.createHash('sha1');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  } catch (error) {
    console.error(`Error calculating SHA1 for ${filePath}:`, error);
    return null;
  }
}

export function getSha512Sync (filePath) {
  try {
    const hash = crypto.createHash('sha512');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  } catch (error) {
    console.error(`Error calculating SHA512 for ${filePath}:`, error);
    return null;
  }
}

export function getModrinthVersionId (sha1) {
  return fetch(`https://api.modrinth.com/v2/version_file/${sha1}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch version ID for SHA1 ${sha1}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => data.files ?? [])
    .catch(error => {
      // console.error(`Error fetching Modrinth version ID:`, error);
      return null;
    });
}
