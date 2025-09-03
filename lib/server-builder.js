import archiver                                      from 'archiver';
import { execSync }                                  from 'child_process';
import fs                                            from 'fs';
import fetch                                         from 'node-fetch';
import { constants }                                 from 'node:zlib';
import path                                          from 'path';
import toml                                                                                     from 'toml';
import { cleanDsStoreRecursively, ensureDir, isSupported, modIsDisabled, resizeIconTo64px, rm } from './common.js';

const buildDir = path.resolve('./.server');

export class ServerBuilder {
  constructor ({
                 version,
                 name,
                 summary = '', // optional summary
                 icon = null, // path to icon file
                 game = 'minecraft',
                 formatVersion = 1,
                 dependencies = {
                   minecraft: '1.21.1',
                   neoforge:  '21.1.196'
                 },
               } = {}) {
    this.version       = version;
    this.name          = name;
    this.game          = game;
    this.summary       = summary; // optional summary
    this.formatVersion = formatVersion;
    this.dependencies  = dependencies;
    this.files         = [];
    this.icon          = icon ? path.resolve(icon) : null; // resolve icon path to absolute
    this.overrideMods  = [];
    this.buildDir      = buildDir;

    this.cleanDir(this.buildDir);

    ensureDir(this.buildDir);
  }

  cleanDir (dir) {
    rm(dir);
  }

  /**
   *
   * @param {String} modsDir -- path to the mods directory
   * @param {Array<RegExp>} [ensureMods] -- list of Regexp patterns to ensure mods are included if available
   * @param {Array<RegExp>} [ignoreMods] -- list of Regexp patterns to ignore mods if included
   * @returns {Promise<void>}
   */
  async scanModsDirectory (modsDir, { ensureMods = [], ignoreMods = [] } = {}) {
    this.verifyModIndexes(modsDir);

    const modFiles   = [];
    const indexFiles = this.scanModIndex(modsDir);
    for (const modData of indexFiles) {

      let modFilePath  = path.join(modsDir, modData.filename);
      const isDisabled = modIsDisabled(modFilePath);
      if (isDisabled) {
        modFilePath += '.disabled';
      }

      modFiles.push({
        filePath: modFilePath,
        filename: modData.filename,
        env:      {
          client: isSupported('client', modData.side, isDisabled),
          server: isSupported('server', modData.side, isDisabled)
        },
        isDisabled
      });

    }

    console.log('Ignoring unsupported mods:');
    modFiles.forEach(mod => {
      let unsupported = false;
      for (const pattern of ignoreMods) {
        if (pattern instanceof RegExp && pattern.test(mod.filename)) {
          unsupported = true;
          break; // Stop checking once we find a match
        }
      }

      if (mod.env.server === 'unsupported' || unsupported) {
        console.log(`- ${mod.filename} (side: ${mod.env.client}, ${mod.env.server})`);
      }
    });

    this.files = modFiles.filter(m => {
      for (const pattern of ignoreMods) {
        if (pattern instanceof RegExp && pattern.test(m.filename)) {
          return false; // Ignore this mod
        }
      }

      if (m.env.server !== 'unsupported') {
        return true; // Include this mod
      }

      for (const pattern of ensureMods) {
        if (pattern instanceof RegExp && pattern.test(m.filename)) {
          // console.warn(`Ensuring mod: ${m.filename}`);
          return true; // Ensure this mod
        }
      }

      return false;
    });
  }

  buildIndexJson () {
    const index = {
      formatVersion: this.formatVersion,
      game:          this.game,
      versionId:     this.version,
      name:          this.name,
      summary:       this.summary || '',
      icon:          this.icon ? 'pack.png' : undefined,
      files:         this.files,
      dependencies:  this.dependencies
    };

    fs.writeFileSync(path.join(this.buildDir, 'modrinth.index.json'), JSON.stringify(index), { encoding: 'utf-8' });
  }

  async buildIcon () {
    if (this.icon) {
      const iconPath = path.join(this.buildDir, 'server-icon.png');
      await resizeIconTo64px(this.icon, iconPath);
    } else {
      console.warn('No icon specified for the modpack.');
    }
  }

  copyMods () {
    const modDir = path.join(this.buildDir, 'mods');
    ensureDir(modDir);
    for (let file of this.files) {
      fs.copyFileSync(file.filePath, path.join(modDir, path.basename(file.filePath)));
    }
  }

  addDirectory (srcDir, destPath) {
    destPath = path.join(this.buildDir, destPath);
    ensureDir(destPath);
    if (fs.existsSync(srcDir)) {
      fs.cpSync(srcDir, destPath, { recursive: true, force: true });
    } else {
      console.warn(`Source directory does not exist: ${srcDir}`);
    }
  }

  addFile (srcFile, destPath) {
    const destDir  = path.join(this.buildDir, path.dirname(destPath));
    const destFile = path.join(destDir, path.basename(destPath));
    ensureDir(path.dirname(destDir));
    fs.copyFileSync(srcFile, destFile);
  }

