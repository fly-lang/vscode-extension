# Fly Programming Language — Visual Studio Code Extension

[![Build](https://github.com/fly-lang/vscode-extension/actions/workflows/publish-marketplace.yml/badge.svg)](https://github.com/fly-lang/vscode-extension/actions/workflows/publish-marketplace.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/flylang.org.fly-vscode-extension?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=flylang.org.fly-vscode-extension)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

<p align="center">
  <img src="fly_logo.png" width="128" alt="Fly Language logo" />
</p>

Full language support for the [Fly programming language](https://flylang.org) in Visual Studio Code.

## Features

### Editor
- **Syntax highlighting** for `.fly` and `.fly.h` files
- **Semantic highlighting** — functions, classes, variables, parameters, and properties are coloured by their semantic role, not just by regex pattern
- **File icons** for dark and light themes
- **Auto-closing** brackets and parentheses
- **Smart folding** — AST-aware folding for function and class bodies, plus manual `// #region` / `// #endregion` markers
- **Built-in snippets** — 40+ snippets covering namespaces, functions, classes, interfaces, control flow, memory management, error handling, and common patterns (`field`, `arr`, `getset`, `list`, `iface`, …)
- **Onboarding walkthrough** — **Help → Get Started → "Get Started with Fly"** guides you through compiler setup, first program, build/run, and flyp project management

### Language intelligence (via `fly-lsp`)
- **Hover** — documentation for keywords, built-in types, and user-defined symbols (functions, classes, variables)
- **Completions** — context-aware completions from the current scope and all compiled modules
- **Go to Definition** (`F12`) — jump to the declaration of any symbol
- **Go to Type Definition** — from a variable, jump to its type's class declaration
- **Go to Implementation** — from an interface, list all implementing classes
- **Find References** (`Shift+F12`) — list all usages across the project
- **Document Highlights** — highlight all occurrences of the symbol under the cursor in the current file
- **Signature Help** — parameter hints popup when typing a function call (`(` / `,`)
- **Inlay Hints** — parameter names shown inline at each call site
- **Workspace Symbols** (`Ctrl+T`) — fuzzy-search functions and classes across all compiled files
- **Document Symbols** — outline panel and breadcrumbs for the current file
- **Selection ranges** (`Alt+Shift+→`) — expand selection from token → expression → statement → block → function → class

### Diagnostics
- **Live diagnostics** — compiler errors and warnings shown inline on save via the `$fly` problem matcher
- **Workspace diagnostics** — all `.fly` files in the project are checked at startup, not only open ones; new files are checked automatically

### Build, run & debug
- **Build** (`Ctrl+Shift+B`) — compile the current file; errors appear in the **Problems** panel
- **Run** (`Ctrl+F5`) — compile and execute in the integrated terminal
- **Debug** (`F5`) — compile with DWARF symbols and launch under LLDB (requires [codelldb](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb))
- Breakpoints in `.fly` files are respected by the debugger

### Package manager (`flyp`)
- **fly.toml** manifest support — context-aware completions, hover docs, and inline validation
- **flyp build / run / test / add / lock** commands available from the Command Palette and the editor title bar

---

## Requirements

- Visual Studio Code `^1.82.0`
- [Fly compiler](https://github.com/fly-lang/fly) (`fly` and `fly-lsp` on `PATH`, or configured via settings)
- [codelldb](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb) — required for **Fly: Debug File** (`F5`)

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
| `fly.enableLsp` | `true` | Enable the language server (hover, go-to-definition, references, inlay hints, semantic tokens, workspace symbols, …) |
| `fly.enableDiagnostics` | `true` | Run compiler on save and show inline diagnostics |
| `fly.enableWorkspaceDiagnostics` | `true` | Scan all `.fly` files in the workspace at startup |
| `fly.buildArgs` | _(empty)_ | Extra flags appended to `fly` when running **Fly: Build File** |
| `fly.debugBuildArgs` | `--debug` | Compiler flags used by **Fly: Debug File** |
| `fly.flypPath` | _(auto)_ | Path to `flyp`; auto-discovered next to `fly.compilerPath` |
| `fly.flypBuildArgs` | _(empty)_ | Extra flags appended to `flyp build` |

Use **Fly: Select Compiler** from the Command Palette to pick the compiler interactively — the extension auto-discovers all Fly installations and updates `fly.lspPath` automatically.

The status bar shows two items when a `.fly` file is active: `$(tools) fly X.Y.Z` (compiler version, click to change) and `$(check) LSP` / `$(error) LSP` (language server connection state).

## Commands

Open the Command Palette with `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) and type **Fly** or **Flyp** to filter.

### Compiler commands — active on `.fly` files

| Command | Shortcut | Description |
|---|---|---|
| **Fly: Select Compiler** | — | Open a quick-pick to choose the active Fly installation. Auto-fills `fly.lspPath` from the same directory. |
| **Fly: Build File** | `Ctrl+Shift+B` | Compile the current `.fly` file. Errors appear in the **Problems** panel via the `$fly` problem matcher. |
| **Fly: Run File** | `Ctrl+F5` | Compile and immediately run the current `.fly` file in the integrated terminal. Uses `&&` — the program is not launched if compilation fails. |
| **Fly: Debug File** | `F5` | Compile with DWARF debug symbols and launch the program under LLDB. Requires [codelldb](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb). Breakpoints in `.fly` files are respected. |

The **Debug** `$(debug-alt)`, **Run** `$(run)`, and **Build** `$(play)` buttons appear in the editor title bar whenever a `.fly` file is active.

### Package manager commands — active on `fly.toml`

| Command | Shortcut | Description |
|---|---|---|
| **Flyp: Build** | `Ctrl+Shift+B` | Run `flyp build` in the project root. Errors appear in the **Problems** panel. |
| **Flyp: Run** | — | Run `flyp run` in the project root. |
| **Flyp: Test** | — | Run `flyp test` in the project root. |
| **Flyp: Add Dependency** | — | Interactive wizard: prompts for the package name, git URL, and ref type (`tag` / `branch` / `rev`), then runs `flyp add`. |
| **Flyp: Lock (Update fly.lock)** | — | Run `flyp lock` to re-resolve all dependencies and regenerate `fly.lock`. |

The **Run** `$(run-above)` and **Build** `$(play)` buttons appear in the editor title bar when `fly.toml` is open.

## Keyboard Shortcuts

| Shortcut | Action | Context |
|---|---|---|
| `Ctrl+Shift+B` / `Cmd+Shift+B` | **Fly: Build File** | `.fly` file active |
| `Ctrl+F5` / `Cmd+F5` | **Fly: Run File** | `.fly` file active |
| `F5` | **Fly: Debug File** | `.fly` file active, not already in debug |
| `Ctrl+Shift+B` / `Cmd+Shift+B` | **Flyp: Build** | `fly.toml` active |
| `F12` | Go to Definition | `.fly` file |
| `Shift+F12` | Find References | `.fly` file |
| `Alt+Shift+→` | Expand Selection | `.fly` file |
| `Ctrl+T` / `Cmd+T` | Workspace Symbols | anywhere |

## Troubleshooting

### "fly-lsp not found" warning in the status bar

The extension cannot find the `fly-lsp` binary next to the Fly compiler. Options:
1. Ensure `fly-lsp` is in the same directory as `fly` and both are on your `PATH`.
2. Set `fly.lspPath` explicitly in VS Code settings to the full path of the `fly-lsp` binary.
3. Run **Fly: Select Compiler** — the extension will auto-fill `fly.lspPath` if `fly-lsp` is a sibling binary.

### Compiler not found / status bar shows `$(warning) fly (not found)`

`fly` is not on `PATH` or the configured `fly.compilerPath` is wrong. Run **Fly: Select Compiler** to search installed Fly versions automatically.

### Debug (`F5`) does nothing or shows "extension not found"

The [codelldb](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb) extension is required for debugging. Install it from the VS Code Marketplace and reload VS Code.

### Diagnostics appear only for open files

Enable `fly.enableWorkspaceDiagnostics` (default: `true`) to scan the entire workspace at startup.

### The LSP status bar shows `$(error) LSP` or `$(circle-slash) LSP`

- `$(circle-slash)`: LSP is disabled — set `fly.enableLsp` to `true`.
- `$(error)`: the server crashed or stopped — check the **Fly Language Server** output channel (View → Output → Fly Language Server) for the error.

## Contributing

### Running the extension in development mode

```bash
git clone https://github.com/fly-lang/vscode-extension.git
cd vscode-extension
npm install
```

Open the folder in VS Code and press **F5**. This compiles the TypeScript and launches an **Extension Development Host** window with the extension loaded from source. Any change to the TypeScript source requires re-running `npm run compile` (or using `npm run watch` for incremental rebuilds).

### Building the `fly-lsp` language server

The language server is part of the [Fly compiler repository](https://github.com/fly-lang/fly). To build it:

```bash
cmake -B build -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build --target fly-lsp
```

Then set `fly.lspPath` in your VS Code settings to `<build-dir>/bin/fly-lsp`.

### Reporting issues

Please open an issue at [github.com/fly-lang/vscode-extension/issues](https://github.com/fly-lang/vscode-extension/issues) with:
- VS Code version
- Extension version (shown in the Extensions panel)
- Contents of the **Fly Language Server** output channel
- Steps to reproduce

## Releasing

See [RELEASING.md](RELEASING.md) for the CI/CD workflow, how to publish a new version to the Marketplace, and the secrets that must be configured in the repository.

## Links

- [Fly language website](https://flylang.org)
- [Fly compiler repository](https://github.com/fly-lang/fly)
- [Report an issue](https://github.com/fly-lang/vscode-extension/issues)

## License

[Apache-2.0](LICENSE)
