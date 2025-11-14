# 🎮 GlenCraft: Cog & Mon

A comprehensive Minecraft modpack development pipeline combining **Cobblemon** with **Create** mod automation, featuring automated builds, server deployment, and development workflows.

## ✨ Features

- 🔄 **Automated Sync**: Extract modpack data from PrismLauncher instances
- 📦 **Client Builds**: Generate `.mrpack` files for distribution  
- 🖥️ **Server Builds**: Complete server setup with NeoForge installation
- 🚀 **SFTP Deployment**: Push server builds to remote hosting with smart file protection
- ⚡ **Dev Optimizations**: Fast deployment modes for rapid iteration
- 🧪 **Testing Suite**: Comprehensive validation and quality assurance

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **Java 21** (for NeoForge server setup)
- **PrismLauncher** with configured modpack instance

### Installation
```bash
# Clone and install
git clone <repository-url>
cd glencraft-cog-n-mon
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings
```

### Basic Workflow
```bash
# 1. Extract from PrismLauncher
npm run sync

# 2. Build client package
npm run build

# 3. Build server
npm run server

# 4. Deploy to remote server
npm run deploy
```

## 📋 Available Commands

### Core Workflow
| Command | Description |
|---------|-------------|
| `npm run sync` | Extract modpack data from PrismLauncher |
| `npm run build` | Generate client `.mrpack` distribution |
| `npm run server` | Build complete server with NeoForge |
| `npm run deploy` | Deploy server via SFTP |

### Development & Testing
| Command | Description |
|---------|-------------|
| `npm run deploy:yes` | Deploy with auto-confirmation |
| `npm run deploy:dev` | Deploy skipping libraries (fast) |
| `npm run deploy:dev:yes` | Fast deploy with auto-confirm |
| `npm test` | Run test suite |
| `npm run test:run` | Run tests once |
| `npm run clean` | Clean build artifacts |

## ⚙️ Configuration

### Environment Variables
Create `.env` from `.env.example`:

```bash
# SFTP Deployment
SFTP_HOST="your.server.com"
SFTP_PORT="22"
SFTP_USER="username" 
SFTP_PASS="password"
SFTP_REMOTE_PATH="/path/to/minecraft/server"

# PrismLauncher Settings
PRISMLAUNCHER_INSTANCES_DIR="/path/to/prismlauncher/instances"
MODPACK_INSTANCE_NAME="GlenCraft Cog Mon"
```

### Modpack Configuration
Edit `pack-config.json`:
```json
{
  "name": "GlenCraft: Cog & Mon",
  "version": "1.0.0",
  "minecraft": "1.21.1",
  "neoforge": "21.1.215",
  "description": "Pokemon meets automation in Minecraft"
}
```

## 📁 Project Structure

```
├── scripts/                 # Build and deployment scripts
│   ├── lib/                # Shared utilities
│   │   ├── sftp.js         # SFTP operations
│   │   ├── server-setup.js # Server installation
│   │   └── prompt.js       # User interaction
│   ├── sync.js             # PrismLauncher extraction
│   ├── build.js            # Client build
│   ├── server.js           # Server build
│   └── deploy.js           # SFTP deployment
├── releases/               # Generated builds
│   ├── client/            # .mrpack files
│   └── server/            # Server files
├── docs/                  # Documentation
└── tests/                 # Test files
```

## 🔧 Development Workflow

### Rapid Iteration
For active development, use the fast deployment workflow:

```bash
# Initial full deployment
npm run sync && npm run server && npm run deploy

# Quick updates (skip libraries for speed)
npm run deploy:dev:yes
```

### Server Management
The deployment system protects critical server files:
- `ops.json`, `whitelist.json`, `banned-*.json` - Never overwritten
- `world/`, `logs/` - Preserved on server
- `mods/`, `kubejs/` - Fully synchronized

### File Protection
Protected files are preserved during deployment:
```javascript
// These files are never overwritten if they exist
const protectedFiles = [
  'banned-ips.json',
  'banned-players.json', 
  'whitelist.json',
  'ops.json'
];
```

## 🖥️ Server Setup

### Generated Files
After running `npm run server`, you get:
- `server.jar` - Main server executable (use this)
- `start-server.sh/.bat` - Launch scripts with optimized JVM args
- `server.properties` - Configured for modpack
- `eula.txt` - Automatically accepted

### Launch Commands
**Hosting Panel**: Use `server.jar` as your server file
**Manual**: Run `./start-server.sh` or use the .bat file on Windows

### JVM Arguments (Built-in)
The generated launch scripts include optimized JVM arguments:
```bash
-Xms2G -Xmx4G -XX:+UseG1GC -XX:+ParallelRefProcEnabled 
-XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions
# ... plus 10+ additional optimizations
```

## 🧪 Testing

Run the test suite:
```bash
npm test          # Watch mode
npm run test:run  # Single run
```

Tests cover:
- Mod compatibility validation
- Build process verification
- SFTP deployment simulation
- Configuration validation

## 🔍 Troubleshooting

### Common Issues

**"PrismLauncher instance not found"**
- Check `PRISMLAUNCHER_INSTANCES_DIR` in `.env`
- Verify `MODPACK_INSTANCE_NAME` matches exactly

### Performance Tips
- Use `--skip-libraries` with the deploy script for repeated deployments

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**GlenCraft: Cog & Mon** - Where Pokemon meets automation! 🚂⚡🐾