  removeFile (filePath) {
    const destFile = path.join(this.buildDir, filePath);
    if (fs.existsSync(destFile)) {
      fs.rmSync(destFile, { force: true, recursive: true });
    }
  }

  async installServer () {
    execSync(`java -jar neoforge-${this.dependencies.neoforge}-installer.jar --installServer  --server-starter`, {
      cwd: this.buildDir
    });
    this.removeFile(`neoforge-${this.dependencies.neoforge}-installer.jar`);
  }

  async downloadServerJars () {
    const mcVersion  = this.dependencies.minecraft;
    const neoVersion = this.dependencies.neoforge;

    const mcUrl  = `https://piston-data.mojang.com/v1/objects/${await this.getMinecraftServerHash(mcVersion)}/server.jar`;
    const neoUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`;

    await this.downloadFile(mcUrl, path.join(this.buildDir, `minecraft-${mcVersion}-server.jar`));
    await this.downloadFile(neoUrl, path.join(this.buildDir, `neoforge-${neoVersion}-installer.jar`));
  }

  async getMinecraftServerHash (version) {
    const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
    const manifest    = await fetch(manifestUrl).then(r => r.json());
    const versionData = manifest.versions.find(v => v.id === version);
    const versionJson = await fetch(versionData.url).then(r => r.json());
    return versionJson.downloads.server.sha1;
  }

  async downloadFile (url, dest) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}`);
    const fileStream = fs.createWriteStream(dest);
    await new Promise((resolve, reject) => {
      res.body.pipe(fileStream);
      res.body.on('error', reject);
      fileStream.on('finish', resolve);
    });
  }

  scanModIndex (modsDir) {
    const modsIndexDir = path.join(modsDir, '.index');

    if (!fs.existsSync(modsIndexDir)) {
      throw new Error(`Mods index directory not found: ${modsIndexDir}`);
    }

    return fs.readdirSync(modsIndexDir)
      .filter(name => name.endsWith('.toml') && !name.startsWith('.'))
      .map(file => {
        const filePath = path.join(modsIndexDir, file);
        const content  = fs.readFileSync(filePath, 'utf-8');
        return toml.parse(content);
      })
      ;
  }

  scanModDirectory (modsDir) {
    if (fs.existsSync(modsDir)) {
      return fs.readdirSync(modsDir)
        .filter(name => name.endsWith('.jar') || name.endsWith('.disabled'))
        ;
    } else {
      throw new Error(`Mods directory not found: ${modsDir}`);
    }
  }

  verifyModIndexes (modsDir) {
    const _indexFiles = this.scanModIndex(modsDir);
    const modFiles    = this.scanModDirectory(modsDir);

    const indexFiles = _indexFiles.reduce((obj, next) => {
      obj[next.filename] = next;
      return obj;
    }, {});

    const missingIndexes = modFiles.filter(file => !indexFiles[file.replace(/\.disabled$/, '')]);
    const missingFiles   = Object.getOwnPropertyNames(indexFiles)
      .filter(file => !modFiles.includes(file) && !modFiles.includes(`${file}.disabled`));

    if (missingFiles.length > 0) {
      console.warn('Missing mod files for the following indexes:');
      missingFiles.forEach(file => console.warn(`- ${file}`));
      throw new Error(`Missing mod indexes for files: see above warnings.`);
    } else if (missingIndexes.length > 0) {
      console.warn('Missing mod indexes for the following files:');
      missingIndexes.forEach(file => console.warn(`- ${file}`));
      throw new Error(`Missing mod files for indexes: see above warnings.`);
    }

  }

  async buildArchive (outputPath) {
    return new Promise((resolve, reject) => {
      // Ensure output directory exists
      ensureDir(path.dirname(outputPath));

      // Create the output stream
      const output  = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: constants.Z_BEST_COMPRESSION } });
      cleanDsStoreRecursively(this.buildDir);

      output.on('close', () => {
        console.log(`Pack built: ${outputPath} (${Math.round(archive.pointer() / 10000) / 100} total bytes)`);
        resolve();
      });

      archive.on('warning', err => {
        if (err.code === 'ENOENT') {
          console.warn(err);
        } else {
          reject(err);
        }
      });

      archive.on('error', err => reject(err));

      archive.pipe(output);

      // Wrap all files inside a folder named after the pack name
      // const rootFolderName = path.basename(outputPath).replace(/\.\w+/, ''); // or sanitize if needed
      archive.directory(this.buildDir, '/');

      archive.finalize();
    });
  }


  updateModpackJson (packJsonPath) {
    const index = JSON.parse(fs.readFileSync(path.join(this.buildDir, 'modrinth.index.json')).toString('utf-8'));
    const modpackJson = JSON.parse(fs.readFileSync(packJsonPath, 'utf-8'));
    modpackJson.files = index.files;
    modpackJson.neoforge = index.dependencies.neoforge;
    fs.writeFileSync(packJsonPath, JSON.stringify(modpackJson, null, 2), { encoding: 'utf-8' });
  }
}
