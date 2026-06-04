import * as vscode from 'vscode';

// ── Section detection ─────────────────────────────────────────────────────────

type Section =
    | 'package' | 'targets' | 'hooks' | 'test'
    | 'dependencies' | 'dev-dependencies'
    | 'profiles' | 'workspace' | 'repo'
    | 'none';

function currentSection(document: vscode.TextDocument, lineIndex: number): Section {
    for (let i = lineIndex - 1; i >= 0; i--) {
        const t = document.lineAt(i).text.trim();
        if (t === '[package]')            return 'package';
        if (t === '[targets]')            return 'targets';
        if (t === '[hooks]')              return 'hooks';
        if (t === '[test]')               return 'test';
        if (t === '[dependencies]')       return 'dependencies';
        if (t === '[dev-dependencies]')   return 'dev-dependencies';
        if (t === '[profiles]')           return 'profiles';
        if (t === '[workspace]')          return 'workspace';
        if (t === '[repo]')               return 'repo';
    }
    return 'none';
}

function isInsideInlineTable(line: string, col: number): boolean {
    const before = line.slice(0, col);
    const opens  = (before.match(/\{/g) || []).length;
    const closes = (before.match(/\}/g) || []).length;
    return opens > closes;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function kv(key: string, value: string, doc: string): vscode.CompletionItem {
    const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
    item.insertText    = new vscode.SnippetString(`${key} = ${value}`);
    item.documentation = new vscode.MarkdownString(doc);
    return item;
}

function section(label: string): vscode.CompletionItem {
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Module);
    item.insertText    = new vscode.SnippetString(label);
    item.documentation = new vscode.MarkdownString(`Declare a \`${label}\` section.`);
    return item;
}

