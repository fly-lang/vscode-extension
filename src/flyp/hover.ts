import * as vscode from 'vscode';

interface KeyDoc { detail: string; doc: string; }

const DOCS: Record<string, KeyDoc> = {
    // [package]
    name: {
        detail: '(string) name',
        doc:    'In `[package]`: the package name (REQUIRED). Must match `[a-z0-9_-]+`.\n\nIn `[targets]` inline tables: **optional** override for the output filename. If omitted, the TOML map key is used as the output name.',
    },
    version: {
        detail: '(string) version — REQUIRED',
        doc:    'Semantic version of this package: `MAJOR.MINOR.PATCH`. Example: `"0.1.0"`.',
    },
    description: {
        detail: '(string) description',
        doc:    'A short, human-readable description of the package.',
    },
    license: {
        detail: '(string) license',
        doc:    'SPDX license identifier, e.g. `"Apache-2.0"`, `"MIT"`, `"GPL-3.0-only"`.',
    },
    'fly-version': {
        detail: '(string) fly-version',
        doc:    'Minimum Fly compiler version required to build this package. Example: `"0.12.4"`.',
    },
    authors: {
        detail: '(array) authors',
        doc:    'List of author name strings. Example: `["Alice <alice@example.com>"]`.',
    },
    homepage: {
        detail: '(string) homepage',
        doc:    'URL of the project homepage or documentation site.',
    },
    repository: {
        detail: '(string) repository',
        doc:    'URL of the source code repository, e.g. `"https://github.com/user/repo.git"`.',
    },
    // [targets] inline-table fields
    path: {
        detail: '(string) path',
        doc:    'Relative path from the project root to the entry-point source file for this target. Example: `"src/main.fly"`.',
    },
    lib: {
        detail: '(string) lib — optional',
        doc:    'Declares the target as a library and sets its output type:\n- `"static"` — `.a` archive\n- `"dynamic"` — `.so` / `.dylib` / `.dll`\n- `"both"` — both static and dynamic\n\nIf this field is **absent**, the target is compiled as a binary.',
    },
    // [dependencies] inline keys — registry deps
    registry: {
        detail: '(string) registry',
        doc:    'Registry alias from `[repo]`. Makes this a registry dependency. Use instead of `git`.',
    },
    version: {
        detail: '(string) version — semver range',
        doc:    'Version requirement for registry dependencies. flyp selects the highest available version that satisfies the range.\n\n'
              + '| Syntax | Meaning |\n|---|---|\n'
              + '| `"*"` | Any (latest) |\n'
              + '| `"1.2.3"` | Exact |\n'
              + '| `"^1.2.3"` | `>=1.2.3, <2.0.0` |\n'
              + '| `"~1.2.3"` | `>=1.2.3, <1.3.0` |\n'
              + '| `"~1.2"` | `>=1.2.0, <1.3.0` |\n'
              + '| `">=1.0.0,<2.0.0"` | Explicit range (comma = AND) |\n'
              + '| `"1.x"` | `>=1.0.0, <2.0.0` |',
    },
    // [dependencies] inline keys — git deps
    git: {
        detail: '(string) git',
        doc:    'HTTPS or SSH URL of the git repository. Example: `"https://github.com/user/repo.git"`.',
    },
    tag: {
        detail: '(string) tag',
        doc:    'Git tag to check out. Use semver tags like `"v1.0.0"`. Exactly one of `tag`, `branch`, or `rev` is required.',
    },
    branch: {
        detail: '(string) branch',
        doc:    'Git branch name to track. Example: `"main"`. Exactly one of `tag`, `branch`, or `rev` is required.',
    },
    rev: {
        detail: '(string) rev',
        doc:    'Full 40-character git commit hash. Provides the most reproducible builds. Exactly one of `tag`, `branch`, or `rev` is required.',
    },
    // [profile.*]
    'opt-level': {
        detail: '(int) opt-level',
        doc:    'Compiler optimization level:\n- `0` — no optimization (fastest compile, debug builds)\n- `1` — basic optimizations\n- `2` — moderate optimizations\n- `3` — aggressive optimizations (default for release)',
    },
    'debug-info': {
        detail: '(bool) debug-info',
        doc:    'Include DWARF debug information in the output. Default: `true` for debug, `false` for release.',
    },
    assertions: {
        detail: '(bool) assertions',
        doc:    'Enable runtime assertion checks. Default: `true` for debug, `false` for release.',
    },
    lto: {
        detail: '(bool) lto',
        doc:    'Enable Link-Time Optimization. Reduces binary size and may improve runtime performance at the cost of longer link times. Default: `false`.',
    },
    strip: {
        detail: '(bool) strip',
        doc:    'Strip debug symbols and symbol table from the output binary. Reduces file size. Default: `false`.',
    },
};

