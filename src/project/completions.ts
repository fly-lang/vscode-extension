import * as vscode from 'vscode';
import { detectVersion } from '../compiler/finder';

/**
 * Field completions inside a project manifest.
 *
 * The manifest is Fly source, so the language server already completes types and
 * namespaces here. What it cannot offer is the SHAPE of a manifest — which
 * fields exist and how a Target or a Dependency is spelled — so this provider
 * contributes those as snippets.
 */

function field(label: string, snippet: string, doc: string): vscode.CompletionItem {
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
    item.insertText    = new vscode.SnippetString(snippet);
    item.documentation = new vscode.MarkdownString(doc);
    return item;
}

/**
 * Fields the driver actually reads, in the order `fly` serialises them.
 *
 * Built per call: the flyVersion snippet defaults to the ACTIVE compiler's
 * version (what `fly init` would write) instead of a hardcoded number that
 * goes stale at every toolchain release; `flyVer` is "" until detected.
 */
function makeFields(flyVer: string): vscode.CompletionItem[] {
    return [
    field('name',        'string name = "${1:my-project}"',
          'Package name (REQUIRED). Must match `[a-z0-9_-]+`.'),
    field('version',     'string version = "${1:0.1.0}"',
          'Package version (REQUIRED), `MAJOR.MINOR.PATCH`.'),
    field('description', 'string description = "${1:A Fly package}"',
          'Short human-readable description.'),
    field('license',     'string license = "${1:Apache-2.0}"',
          'SPDX license identifier.'),
    field('flyVersion',  'string flyVersion = "${1' + (flyVer ? ':' + flyVer : '') + '}"',
          'The Fly toolchain version this package expects (the version reported by `fly --version`).'),
    field('homepage',    'string homepage = "${1:https://example.org}"',
          'Project homepage or documentation URL.'),
    field('repository',  'string repository = "${1:https://github.com/user/repo.git}"',
          'Source repository URL.'),
    field('registry',    'string registry = "${1:default}"',
          'Default registry alias for this package\'s dependencies.'),
    field('authors',     'string[] authors = { "${1:Name <mail@example.org>}" }',
          'Author strings.'),
    field('linkLibs',    'string[] linkLibs = { "${1:m}" }',
          'Native libraries to link (without the `-l` prefix).'),
    field('targets',     'Target[] targets = {\n\t{ name = "${1:app}", srcDirs = { "${2:src}" }${3:, entry = "${4:src/main.fly}"} }\n}',
          'Build targets, as struct literals with named fields: `name`, then `srcDirs` '
        + '(or `path` / `files`), `entry`, `lib` (`"static"`, `"dynamic"`, `"both"`; '
        + 'omitted = executable), `os`, `artifact`, `libDirs`, `linkLibs`, `flags`, '
        + '`dir`, `copy`, `rpaths`. The short form `new Target(name, path, lib)` still works.'),
    field('profiles',    'Profile[] profiles = {\n\t{ name = "${1:release}", optLevel = ${2:3}, debugInfo = ${3:false} }\n}',
          'Build profiles, selected with `fly build --profile <name>` (`--release` = '
        + '`release`). Fields: `name`, `optLevel`, `debugInfo`, `assertions`, `lto`, '
        + '`strip`, `warningsAsErrors`, `debugPrefixMap`. A field left out keeps the '
        + 'built-in default of that profile.'),
    field('dependencies', 'Dependency[] dependencies = { new Dependency("${1:name}", "${2:^1.0.0}") }',
          'Runtime dependencies. Prefer `fly add`, which also re-locks.'),
    field('devDependencies', 'Dependency[] devDependencies = { new Dependency("${1:name}", "${2:^1.0.0}") }',
          'Development-only dependencies (`fly add --dev`).'),
    ];
}

