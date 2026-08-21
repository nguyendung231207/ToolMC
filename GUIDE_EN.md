# 🎮 ToolMC v1 - User Guide

Welcome to **ToolMC**, an open-source, lightweight, high-performance Minecraft botting tool with a modern, easy-to-use interface.

---

## 🌟 Introduction & Key Features

ToolMC is designed to optimize your botting experience:
*   **Lightweight & Smooth:** Optimized interface, low resource consumption (RAM/CPU) compared to other tools.
*   **Modern UI:** Shadcn-inspired design, Dark Mode support, clean and intuitive.
*   **Easy to Use:** User-friendly layout suitable for beginners.
*   **Versatile:** Supports versions from 1.8 to 1.21.
*   **Powerful Features:** Auto-reconnect, Anti-AFK, Kill Aura, Inventory Management, Chat Spam, and flexible Scripting Engine.

---

## 📖 User Guide

### 1. Basic Usage

1.  **Get Key & Login:**
    *   Open the tool; you will see the authentication overlay.
    *   Click **"Get Key"** to get a free key link (Key is valid for 24h).
    *   Complete the Captcha/Ads to receive your Key.
    *   Paste the Key into the input box and click **"Login"**.

2.  **Add Bot & Connect:**
    *   On the main dashboard (General Settings->Server Manager), click **"Add New Server"**.
    *   Enter **Accounts list** in the format: `username:password` or `username|password` (one account per line).
    *   Select **Version** (Minecraft version of the server).
    *   Click **"Start"** to join the server.

3.  **Controls:**
    *   Once connected, you can chat, move, or use quick action buttons like "Jump", "Drop", "Respawn".

### 2. Using Proxies & Multiple Accounts

To run multiple bots simultaneously without IP bans, use Proxies.

1.  **Proxy Manager:**
    *   Switch to the **"Proxy Manager"** tab.
    *   Enter **"Proxy List"** to add your proxies (SOCKS4, SOCKS5, HTTP).
    *   Format: `IP:Port` or `IP:Port:User:Pass`.
    *   Adjust **"Proxy Distribution"** to choose how many bots per proxy.

2.  **Running Multiple Bots:**
    *   Simply add multiple accounts to the **"Accounts list"** and click **"Start"**.

### 3. Botting & Scripting Guide

ToolMC supports a powerful Scripting system to automate actions (Auto Login, Auto Farm, etc.).

*   **Auto Commands:** Executed immediately when the bot joins the server (e.g., login command, will also auto-run on reconnect).
*   **Scripting Tab:** Run complex scenarios with a sequence of actions.

#### Supported Variables
You can use the following variables in your commands, the tool will automatically replace them:
*   `{player}`: The bot's username.
*   `{random}`: A random string (useful to bypass spam filters).
*   `{password}`: The bot's password (as defined in the Accounts List).

#### Detailed Command List

**1. Chat & Server Commands**
Send a message or command to the server.
*   Syntax: `chat <message>`
*   Example:
    ```text
    chat Hello server, I am {player}!
    chat /login {password}
    ```

**2. Delay**
Wait for a specific amount of time (in milliseconds) before executing the next command.
*   Syntax: `delay <ms>` (1000ms = 1 second)
*   Example:
    ```text
    chat /register {password} {password}
    delay 2000
    chat /login {password}
    ```

**3. Movement**
Control bot movement.
*   `startmove <forward|back|left|right|jump|sneak|sprint>`: Start moving (forward/back/left/right/jump/sneak/sprint).
*   `stopmove <forward|back|left|right|jump|sneak|sprint>`: Stop moving.
*   `resetmove`: Stop all movement.

**4. Inventory & Interaction**
*   `sethotbar <slot 0-8>`: Select a slot on the hotbar.
*   `useheld`: Use/Interact with the item held in hand (Right click).
*   `winclick <slot> <0-Left Click | 1-Right Click>`: Click a specific slot in a window (Chest/Inventory/Menu).
*   `drop <slot>`: Drop item in the specified slot.
*   `dropall`: Drop everything.
*   `closewindow`: Close the current window (Chest/Menu).

**5. Other Commands**
*   `look <yaw>`: Look in a direction (yaw angle).
*   `afkon` / `afkoff`: Enable/Disable Anti-AFK mode (Small random movements to avoid being kicked).
*   `disconnect`: Disconnect from the server.
*   `reconnect`: Reconnect to the server.
*   `getplayers`: Get list of other online players in the server.

#### 📝 Script Example: Server KingMC.VN (Updated 2/1/2026)

Below is a sample script to auto-login, navigate to the AFK area, and go AFK:

**Scenario:** Login -> Select Menu Item -> Click Menu -> Warp to AFK -> Chat confirmation.

Copy this section into **Script** or **Auto Commands**:

```text
chat /dn {password}
delay 3000
sethotbar 4
delay 1000
useheld
delay 2000
winclick 24 1
delay 5000
chat /afk
```

**Explanation:**
1.  `chat /dn {password}`: Enter login command with bot's password.
2.  `delay 3000`: Wait 3 seconds for server processing.
3.  `sethotbar 4`: Switch hand to slot 5 (Slot 4 - 0-indexed).
4.  `useheld`: Right-click (use menu item).
5.  `delay 2000`: Wait 2 seconds for menu to open.
6.  `winclick 24 1`: Right-click on slot 24 in the Menu (AFK warp location).
7.  `delay 5000`: Wait 5 seconds for teleportation.
8.  `chat /afk`: Chat /afk command to start AFK status.

---

## 🎥 Video Tutorial

Watch detailed installation and usage guide here:
[**Watch Tutorial Video on YouTube**](https://www.youtube.com/watch?v=khqzh3EmnAs)

---
*Happy Botting!*
