import * as vscode from 'vscode';

// ── Section detection ─────────────────────────────────────────────────────────

type Section =
    | 'package' | 'bin' | 'lib' | 'test'
    | 'dependencies' | 'dev-dependencies'
    | 'profile.debug' | 'profile.release'
    | 'none';

function currentSection(document: vscode.TextDocument, lineIndex: number): Section {
    for (let i = lineIndex - 1; i >= 0; i--) {
        const t = document.lineAt(i).text.trim();
        if (t === '[package]')            return 'package';
        if (t === '[[bin]]')              return 'bin';
        if (t === '[[lib]]')              return 'lib';
        if (t === '[[test]]')             return 'test';
        if (t === '[dependencies]')       return 'dependencies';
        if (t === '[dev-dependencies]')   return 'dev-dependencies';
        if (t === '[profile.debug]')      return 'profile.debug';
        if (t === '[profile.release]')    return 'profile.release';
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

        // ── Inside inline table: git, tag, branch, rev ────────────────────
        if (isInsideInlineTable(line, col)) {
            const afterEquals = /=\s*$/.test(prefix);
            if (afterEquals) return [];   // let string/value completions handle it
            return [
                kv('git',    '"$1"', 'Git repository URL.'),
                kv('tag',    '"$1"', 'Exact git tag, e.g. `v1.0.0`.'),
                kv('branch', '"$1"', 'Git branch name, e.g. `main`.'),
                kv('rev',    '"$1"', 'Full 40-character git commit hash.'),
            ];
        }

        // ── After `=` on a known key ──────────────────────────────────────
        const afterEq = prefix.match(/^(opt-level|type)\s*=\s*$/);
        if (afterEq) {
            const key = afterEq[1];
            if (key === 'opt-level') return ['0','1','2','3'].map(v => value(v, vscode.CompletionItemKind.EnumMember));
            if (key === 'type')      return ['"static"', '"dynamic"', '"both"'].map(v => value(v));
        }
        if (/^(debug-info|assertions|lto|strip)\s*=\s*$/.test(prefix)) {
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
            ];

            if (sec === 'bin' || sec === 'test') return [
                kv('name', '"$1"', 'Target name.'),
                kv('path', '"$1"', 'Relative path to the source file.'),
            ];

            if (sec === 'lib') return [
                kv('name', '"$1"', 'Library target name.'),
                kv('path', '"$1"', 'Relative path to the source file.'),
                kv('type', '"${1|static,dynamic,both|}"', '`static`, `dynamic`, or `both`. Default: `static`.'),
            ];

            if (sec === 'dependencies' || sec === 'dev-dependencies') {
                const dep = new vscode.CompletionItem('dependency', vscode.CompletionItemKind.Snippet);
                dep.insertText    = new vscode.SnippetString('${1:name} = { git = "$2", tag = "$3" }');
                dep.documentation = new vscode.MarkdownString('Git dependency entry.');
                dep.label         = 'name = { git = "…", tag = "…" }';
                return [dep];
            }

            if (sec === 'profile.debug' || sec === 'profile.release') return [
                kv('opt-level',  '$1',    'Optimization level: `0` (none) to `3` (max).'),
                kv('debug-info', '${1|true,false|}', 'Include debug symbols.'),
                kv('assertions', '${1|true,false|}', 'Enable runtime assertions.'),
                kv('lto',        '${1|false,true|}', 'Enable link-time optimization.'),
                kv('strip',      '${1|false,true|}', 'Strip debug symbols from output binary.'),
            ];

            // Root level: section headers
            if (sec === 'none') return [
                section('[package]'),
                section('[[bin]]'),
                section('[[lib]]'),
                section('[[test]]'),
                section('[dependencies]'),
                section('[dev-dependencies]'),
                section('[profile.debug]'),
                section('[profile.release]'),
            ];
        }

        return [];
    }
}
