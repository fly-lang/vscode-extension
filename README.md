# Fly Language Support for Visual Studio Code

[![Build](https://github.com/fly-lang/vscode-extension/actions/workflows/vscode-extension.yml/badge.svg)](https://github.com/fly-lang/vscode-extension/actions/workflows/vscode-extension.yml)
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
- **built-in snippets** covering declarations, control flow, memory management, and error handling

## Requirements

- Visual Studio Code `^1.80.0`

## Installation

### From the Marketplace

Search for **Fly Language Support** in the Extensions panel (`Ctrl+Shift+X`) or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=flylang.org.fly-vscode-extension).

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
npm ci
npm run compile
npm run package        # produces vscode-fly-<version>.vsix
```

## GitHub Actions — CI/CD setup

The workflow (`.github/workflows/vscode-extension.yml`) runs automatically:

| Trigger | Jobs executed |
|---------|--------------|
| Push to `main` | `build` — compiles and packages the `.vsix`, uploads it as a workflow artefact |
| Push of a `v*` tag | `build` + `release` (GitHub Release) + `publish` (VS Code Marketplace) |

### Secrets to configure

Go to **GitHub → repository → Settings → Secrets and variables → Actions → New repository secret**.

#### `VSCE_PAT` — VS Code Marketplace Personal Access Token

Required by the `publish` job. Without it the tag pipeline will fail at the Marketplace step.

How to create it:

1. Sign in to [dev.azure.com](https://dev.azure.com) with the Microsoft account linked to your [VS Code Marketplace publisher](https://marketplace.visualstudio.com/manage).
2. Click your avatar (top-right) → **Personal access tokens → New Token**.
3. Set:
   - **Name**: e.g. `VSCE_PAT`
   - **Organization**: `All accessible organizations`
   - **Expiration**: choose a suitable duration (max 1 year)
   - **Scopes**: select **Custom defined** → under *Marketplace* check **Manage**
4. Click **Create** and copy the token immediately (shown only once).
5. Add it to GitHub as a secret named exactly **`VSCE_PAT`**.

#### `GITHUB_TOKEN`

Used by the `release` job to create GitHub Releases and attach the `.vsix`. This token is **provided automatically** by GitHub Actions — nothing to configure.

### Publishing a new release

```bash
# bump version in package.json, commit, then:
git tag v0.2.0
git push origin v0.2.0
```

The tag push triggers the full pipeline: build → GitHub Release → Marketplace publish.

## Links

- [Fly language website](https://flylang.org)
- [Fly compiler repository](https://github.com/fly-lang/fly)
- [Report an issue](https://github.com/fly-lang/vscode-extension/issues)

## License

[Apache-2.0](LICENSE)
