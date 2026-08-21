# 🤝 Contributing to ToolMC

Thank you for your interest in contributing to **ToolMC**! We welcome all developers, bug reporters, and enthusiasts who want to help improve this project.

Please take a moment to review this guide before submitting issues or pull requests.

---

## 📋 Table of Contents
1. [Code of Conduct](#-code-of-conduct)
2. [How Can I Contribute?](#-how-can-i-contribute)
   - [Reporting Bugs](#reporting-bugs)
   - [Suggesting Enhancements](#suggesting-enhancements)
   - [Submitting Pull Requests](#submitting-pull-requests)
3. [Development Workflow](#-development-workflow)
4. [Coding Standards](#-coding-standards)

---

## 📜 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone. Please be respectful, constructive, and open to feedback when participating in discussions and code reviews.

---

## 🛠️ How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check existing [Issues](../../issues) to avoid duplicates. When opening a new issue, include as much relevant detail as possible:

* **Clear Title:** A concise summary of the issue.
* **Environment:**
  - OS & Version (e.g., Windows 11, Ubuntu 22.04, macOS Sonoma)
  - Node.js & npm version (`node -v`, `npm -v`)
  - Target Minecraft Server Version (e.g., 1.20.4, 1.8.9)
* **Steps to Reproduce:** Step-by-step instructions on how to trigger the bug.
* **Expected vs. Actual Behavior:** What you expected to happen versus what actually occurred.
* **Logs & Screenshots:** Console outputs, stack traces, or screenshots (please ensure all private credentials, passwords, and tokens are redacted).

### Suggesting Enhancements

Feature requests are always encouraged! Please open an Issue with the `enhancement` label and describe:
* The problem your enhancement solves.
* A clear description of the proposed feature or workflow.
* Any alternative approaches or workarounds considered.

### Submitting Pull Requests

1. **Fork the Repository:** Click the **Fork** button on GitHub to create a copy under your account.
2. **Clone your fork:**
   ```bash
   git clone https://github.com/<your-username>/toolmc.git
   cd toolmc
   ```
3. **Create a topic branch:**
   ```bash
   git checkout -b feature/awesome-feature
   # or for bug fixes:
   git checkout -b fix/issue-description
   ```
4. **Install dependencies and test changes:**
   ```bash
   npm install
   npm run dev
   ```
5. **Commit your changes:** Follow conventional commit messages:
   ```bash
   git commit -m "feat: add support for custom scoreboard parsers"
   # or
   git commit -m "fix: resolve memory leak in bot disconnect handler"
   ```
6. **Push to your fork:**
   ```bash
   git push origin feature/awesome-feature
   ```
7. **Open a Pull Request:** Navigate to the original repository on GitHub and open a Pull Request from your branch to `main`. Provide a descriptive overview of your changes.

---

## 💻 Development Workflow

### Project Structure Overview
* `src/main/`: Electron main process controlling Mineflayer instances, network sockets, IPC communication, and bot lifecycle.
* `src/preload/`: Secure IPC bridge between Electron and UI.
* `src/renderer/`: User interface components and dashboard styles.
* `web/`: Serverless authentication backend and admin web portal.

### Security Reminders for Contributors
* **Never commit secrets:** Do not push `.env` files, private keys, API tokens, or personal passwords.
* **Keep dependencies updated:** Avoid introducing insecure or deprecated packages.

---

## 📐 Coding Standards

* **Formatting:** Format your code using Prettier (`npm run format`).
* **Linting:** Ensure all files pass ESLint rules (`npm run lint`).
* **Comments & Documentation:** Document non-obvious logic, IPC channels, or complex packet handlers.

---

*Thank you for helping make ToolMC better for the entire Minecraft community!*
