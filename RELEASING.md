# Releasing the Fly VS Code Extension

This document covers the CI/CD pipeline, how to cut a release, and the repository secrets that must be configured.

---

## Workflow overview

The pipeline is defined in [`.github/workflows/publish-marketplace.yml`](.github/workflows/publish-marketplace.yml).

| Trigger | Jobs executed |
|---|---|
| **Manual dispatch** (Actions tab) | `build` → `release` — packages the `.vsix`, creates tag, GitHub Release, and publishes to Marketplace |

The release is **never automatic**. It only runs when you explicitly click **Run workflow** in the Actions tab.

### `build` job

Runs on every manual dispatch:

1. Checks out the repository.
2. Installs dependencies with `npm install`.
3. Compiles TypeScript with `npm run compile`.
4. Reads the version from `package.json`.
5. Packages the extension with `vsce package`, producing `vscode-fly-<version>.vsix`.
6. Uploads the `.vsix` as a workflow artifact.

### `release` job

Runs only when the workflow is dispatched from `main`:

1. Verifies that the git tag `v<version>` does not already exist — fails immediately if it does.
2. Creates and pushes the tag.
3. Downloads the `.vsix` artifact from the `build` job.
4. Creates a GitHub Release with the `.vsix` attached.
5. Publishes to the VS Code Marketplace via `vsce publish`.

---

## How to publish a new release

1. Bump the version in `package.json` (e.g. `0.2.0` → `0.3.0`) and push the commit to `main`.
2. Open the repository on GitHub → **Actions** → **VSCode Extension** → **Run workflow** → **Run workflow** (confirm).
3. The workflow reads the version from `package.json`, checks that the tag does not already exist, creates the tag, builds, and publishes.

> **If the tag already exists** the release job fails immediately with an explicit error message. Bump the version in `package.json` and re-run.

---

## Repository secrets

Configure these under **GitHub → repository → Settings → Secrets and variables → Actions → New repository secret**.

### `VSCE_PAT` — VS Code Marketplace Personal Access Token

Required by the `release` job to publish to the Marketplace.

**How to create it:**

1. Sign in to [dev.azure.com](https://dev.azure.com) with the Microsoft account linked to your [VS Code Marketplace publisher](https://marketplace.visualstudio.com/manage).
2. Click your avatar (top-right) → **Personal access tokens → New Token**.
3. Fill in the fields:
   - **Name**: `VSCE_PAT` (or any descriptive name)
   - **Organization**: `All accessible organizations`
   - **Expiration**: choose a duration (maximum 1 year; set a calendar reminder to rotate it)
   - **Scopes**: select **Custom defined** → under *Marketplace* check **Manage**
4. Click **Create** and copy the token immediately — it is shown only once.
5. Add it to the repository as a secret named exactly **`VSCE_PAT`**.

### `GITHUB_TOKEN`

Used to create the tag and the GitHub Release. **Provided automatically by GitHub Actions** — nothing to configure.

The `release` job requests `contents: write` permission so it can push the tag and create the release.
