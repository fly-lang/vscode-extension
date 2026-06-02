# Fly Programming Language — Visual Studio Code Extension

[![Build](https://github.com/fly-lang/vscode-extension/actions/workflows/publish-marketplace.yml/badge.svg)](https://github.com/fly-lang/vscode-extension/actions/workflows/publish-marketplace.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/flylang.org.fly-vscode-extension?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=flylang.org.fly-vscode-extension)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

<p align="center">
  <img src="fly_logo.png" width="128" alt="Fly Language logo" />
</p>

Full language support for the [Fly programming language](https://flylang.org) in Visual Studio Code.

## Features

- **Syntax highlighting** for `.fly` and `.fly.h` files
- **File icons** for dark and light themes
- **Auto-closing** brackets and parentheses
- **Block folding** and block comment support
- **Built-in snippets** covering declarations, control flow, memory management, and error handling
- **Live diagnostics** — compiler errors and warnings shown inline on save
- **Go to Definition**, **Hover**, and **Document Highlights** via the `fly-lsp` language server
- **fly.toml** manifest support — completions, hover docs, and validation for the `flyp` package manager

## Requirements

- Visual Studio Code `^1.82.0`
- [Fly compiler](https://github.com/fly-lang/fly) (`fly` and `fly-lsp` on `PATH`, or configured via settings)

## Installation

### From the Marketplace

Search for **Fly Programming Language** in the Extensions panel (`Ctrl+Shift+X`) or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=flylang.org.fly-vscode-extension).

### From a `.vsix` file

Download the latest `.vsix` from [GitHub Releases](https://github.com/fly-lang/vscode-extension/releases), then run:

```bash
code --install-extension vscode-fly-<version>.vsix
```

or drag and drop the file into the Extensions panel.

## Building from Source

```bash
git clone https://github.com/fly-lang/vscode-extension.git
cd vscode-extension
npm install
npm run compile
npm run package        # produces vscode-fly-<version>.vsix
```

To run in development mode, open the folder in VS Code and press **F5**. This compiles the extension and launches an Extension Development Host window.

## Settings

| Setting | Default | Description |
|---|---|---|
| `fly.compilerPath` | `fly` | Path to the Fly compiler binary |
| `fly.lspPath` | _(auto)_ | Path to `fly-lsp`; auto-discovered next to `fly.compilerPath` |
| `fly.enableLsp` | `true` | Enable the language server (hover, go-to-definition, highlights) |
| `fly.enableDiagnostics` | `true` | Run compiler on save and show inline diagnostics |
| `fly.buildArgs` | _(empty)_ | Extra flags appended to `fly` when running **Fly: Build File** |
| `fly.flypPath` | _(auto)_ | Path to `flyp`; auto-discovered next to `fly.compilerPath` |
| `fly.flypBuildArgs` | _(empty)_ | Extra flags appended to `flyp build` |

Use **Fly: Select Compiler** from the Command Palette to pick the compiler interactively — the extension auto-discovers all Fly installations and updates `fly.lspPath` automatically.

## Commands

Open the Command Palette with `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) and type **Fly** or **Flyp** to filter.

### Compiler commands — active on `.fly` files

| Command | Shortcut | Description |
|---|---|---|
| **Fly: Select Compiler** | — | Open a quick-pick to choose the active Fly installation. Auto-fills `fly.lspPath` from the same directory. |
| **Fly: Build File** | `Ctrl+Shift+B` | Compile the current `.fly` file. Errors appear in the **Problems** panel via the `$fly` problem matcher. |
| **Fly: Run File** | `Ctrl+F5` | Compile and immediately run the current `.fly` file in the integrated terminal. Uses `&&` — the program is not launched if compilation fails. |

The **Run** `$(run)` and **Build** `$(play)` buttons also appear in the editor title bar whenever a `.fly` file is active.

### Package manager commands — active on `fly.toml`

| Command | Shortcut | Description |
|---|---|---|
| **Flyp: Build** | `Ctrl+Shift+B` | Run `flyp build` in the project root. Errors appear in the **Problems** panel. |
| **Flyp: Run** | — | Run `flyp run` in the project root. |
| **Flyp: Test** | — | Run `flyp test` in the project root. |
| **Flyp: Add Dependency** | — | Interactive wizard: prompts for the package name, git URL, and ref type (`tag` / `branch` / `rev`), then runs `flyp add`. |
| **Flyp: Lock (Update fly.lock)** | — | Run `flyp lock` to re-resolve all dependencies and regenerate `fly.lock`. |

The **Run** `$(run-above)` and **Build** `$(play)` buttons appear in the editor title bar when `fly.toml` is open.

## Releasing

See [RELEASING.md](RELEASING.md) for the CI/CD workflow, how to publish a new version to the Marketplace, and the secrets that must be configured in the repository.

## Links

- [Fly language website](https://flylang.org)
- [Fly compiler repository](https://github.com/fly-lang/fly)
- [Report an issue](https://github.com/fly-lang/vscode-extension/issues)

## License

[Apache-2.0](LICENSE)
