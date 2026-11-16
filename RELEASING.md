# Releasing the Fly VS Code Extension

Releases are **automatic**: merging a pull request that bumps `version` in `package.json`
into `main` builds, tags, publishes a GitHub Release and publishes to the Marketplace.
`main` is a locked branch — all changes arrive through pull requests.

---

## Workflow overview

The pipeline is defined in [`.github/workflows/publish-marketplace.yml`](.github/workflows/publish-marketplace.yml).

| Trigger | Jobs executed |
|---|---|
| **Pull request** to `main` | `build` only — compile, unit tests, package. Never publishes. |
| **Push to `main`** (a merged PR) | `build`, then `release` **only if** `v<version>` has no tag yet |
| **Manual dispatch** (Actions tab) | same as a push to `main` — use it to re-run after a failed publish |

### `build` job

1. Checks out the repository, installs dependencies (`npm install`), compiles (`npm run compile`).
2. Runs the unit tests (`node tests/unit.js`).
3. Reads the version from `package.json` and checks with `git ls-remote` whether the tag
   `v<version>` already exists (`tag_exists` output).
4. Packages the extension with `vsce package`, producing `vscode-fly-<version>.vsix`, and uploads it
   as a workflow artifact.

### `release` job

Runs only on `main`, never on a pull request, and only when `tag_exists` is `false`:

1. Creates and pushes the tag `v<version>`.
2. Creates a GitHub Release with the `.vsix` attached and auto-generated release notes.
3. Publishes to the VS Code Marketplace with `vsce publish --oidc` — see
   [Marketplace authentication](#marketplace-authentication).

A merge that does **not** change the version finds the tag already there and skips the
release; the run stays green.

---

## How to publish a new release

1. In a pull request, bump `version` in `package.json` (e.g. `0.7.0` → `0.7.1`).
2. Merge the pull request into `main`.
3. Watch **Actions** → **VSCode Extension**: the `release` job runs on the merge commit.

> If you forget the bump, nothing is published — bump in a follow-up PR.
> If the publish step fails after the tag was created (e.g. OIDC policy problem), the tag
> now exists, so a re-run would skip the release: delete the tag and the GitHub Release,
> then re-run the workflow from **Run workflow**.

---

## Marketplace authentication

Publishing uses **OIDC trusted publishing** only. The old Personal Access Token route is
gone: Azure DevOps retires global PATs on **2026-12-01**.

### `oidc` — trusted publishing (no secret at all)

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

  The policy must exist **before** the first automatic release, otherwise the publish step
  fails (after the tag and GitHub Release were already created — see the note above).
  If a ruleset restricts tag creation, allow `github-actions[bot]` to create `v*` tags.

> `--oidc` does **not** fall back to a PAT. If the token exchange fails the publish step fails —
> which is the intended behaviour, not a bug to work around.

### `GITHUB_TOKEN`

Used to create the tag and the GitHub Release. **Provided automatically by GitHub Actions** — nothing to configure.

The `release` job requests `contents: write` permission so it can push the tag and create the release.