function value(label: string, kind = vscode.CompletionItemKind.Value): vscode.CompletionItem {
    return new vscode.CompletionItem(label, kind);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class FlyTomlCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const line    = document.lineAt(position).text;
        const lineIdx = position.line;
        const col     = position.character;
        const prefix  = line.slice(0, col).trim();

        // ── Inside inline table ───────────────────────────────────────────
        if (isInsideInlineTable(line, col)) {
            const afterEquals = /=\s*$/.test(prefix);
            if (afterEquals) return [];
            const sec = currentSection(document, lineIdx);
            if (sec === 'targets') return [
                kv('name', '"$1"', 'Optional output filename override. Defaults to the map key.'),
                kv('path', '"$1"', 'Relative path to the entry-point source file.'),
                kv('lib',  '"${1|static,dynamic,both|}"',
                   'Present = library (`"static"`, `"dynamic"`, or `"both"`). Absent = binary.'),
            ];
            if (sec === 'profiles') return [
                kv('opt-level',  '${1|0,1,2,3|}',        'Compiler optimisation level: 0 (none) to 3 (max).'),
                kv('debug-info', '${1|true,false|}',      'Emit DWARF debug information.'),
                kv('assertions', '${1|true,false|}',      'Enable runtime assertion checks.'),
                kv('lto',        '${1|false,true|}',      'Link-time optimisation.'),
                kv('strip',      '${1|false,true|}',      'Strip symbols from the output binary.'),
            ];
            // Inside a dependency inline table: offer both git and registry keys.
            return [
                kv('git',      '"$1"', 'Git repository URL.'),
                kv('tag',      '"$1"', 'Exact git tag, e.g. `v1.0.0`.'),
                kv('branch',   '"$1"', 'Git branch name, e.g. `main`.'),
                kv('rev',      '"$1"', 'Full 40-character git commit hash.'),
                kv('registry', '"$1"', 'Registry alias from `[repo]`. Use instead of `git` for registry deps.'),
                kv('version',  '"$1"',
                   'Semver range for registry deps.\n'
                   + '- `"1.0.0"` exact\n'
                   + '- `"^1.2.3"` compatible (>=1.2.3,<2.0.0)\n'
                   + '- `"~1.2.3"` patch-level (>=1.2.3,<1.3.0)\n'
                   + '- `">=1.0.0,<2.0.0"` explicit range\n'
                   + '- `"*"` any (latest)'),
                kv('name',     '"$1"', 'Package name on the registry (defaults to the map key).'),
                kv('path',     '"$1"', 'Relative path for workspace path dependencies.'),
            ];
        }

        // ── After `=` on a known key ──────────────────────────────────────
        const afterEq = prefix.match(/^(opt-level|lib)\s*=\s*$/);
        if (afterEq) {
            const key = afterEq[1];
            if (key === 'opt-level') return ['0','1','2','3'].map(v => value(v, vscode.CompletionItemKind.EnumMember));
            if (key === 'lib')       return ['"static"', '"dynamic"', '"both"'].map(v => value(v));
        }
        if (/^(debug-info|assertions|lto|strip|parallel|fail_fast)\s*=\s*$/.test(prefix)) {
            return ['true', 'false'].map(v => value(v, vscode.CompletionItemKind.Keyword));
        }

        // ── Key completions by section ────────────────────────────────────
        if (prefix === '' || /^\w[\w-]*$/.test(prefix)) {
            const sec = currentSection(document, lineIdx);

            if (sec === 'package') return [
                kv('name',        '"$1"', 'REQUIRED. Package name `[a-z0-9_-]+`.'),
                kv('version',     '"$1"', 'REQUIRED. Semantic version `MAJOR.MINOR.PATCH`.'),
                kv('description', '"$1"', 'Short description of the package.'),
                kv('license',     '"$1"', 'SPDX license identifier, e.g. `"Apache-2.0"`.'),
                kv('fly-version', '"$1"', 'Minimum Fly compiler version required.'),
                kv('authors',     '["$1"]', 'List of author names.'),
                kv('homepage',    '"$1"', 'Project homepage URL.'),
                kv('repository',  '"$1"', 'Source repository URL.'),
                kv('registry',    '"$1"', 'Default registry alias (from `[repo]`) used by `flyp deploy`.'),
            ];

            if (sec === 'targets') {
                const bin = new vscode.CompletionItem('${key} = { path = "…" }', vscode.CompletionItemKind.Snippet);
                bin.insertText    = new vscode.SnippetString('${1:key} = { path = "$2" }');
                bin.documentation = new vscode.MarkdownString('Binary target (no `lib` field). Key = CLI identifier and default output filename.');

                const lib = new vscode.CompletionItem('${key} = { path = "…", lib = "…" }', vscode.CompletionItemKind.Snippet);
                lib.insertText    = new vscode.SnippetString('${1:key} = { path = "$2", lib = "${3|static,dynamic,both|}" }');
                lib.documentation = new vscode.MarkdownString('Library target (`lib` = `"static"`, `"dynamic"`, or `"both"`). Key = CLI identifier and default output filename.');
                return [bin, lib];
            }

            if (sec === 'hooks') return [
                kv('pre-build',  '"$1"', 'Shell command to run before compilation. Runs from the package root with FLYP_* env vars.'),
                kv('post-build', '"$1"', 'Shell command to run after successful compilation. Skipped on build failure.'),
            ];

            if (sec === 'test') return [
                kv('suites',     '["$1"]',            'Glob patterns for suite files, e.g. `"tests/**/*.fly"`.'),
                kv('parallel',   '${1|false,true|}',  'Run suites concurrently. Default: `false`.'),
                kv('timeout_ms', '$1',                 'Per-suite timeout in milliseconds. `0` = no timeout.'),
                kv('fail_fast',  '${1|false,true|}',  'Stop on first suite failure. Default: `false`.'),
            ];

            if (sec === 'dependencies' || sec === 'dev-dependencies') {
                const dep = new vscode.CompletionItem('dependency', vscode.CompletionItemKind.Snippet);
                dep.insertText    = new vscode.SnippetString('${1:name} = { git = "$2", tag = "$3" }');
                dep.documentation = new vscode.MarkdownString('Git dependency entry.');
                dep.label         = 'name = { git = "…", tag = "…" }';
                return [dep];
            }

            if (sec === 'repo') {
                const entry = new vscode.CompletionItem('${alias} = "URL"', vscode.CompletionItemKind.Snippet);
                entry.insertText    = new vscode.SnippetString('${1:local} = "${2:http://localhost:5000}"');
                entry.documentation = new vscode.MarkdownString('Named registry alias. The alias is used in `[dependencies]` and `[package].registry`.');
                return [entry];
            }

            if (sec === 'workspace') return [
                kv('members', '["$1"]',
                   'Comma-separated list of relative paths to workspace member directories.\n'
                   + 'Example: `["app", "libs/core"]`'),
            ];

            if (sec === 'profiles') {
                const entry = new vscode.CompletionItem('${name} = { opt-level = …, … }', vscode.CompletionItemKind.Snippet);
                entry.insertText    = new vscode.SnippetString(
                    '${1:name} = { opt-level = ${2:0}, debug-info = ${3|true,false|}, assertions = ${4|true,false|}, lto = ${5|false,true|}, strip = ${6|false,true|} }'
                );
                entry.documentation = new vscode.MarkdownString('Profile entry. Use `flyp build --profile name` to select it.');
                return [entry];
            }

            // Root level: section headers
            if (sec === 'none') return [
                section('[package]'),
                section('[targets]'),
                section('[hooks]'),
                section('[test]'),
                section('[repo]'),
                section('[workspace]'),
                section('[dependencies]'),
                section('[dev-dependencies]'),
                section('[profiles]'),
            ];
        }

        return [];
    }
}