/** Entries usable inside an array literal, tagged with the field they belong to. */
const ENTRIES: vscode.CompletionItem[] = [
    (() => {
        const i = new vscode.CompletionItem('target { name = … }', vscode.CompletionItemKind.Struct);
        i.insertText    = new vscode.SnippetString(
            '{ name = "${1:app}", srcDirs = { "${2:src}" }${3:, entry = "${4:src/main.fly}"} }');
        i.filterText    = 'target';
        i.documentation = new vscode.MarkdownString(
            'One build target in the named form. Also: `path`, `files`, `lib`, `os`, '
          + '`artifact`, `libDirs`, `linkLibs`, `flags`, `dir`, `copy`, `rpaths`.');
        return i;
    })(),
    (() => {
        const i = new vscode.CompletionItem('target (library)', vscode.CompletionItemKind.Struct);
        i.insertText    = new vscode.SnippetString(
            '{ name = "${1:mylib}", srcDirs = { "${2:lib}" }, lib = "${3|static,dynamic,both|}" }');
        i.filterText    = 'target library';
        i.documentation = new vscode.MarkdownString(
            'A library target: one merged object plus a `.fly.h` header per public module.');
        return i;
    })(),
    (() => {
        const i = new vscode.CompletionItem('target (copy files)', vscode.CompletionItemKind.Struct);
        i.insertText    = new vscode.SnippetString(
            '{ name = "${1:assets}", dir = "${2:share}", copy = { "${3:assets}" } }');
        i.filterText    = 'target copy';
        i.documentation = new vscode.MarkdownString(
            'A target with no sources compiles nothing: it copies files or whole '
          + 'directories into `<output>/<dir>` (`dir/prefix*suffix` takes the matching files).');
        return i;
    })(),
    (() => {
        const i = new vscode.CompletionItem('profile { name = … }', vscode.CompletionItemKind.Struct);
        i.insertText    = new vscode.SnippetString(
            '{ name = "${1:release}", optLevel = ${2:3}, debugInfo = ${3:false}, warningsAsErrors = ${4:false} }');
        i.filterText    = 'profile';
        i.documentation = new vscode.MarkdownString(
            'One build profile, selected with `fly build --profile <name>`.');
        return i;
    })(),
    (() => {
        const i = new vscode.CompletionItem('new Target', vscode.CompletionItemKind.Constructor);
        i.insertText    = new vscode.SnippetString('new Target("${1:app}", "${2:src/main.fly}", "${3}")');
        i.documentation = new vscode.MarkdownString(
            'One build target, short form: `(name, path, lib)`. Empty `lib` = executable.');
        return i;
    })(),
    (() => {
        const i = new vscode.CompletionItem('new Dependency (registry)', vscode.CompletionItemKind.Constructor);
        i.insertText    = new vscode.SnippetString('new Dependency("${1:name}", "${2:^1.0.0}")');
        i.documentation = new vscode.MarkdownString('A registry dependency: `(name, version)`.');
        return i;
    })(),
    (() => {
        const i = new vscode.CompletionItem('new Dependency (git)', vscode.CompletionItemKind.Constructor);
        i.insertText    = new vscode.SnippetString(
            'new Dependency("${1:name}", "", "", "${2:https://github.com/user/repo.git}", "${3:v1.0.0}")');
        i.documentation = new vscode.MarkdownString(
            'A git dependency: `(name, version, registry, git, tag)`. Use the `branch` or '
          + '`rev` argument instead of `tag` to track a branch or pin a commit.');
        return i;
    })(),
    (() => {
        const i = new vscode.CompletionItem('new Dependency (path)', vscode.CompletionItemKind.Constructor);
        i.insertText    = new vscode.SnippetString(
            'new Dependency("${1:name}", "", "", "", "", "", "", "${2:../libs/core}")');
        i.documentation = new vscode.MarkdownString('A local path dependency (8th argument).');
        return i;
    })(),
];

/** Which array field each entry of ENTRIES belongs to, by its label. */
function entryField(label: string): string {
    if (label.includes('Dependency')) return 'dependencies';
    if (label.startsWith('profile')) return 'profiles';
    return 'targets';
}

/**
 * Where the cursor is in the manifest: brace depth (0 = top level, 1 = the
 * class body, 2+ = inside an initializer) and, inside one, the field being
 * initialized. Braces in strings and comments do not count.
 */
function cursorContext(text: string): { depth: number; field: string } {
    let depth = 0;
    let field = '';
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        const c2 = text[i + 1];
        if (c === '/' && c2 === '/') {
            const nl = text.indexOf('\n', i);
            if (nl < 0) break;
            i = nl;
            continue;
        }
        if (c === '/' && c2 === '*') {
            const end = text.indexOf('*/', i + 2);
            if (end < 0) break;
            i = end + 2;
            continue;
        }
        if (c === '"') {
            i++;
            while (i < text.length && text[i] !== '"') {
                if (text[i] === '\\') i++;
                i++;
            }
            i++;
            continue;
        }
        if (c === '{') {
            if (depth === 1) {
                // `<Type>[] <field> = {` — the name right before the `=`.
                const m = text.slice(0, i).match(/([A-Za-z_]\w*)\s*=\s*$/);
                field = m ? m[1] : '';
            }
            depth++;
        } else if (c === '}') {
            depth = Math.max(0, depth - 1);
            if (depth <= 1) field = '';
        }
        i++;
    }
    return { depth, field };
}

export class ManifestCompletionProvider implements vscode.CompletionItemProvider {
    // Active compiler version, detected once per compilerPath value: the
    // flyVersion snippet then offers what `fly init` would write. "" (not yet
    // detected, or no compiler) leaves the snippet placeholder empty.
    private flyVer = '';
    private detectedFor = '';

    private refreshVersion(): void {
        const compiler = vscode.workspace.getConfiguration('fly')
            .get<string>('compilerPath', 'fly');
        if (compiler === this.detectedFor) return;
        this.detectedFor = compiler;
        void detectVersion(compiler).then(v => { this.flyVer = v ?? ''; });
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        // Fire-and-forget: the first request may miss the version (snippet
        // placeholder stays empty); later ones use the cached detection.
        this.refreshVersion();
        const line = document.lineAt(position.line).text;
        const ctx  = cursorContext(document.getText(new vscode.Range(new vscode.Position(0, 0), position)));

        // Inside an array literal — on the declaration's own line or on a line
        // of its own — the useful completions are the entries of THAT field.
        if (ctx.depth >= 2) {
            const field = ctx.field === 'devDependencies' ? 'dependencies' : ctx.field;
            // Directly inside the array only: within an entry `{ name = … }`
            // there is no whole entry left to offer.
            if (ctx.depth > 2) return [];
            const own = ENTRIES.filter(e => entryField(String(e.label)) === field);
            return own.length > 0 ? own : [];
        }

        // Only offer field declarations at the start of a line inside the class body.
        if (ctx.depth !== 1) return [];
        if (!/^\s*[A-Za-z\[\]]*$/.test(line.slice(0, position.character))) return [];
        return makeFields(this.flyVer);
    }
}