// Hover documentation for section headers (matched by line pattern, not word).
interface SectionDoc { title: string; doc: string; }
const SECTION_DOCS: Record<string, SectionDoc> = {
    '[targets]': {
        title: '[targets] — Build targets',
        doc: 'Declares all build targets — binaries and libraries — in a single key→value table. The **key** is the unique CLI identifier (`flyp build --target key`, `flyp run --bin key`) and the default output filename.\n\nA target **without** a `lib` field is a binary. Adding `lib = "static"` or `lib = "dynamic"` makes it a library.\n\n```toml\n[targets]\napp    = { path = "src/main.fly" }                     # binary\ncli    = { name = "MyCLI", path = "src/cli.fly" }      # binary with name override\nmylib  = { path = "src/lib.fly",  lib = "static"  }    # static library\ndynlib = { path = "src/dyn.fly",  lib = "dynamic" }    # dynamic library\n```\n\nIf `[targets]` is absent, flyp auto-detects `src/main.fly` (→ binary) and `src/lib.fly` (→ static library).',
    },
    '[repo]': {
        title: '[repo] — Registry aliases',
        doc: 'Declares named registry aliases. Each key maps a short name to a registry URL. All other sections reference registries by alias, never by URL.\n\n```toml\n[repo]\nlocal  = "http://localhost:5000"\nremote = "https://registry.flylang.org"\n```\n\nStart a local registry: `flyp-registry --storage ~/.flyp/registry --port 5000`',
    },
    '[workspace]': {
        title: '[workspace] — Workspace root',
        doc: 'Declares this manifest as a workspace root. Lists the relative paths of member packages.\n\n```toml\n[workspace]\nmembers = ["app", "libs/core"]\n```\n\n`[package]` is optional in a workspace root. Run `flyp build` from the workspace root to build all members in dependency order.\n\nMembers reference each other via path dependencies:\n```toml\n[dependencies]\ncore = { path = "../libs/core" }\n```',
    },
    '[hooks]': {
        title: '[hooks] — Build hooks',
        doc: 'Shell commands run before and after compilation.\n\n```toml\n[hooks]\npre-build  = "python scripts/codegen.py"\npost-build = "strip target/release/app"\n```\n\nAvailable env vars: `FLYP_PROFILE`, `FLYP_OUT_DIR`, `FLYP_ROOT_DIR`, `FLYP_TARGET_TRIPLE`, `FLYP_PACKAGE_NAME`.\n\n`post-build` only runs on success.',
    },
    '[test]': {
        title: '[test] — Test suite configuration',
        doc: 'Configures test suite discovery and execution. `suites` accepts glob patterns relative to the project root.\n\n```toml\n[test]\nsuites     = ["tests/**/*.fly"]\nparallel   = false\ntimeout_ms = 5000\nfail_fast  = false\n```\n\nRun with `flyp test`. Filter by suite: `flyp test MySuite`.',
    },
    '[package]': {
        title: '[package] — Package metadata',
        doc: 'The main manifest section. Uses **single brackets** because exactly one `[package]` section is allowed per `fly.toml`. Contains required fields `name` and `version`.',
    },
    '[dependencies]': {
        title: '[dependencies] — Runtime dependencies',
        doc: 'Three dependency types are supported:\n\n**Git:**\n```toml\nmy-lib = { git = "https://github.com/user/repo.git", tag = "v1.0.0" }\n```\n\n**Registry** (alias from `[repo]`; `name` defaults to map key):\n```toml\nfly-std    = { registry = "local", version = "0.14.0" }\nio-helpers = { registry = "remote", name = "fly-io", version = "1.0.0" }\n```\n\n**Path** (workspace member):\n```toml\ncore = { path = "../libs/core" }\n```',
    },
    '[dev-dependencies]': {
        title: '[dev-dependencies] — Development-only dependencies',
        doc: 'Same format as `[dependencies]` but these packages are not propagated to packages that depend on yours — only available during local development and testing.',
    },
    '[profiles]': {
        title: '[profiles] — Build profiles',
        doc: 'Declares build profiles as a key→value table. Each key is a profile name selectable with `--profile`.\n\n```toml\n[profiles]\ndebug   = { opt-level = 0, debug-info = true,  assertions = true,  lto = false, strip = false }\nrelease = { opt-level = 3, debug-info = false, assertions = false, lto = false, strip = false }\nci      = { opt-level = 2, debug-info = true,  assertions = false, lto = false, strip = false }\n```\n\n`--release` is an alias for `--profile release`. Default profile is `debug`.\n\n`debug` and `release` are auto-injected with their defaults if the section is absent.',
    },
};

export class FlyTomlHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | undefined {
        // Check if the cursor is on a section header line.
        const lineText = document.lineAt(position.line).text.trim();
        const sectionEntry = SECTION_DOCS[lineText];
        if (sectionEntry) {
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**${sectionEntry.title}**\n\n${sectionEntry.doc}`);
            md.isTrusted = true;
            return new vscode.Hover(md, document.lineAt(position.line).range);
        }

        const wordRange = document.getWordRangeAtPosition(position, /[\w-]+/);
        if (!wordRange) return undefined;

        const word  = document.getText(wordRange);
        const entry = DOCS[word];
        if (!entry) return undefined;

        const md = new vscode.MarkdownString();
        md.appendCodeblock(entry.detail, 'toml');
        md.appendMarkdown('\n\n' + entry.doc);
        return new vscode.Hover(md, wordRange);
    }
}
