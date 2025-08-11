# GlenCraft Cog & Mon
## Minecraft Pack Builder and Server

This repo has two main components:
1. **Minecraft Pack Builder**: A tool to create and update my GlenCraft Minecraft Modpack.
2. **Minecraft Server**: The server for hosing the GlenCraft Minecraft world at a given version. 

## Prerequisites
- Node.js (v18 or later)

## Usage for Minecraft Pack Builder

Clone the repo into a directory of your choice -- I choose the `<Prism Launcher instance>/.minecraft` and I run it in 
`<Prism Launcher instance>/.minecraft/mr-packer`:

```bash
cd <Prism Launcher instance>/.minecraft
git clone git@github.com:rhettl/glencraft-goc-n-mon.git mr-packer
cd mr-packer
npm install
```

My version has some customizations that I added for my own use, so I recommend reading the code before using it.

```bash 
node build-mrpack.js
```

This will compile information from the `modpack.json` file and the `../mods` directory (instance mods dir) to create a 
new `GlenCraft-CogAndMon.mrpack` file. This file is for the end user in tools like Prism Launcher, Modrinth, etc.

Since I am manually tweaking structure sparseness using the sparseStructures mod, I also include a tool for parsing and 
compiling the `config/sparseStructures.json5` file. If you don't use this, be sure to comment the lines in 
`build-mrpack.js` that reference it, which look like this:

```javascript
fs.writeFileSync('sparsestructures.json5', compileSparseStructures({ idBasedSalt: false }), 'utf8');
await pack.addOverrideFile('sparsestructures.json5', 'configureddefaults/config/sparsestructures.json5');
```

## Usage for Minecraft Server
Install in the same place as listed above, `<Prism Launcher instance>/.minecraft/mr-packer`, using git clone and npm 
install. Then, from the closed directory, run:

```bash
node build-server.js
```

This will make `.server/`. Use the FTP client of your choice to upload the contents of this directory to your Minecraft 
server. The server can be started by running the `server.jar`.

It will also make a `GlenCraft-CogAndMon-server.zip` file, which is a zip of the server directory.





