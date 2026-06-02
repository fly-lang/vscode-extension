import * as vscode from 'vscode';

interface KeyDoc { detail: string; doc: string; }

const DOCS: Record<string, KeyDoc> = {
    // [package]
    name: {
        detail: '(string) name — REQUIRED',
        doc:    'The package name. Must match `[a-z0-9_-]+` (lowercase letters, digits, hyphens, underscores). Used as the default binary/library name.',
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
    // [[bin]] / [[lib]] / [[test]]
    path: {
        detail: '(string) path',
        doc:    'Relative path from the project root to the source file for this target. Example: `"src/main.fly"`.',
    },
    type: {
        detail: '(string) type — lib only',
        doc:    'Library output type:\n- `"static"` — `.a` archive (default)\n- `"dynamic"` — `.so` / `.dylib` / `.dll`\n- `"both"` — both static and dynamic',
    },
    // [dependencies] inline keys
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
    '[[bin]]': {
        title: '[[bin]] — Binary target',
        doc: 'Declares a binary executable target. Uses **double brackets** because TOML `[[section]]` means *array of tables*: you can repeat `[[bin]]` multiple times in the same file, each entry defines one binary.\n\n```toml\n[[bin]]\nname = "app"\npath = "src/main.fly"\n\n[[bin]]\nname = "cli"\npath = "src/cli.fly"\n```\n\nIf no `[[bin]]` is declared, flyp auto-detects `src/main.fly`.',
    },
    '[[lib]]': {
        title: '[[lib]] — Library target',
        doc: 'Declares a library target. Uses **double brackets** to allow multiple libraries in one project.\n\n```toml\n[[lib]]\nname = "mylib"\npath = "src/lib.fly"\ntype = "static"   # or "dynamic" or "both"\n```\n\n`type` defaults to `"static"` if omitted. If no `[[lib]]` is declared, flyp auto-detects `src/lib.fly`.',
    },
    '[[test]]': {
        title: '[[test]] — Test suite target',
        doc: 'Declares a test suite. Uses **double brackets** to allow multiple test suites.\n\n```toml\n[[test]]\nname = "unit"\npath = "tests/unit.fly"\n\n[[test]]\nname = "integration"\npath = "tests/integration.fly"\n```\n\nRun all suites with `flyp test`, or a specific one with `flyp test unit`.',
    },
    '[package]': {
        title: '[package] — Package metadata',
        doc: 'The main manifest section. Uses **single brackets** because exactly one `[package]` section is allowed per `fly.toml`. Contains required fields `name` and `version`.',
    },
    '[dependencies]': {
        title: '[dependencies] — Runtime dependencies',
        doc: 'Lists git-based dependencies resolved by `flyp`. Each entry is a key-value pair:\n\n```toml\n[dependencies]\nmy-lib = { git = "https://github.com/user/repo.git", tag = "v1.0.0" }\n```\n\nExactly one of `tag`, `branch`, or `rev` is required.',
    },
    '[dev-dependencies]': {
        title: '[dev-dependencies] — Development-only dependencies',
        doc: 'Same format as `[dependencies]` but these packages are not propagated to packages that depend on yours — only available during local development and testing.',
    },
    '[profile.debug]': {
        title: '[profile.debug] — Debug build profile',
        doc: 'Compiler settings used by `flyp build` (default mode). Defaults: `opt-level=0`, `debug-info=true`, `assertions=true`.',
    },
    '[profile.release]': {
        title: '[profile.release] — Release build profile',
        doc: 'Compiler settings used by `flyp build --release`. Defaults: `opt-level=3`, `debug-info=false`, `assertions=false`.',
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
