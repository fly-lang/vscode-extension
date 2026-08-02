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
5. Publishes to the VS Code Marketplace via `vsce publish` — see [Marketplace authentication](#marketplace-authentication).

---

## How to publish a new release

1. Bump the version in `package.json` (e.g. `0.2.0` → `0.3.0`) and push the commit to `main`.
2. Open the repository on GitHub → **Actions** → **VSCode Extension** → **Run workflow**.
3. Pick the **Marketplace authentication method**: `oidc` (default) or `pat`. See below.
4. **Run workflow** (confirm). The workflow reads the version from `package.json`, checks that
   the tag does not already exist, creates the tag, builds, and publishes.

> **If the tag already exists** the release job fails immediately with an explicit error message. Bump the version in `package.json` and re-run.

---

## Marketplace authentication

Azure DevOps is retiring **global** Personal Access Tokens — the "All accessible organizations"
kind, which is exactly what Marketplace publishing has always required. **They stop working on
2026-12-01.** There are two supported ways forward; the workflow offers both as a dispatch input.

### `oidc` — trusted publishing (preferred, no secret at all)

`vsce publish --oidc` asks GitHub Actions for an OIDC id-token scoped to the
`marketplace.visualstudio.com` audience and exchanges it for a short-lived Marketplace
credential. Nothing long-lived is stored, so there is no token to rotate and no secret to leak.

**Requirements** (all already in place in the workflow):

- `@vscode/vsce` **≥ 3.9.x** — the flag does not exist in 2.x.
- The `release` job declares `permissions: id-token: write`.
- A **trusted publishing policy** on the `fly-lang` publisher at
  [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage), naming:
  - owner/repository — `fly-lang/vscode-extension`
  - workflow file — `publish-marketplace.yml`

  If the publisher management page does not offer trusted publishing yet, use `pat` below and
  switch over once it appears.

> `--oidc` does **not** fall back to a PAT. If the token exchange fails the publish step fails —
> which is the intended behaviour, not a bug to work around.

### `pat` — organization-scoped Personal Access Token (fallback, expires 2026-12-01)

Only differs from the old instructions in the **Organization** field: pick your specific
organization, *not* "All accessible organizations".

1. Sign in to [dev.azure.com](https://dev.azure.com) with the Microsoft account linked to the
   [Marketplace publisher](https://marketplace.visualstudio.com/manage).
2. Avatar (top-right) → **Personal access tokens → New Token**.
3. Fill in:
   - **Name**: `VSCE_PAT` (or any descriptive name)
   - **Organization**: **your organization** — an org-scoped token. Global tokens are retired.
   - **Expiration**: max 1 year; set a calendar reminder to rotate
   - **Scopes**: **Custom defined** → *Marketplace* → **Manage**
4. **Create**, then copy the token immediately — it is shown only once.
5. Add it under **GitHub → repository → Settings → Secrets and variables → Actions →
   New repository secret**, named exactly **`VSCE_PAT`**.

> If publishing rejects an org-scoped token, the publisher is not associated with that
> organization. Open the org once in the Azure DevOps portal with the publisher account, then
> re-issue the token.

### `GITHUB_TOKEN`

Used to create the tag and the GitHub Release. **Provided automatically by GitHub Actions** — nothing to configure.

The `release` job requests `contents: write` permission so it can push the tag and create the release.
