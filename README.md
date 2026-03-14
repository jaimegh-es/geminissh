# 💎 Gemini Remote Bridge

**Transparently bridge your local Gemini CLI with any remote Linux environment.**

Gemini Remote Bridge allows you to work locally on your Mac/PC while seamlessly executing commands and syncing files with a remote Linux server via SSH and Mutagen. No more manual uploading or SSH context switching.

## ✨ Features

- **Real-time Sync**: Bi-directional file synchronization using Mutagen.
- **Auto-Command Interception**: Automatically wraps shell commands to execute them on the remote host.
- **Web UI Configurator**: A modern, clean interface to manage your sync sessions and SSH credentials.
- **Live Interception Logs**: View real-time logs of every command bridged to the remote system.
- **Zero-Config Keys**: Automatically handles SSH key generation and installation on the remote host.

## 🚀 Quick Start

1. **Start the Bridge**:
   ```bash
   ./start-bridge.sh
   ```
2. **Configure your Session**:
   Open `http://localhost:3456` in your browser.
3. **Connect**:
   Add your remote host details, map your local folder to a remote path, and click **Activate Sync**.
4. **Work**:
   Use Gemini CLI in your local folder. All commands and file changes are automatically bridged.

## 🛠️ Architecture

- **Backend**: Node.js server for API and task orchestration.
- **Sync**: Mutagen for high-performance file synchronization.
- **Transport**: SSH (SSH2 Node.js client for setup, system SSH for command bridge).
- **UI**: Pure HTML/CSS/JS (Modern, Monochromatic, No-Slop design).

## 🔒 Security

- All configurations are stored locally in `~/.gemini-bridge/configs/`.
- Credentials are never logged or transmitted outside your local environment.
- SSH keys are managed with standard Unix permissions (600/700).

---

*Built for high-performance AI-assisted engineering.*
