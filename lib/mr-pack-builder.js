import archiver from 'archiver';
import fs       from 'fs';
import path     from 'path';
import toml     from 'toml';
import {
  ensureDir,
  getFileSizeSync,
  getModrinthVersionId,
  getSha1Sync,
  getSha512Sync,
  isSupported,
  modIsDisabled,
  rm
}               from './common.js';

const buildDir = path.resolve('./.build');

export class MrPackBuilder {
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
    ensureDir(path.join(this.buildDir, 'overrides'));
  }

  cleanDir (dir) {
    rm(dir);
  }

  /**
   * Scans the mods directory for mod files and their metadata.
   * @param {String} modsDir - The directory containing mod files.
   * @param {Array<RegExp>} [ensureMods] -- Array of mod names (regex) that must be included in the pack if available.
   * @param {Array<RegExp>} [ignoreMods] -- Array of mod names (regex) that should be ignored in the pack if available.
   * @param {Boolean} [includeAll] -- If true, all mods will be included regardless of their side (client/server).
   * @returns {Promise<void>}
   */
  async scanModsDirectory (modsDir, { ensureMods = [], ignoreMods = [], includeAll = false } = {}) {
    let modFiles = [];

    const sideCheck = (check, stated, dis) => {
      if (!includeAll || check === 'server') {
        return isSupported(check, stated, dis);
      }

      if (check === 'client') {
        return dis ? 'optional' : 'required';
      }
    }

    const indexFiles = this.scanModIndex(modsDir);
    for (const modData of indexFiles) {

      if (modData.download.mode === 'url') {
        let modFilePath  = path.join(modsDir, modData.filename);
        const isDisabled = modIsDisabled(modFilePath);
        if (isDisabled) {
          modFilePath += '.disabled';
        }

        modFiles.push({
          downloads: [
            modData.download?.url
          ],
          env:       {
            client: sideCheck('client', modData.side, isDisabled),
            server: sideCheck('server', modData.side, isDisabled)
          },
          fileSize:  getFileSizeSync(modFilePath),
          hashes:    {
            'sha1':   getSha1Sync(modFilePath),
            'sha512': getSha512Sync(modFilePath)
          },
          path:      `mods/${modData.filename}`,
          isDisabled
        });
      } else if (modData.download.mode === 'metadata:curseforge') {
        let modFilePath  = path.join(modsDir, modData.filename);
        const isDisabled = modIsDisabled(modFilePath);
        if (isDisabled) {
          modFilePath += '.disabled';
        }

        const apiFiles = await getModrinthVersionId(getSha1Sync(modFilePath));
        if (!apiFiles || apiFiles.length === 0 || apiFiles.length > 1) {
          modFiles.push({
            isDisabled,
            override: true,
            filePath: modFilePath,
            env:      {
              client: sideCheck('client', modData.side, isDisabled),
              server: sideCheck('server', modData.side, isDisabled)
            },
            data:     modData
          })
          continue;
        }

        modFiles.push({
          downloads: [
            apiFiles[0].url
          ],
          env:       {
            client: sideCheck('client', modData.side, isDisabled),
            server: sideCheck('server', modData.side, isDisabled)
          },
          fileSize:  apiFiles[0].size,
          hashes:    apiFiles[0].hashes,
          path:      `mods/${apiFiles[0].filename}`,
          isDisabled
        });
      } else {
        console.warn(`Unsupported download mode for file: ${filePath}`);
        console.log(modData);
      }
    }

    modFiles = modFiles.map(m => {
      for (let pattern of ignoreMods) {
        if (pattern.test(m.path || m.filePath)) {
          m.env.client = m.isDisabled ? 'optional' : 'unsupported'; // ensure this mod is always included
        }
      }
      for (let pattern of ensureMods) {
        if (pattern.test(m.path || m.filePath)) {
          m.env.client = m.isDisabled ? 'optional' : 'required'; // ensure this mod is always included
        }
      }

      return m;
    })

    this.files        = modFiles
      .filter(f => !f.override)
      .map(({ isDisabled, ...file }) => file)
    ;
    this.overrideMods = modFiles
      .filter(f => f.override)
    ;
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

  buildIcon () {
    if (this.icon) {
      const iconPath = path.join(this.buildDir, 'pack.png');
      fs.copyFileSync(this.icon, iconPath);
    } else {
      console.warn('No icon specified for the modpack.');
    }
  }

  copyOverrideMods () {
    const overridesModDir = path.join(this.buildDir, 'overrides', 'mods');
    ensureDir(overridesModDir);
    for (let file of this.overrideMods) {
      fs.copyFileSync(file.filePath, path.join(overridesModDir, path.basename(file.filePath)));
    }
  }

  addOverrideDirectory (srcDir, destPath) {
    destPath = path.join(this.buildDir, 'overrides', destPath);
    ensureDir(destPath);
    if (fs.existsSync(srcDir)) {
      fs.cpSync(srcDir, destPath, { recursive: true, force: true });
    } else {
      console.warn(`Source directory does not exist: ${srcDir}`);
    }
  }

  addOverrideFile (srcFile, destPath) {
    const destDir  = path.join(this.buildDir, 'overrides', path.dirname(destPath));
    const destFile = path.join(destDir, path.basename(destPath));
    ensureDir(path.dirname(destDir));
    fs.copyFileSync(srcFile, destFile);
  }

  removeOverrideFile (filePath) {
    const destFile = path.join(this.buildDir, 'overrides', filePath);
    if (fs.existsSync(destFile)) {
      fs.rmSync(destFile, { force: true, recursive: true });
    }
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

  async buildArchive (outputPath) {
    return new Promise((resolve, reject) => {
      // Ensure output directory exists
      ensureDir(path.dirname(outputPath));

      // Create the output stream
      const output  = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        console.log(`Pack built: ${outputPath} (${archive.pointer()} total bytes)`);
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

}
