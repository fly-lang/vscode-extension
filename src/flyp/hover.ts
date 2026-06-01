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

export class FlyTomlHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | undefined {
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
