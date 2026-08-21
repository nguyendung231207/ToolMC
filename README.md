<div align="center">

# 🎮 ToolMC - Modern Minecraft Botting Suite & Management Portal

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-28-blue.svg)](https://electronjs.org)
[![Mineflayer](https://img.shields.io/badge/Mineflayer-4.37-orange.svg)](https://github.com/PrismarineJS/mineflayer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**ToolMC** is a lightweight, high-performance Minecraft botting tool built with **Electron + Node.js + Mineflayer**, featuring a modern desktop interface inspired by **Shadcn UI (Dark & Light Mode)** and an integrated serverless web management backend (**Vercel Serverless + Redis**).

[Features](#-key-features) • [Architecture](#-project-architecture) • [Getting Started](#-getting-started) • [Scripting Engine](#-scripting-engine) • [Web Management](#-web-backend-deployment) • [Disclaimer](#-disclaimer--minecraft-eula-notice)

</div>

---

## 🌟 Key Features

* **🚀 Ultra Lightweight & High Performance:** Minimal RAM/CPU consumption optimized for running multiple bot sessions simultaneously without system throttling.
* **🎨 Modern & Intuitive UI:** Sleek, responsive user interface inspired by modern design systems (Shadcn UI), supporting Dark/Light themes, smooth transitions, and live logs.
* **🌐 Multi-Version Support:** Native compatibility across Minecraft versions from **`1.8` up to `1.21.x`**.
* **🛡️ Smart Proxy Manager:** Built-in support for **SOCKS4, SOCKS5, and HTTP Proxies**, including auto-rotation, latency checking, and per-bot proxy allocation to avoid IP rate-limiting and bans.
* **🤖 Advanced Scripting Engine:** Automate complex in-game workflows (auto-login, menu/chest GUI interactions via `winclick`, pathfinding, chat routines, hotbar management, and item usage).
* **🧩 In-Game Map Captcha Solver:** Automatically intercepts, parses, and resolves map-based captcha challenges sent by server security plugins.
* **🔐 Web Licensing & HWID Binding:** Integrated authentication system using **JWT + RSA digital signatures** and hardware-locked (HWID) device binding with Redis rate limiting.
* **📡 Bot Viewers & Radar:** Built-in live radar, web inventory viewer, and Prismarine 3D world viewer.

---

## 📂 Project Architecture

The project is cleanly split into two components:

```
├── src/                         # 🖥️ DESKTOP CLIENT (ELECTRON TOOL)
│   ├── main/                    # Main Process: Mineflayer core, proxy manager, IPC, auth
│   │   ├── js/auth/             # Key verification & RSA signature validation
│   │   ├── js/bot/              # Bot state manager, event handlers, scripting, map captcha
│   │   ├── js/misc/             # Anti-AFK engine and utilities
│   │   └── js/proxy/            # Proxy tester, scraping & distributor
│   ├── preload/                 # Secure Electron IPC bridge
│   └── renderer/                # Desktop UI (HTML5, Vanilla CSS, JavaScript)
├── web/                         # 🌐 MANAGEMENT PORTAL (VERCEL SERVERLESS)
│   ├── api/                     # Serverless endpoints (verify, get-link, view-key, admin)
│   ├── admin.html               # Admin Dashboard (Analytics, Key Generator, IP Blocker)
│   ├── vercel.json              # Route rewrites & security headers configuration
│   └── .env.example             # Backend environment variable template
├── scripts/                     # Build and packaging automation scripts
└── package.json                 # Tool dependencies & build configurations
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: `v18.x` or `v20.x` or higher
* **npm**, **yarn**, or **pnpm**

### 1. Desktop Client Setup

```bash
# 1. Clone the repository
git clone https://github.com/nguyendung231207/ToolMC.git
cd toolmc

# 2. Install dependencies
npm install

# 3. Run in development mode
npm run dev

# 4. Build standalone binaries for production
npm run build:win      # Builds Windows portable / NSIS installer
npm run build:linux    # Builds Linux AppImage / Deb / Snap
npm run build:mac      # Builds macOS DMG package
```

---

## 🌐 Web Backend Deployment (`web/`)

The `web/` directory contains a standalone serverless backend ready for deployment on **Vercel**:

1. Navigate to the web folder:
   ```bash
   cd web
   npm install
   ```
2. Create your environment configuration file:
   ```bash
   cp .env.example .env
   ```
3. Configure the required environment variables in `.env`:
   * `JWT_SECRET`: Secret key used for signing session and access tokens.
   * `VUOTLINK_API_KEY`: API key for link shortening/monetization (optional).
   * `REDIS_URL`: Redis connection string (e.g., free [Upstash Redis](https://upstash.com/)) for HWID binding and rate limiting.
   * `RSA_PRIVATE_KEY`: RSA 2048-bit Private Key for signing verification responses.
4. Deploy to Vercel:
   ```bash
   npx vercel
   ```

---

## 📝 Scripting Engine

ToolMC includes an intuitive command-based scripting engine to automate bot actions upon server join or during runtime:

### Supported Dynamic Variables
* `{player}`: Replaced by the bot's in-game username.
* `{password}`: Replaced by the bot's configured account password.
* `{random}`: Generates a random alphanumeric string (useful for bypassing chat anti-spam filters).

### Command Reference

| Command | Syntax | Description |
| :--- | :--- | :--- |
| `chat` | `chat <message>` | Sends a chat message or server command (`/login {password}`) |
| `delay` | `delay <milliseconds>` | Pauses script execution (1000ms = 1s) |
| `sethotbar` | `sethotbar <0-8>` | Selects an active hotbar slot |
| `useheld` | `useheld` | Uses or right-clicks the item currently held in hand |
| `winclick` | `winclick <slot> <button>` | Clicks a specific slot inside an open inventory / GUI window |
| `startmove` | `startmove <forward\|jump\|...>` | Starts continuous movement in a given direction |
| `stopmove` | `stopmove <forward\|jump\|...>` | Stops continuous movement in a given direction |
| `resetmove` | `resetmove` | Immediately stops all active movement states |
| `look` | `look <yaw> <pitch>` | Adjusts bot looking direction and angle |
| `pathfind` | `pathfind <x> <y> <z>` | Navigates the bot to targeted 3D coordinates using A* pathfinding |
| `afkon` / `afkoff` | `afkon` | Enables or disables the autonomous Anti-AFK behavior |
| `disconnect` | `disconnect` | Disconnects the bot from the current server |
| `reconnect` | `reconnect` | Disconnects and reconnects the bot after a brief delay |

### Example Script: Auto-Login & AFK Zone Warp
```text
chat /login {password}
delay 3000
sethotbar 4
delay 1000
useheld
delay 2000
winclick 24 1
delay 5000
chat /afk
```

---

## 🤝 Contributing

Contributions, feature requests, and bug reports are welcome!  
Please read the [CONTRIBUTING.md](CONTRIBUTING.md) guide before submitting issues or pull requests.

---

## ⚖️ Disclaimer & Minecraft EULA Notice

* **Not an Official Minecraft Product:** This project is an independent third-party development and is **not affiliated with, endorsed by, or associated with Mojang Studios, Microsoft Corporation, or any of their subsidiaries**.
* **Educational & Research Purpose:** This tool is developed strictly for **educational purposes, network protocol research, and server load/stress testing (benchmarking)**.
* **User Responsibility:** Users are solely responsible for ensuring their usage complies with Minecraft's End User License Agreement (EULA), Terms of Service, and the individual rules of any server they connect to. The authors and contributors assume no liability for misuse, server bans, or damages.

---

## 📄 License

This project is open-source software licensed under the **[MIT License](LICENSE)**.
