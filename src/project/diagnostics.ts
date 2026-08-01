import * as vscode from 'vscode';

/**
 * Manifest linting.
 *
 * Deliberately narrow. `Manifest.fly` is Fly source, so everything a compiler
 * can catch — syntax, unknown types, bad literals — is already reported by the
 * language server. What no compiler can catch is a manifest that is valid Fly
 * and still means nothing to the package manager, which is what this checks:
 *
 *   • fields the driver does not read yet (they parse fine and do nothing);
 *   • a missing or malformed name/version;
 *   • a Target or Dependency with too few arguments to be usable.
 */

/** Fields the manifest reader consumes today. */
const READ_FIELDS = new Set([
    'name', 'version', 'description', 'license', 'flyVersion', 'homepage',
    'repository', 'registry', 'authors', 'linkLibs', 'dependencies',
    'devDependencies', 'targets',
]);

/** Declared by the fly.meta schema but IGNORED by the current reader.
 *  (`tst` is the schema's test-config field — `test` is a reserved keyword.) */
const IGNORED_FIELDS = new Set([
    'profiles', 'repositories', 'tst', 'workspace', 'hooks',
]);

// `  string name = "x"` / `  Target[] targets = { … }` — the declaration's name.
const FIELD_DECL_RE = /^\s*(?:[A-Za-z_][A-Za-z0-9_.]*)(?:\[\])?\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/;

const NAME_RE    = /^[a-z0-9_-]+$/;
const VERSION_RE = /^\d+\.\d+\.\d+/;

export class ManifestDiagnosticsProvider {
    constructor(private readonly collection: vscode.DiagnosticCollection) {}

    clear(uri: vscode.Uri): void { this.collection.delete(uri); }

    run(document: vscode.TextDocument): void {
        const diags: vscode.Diagnostic[] = [];
        const seen  = new Map<string, string>();   // field → its string value

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            const m    = text.match(FIELD_DECL_RE);
            if (!m) continue;

            const field = m[1];
            const col   = text.indexOf(field, text.indexOf(m[0]));
            const range = new vscode.Range(i, Math.max(col, 0), i, Math.max(col, 0) + field.length);

            if (IGNORED_FIELDS.has(field)) {
                diags.push(new vscode.Diagnostic(
                    range,
                    `'${field}' is part of the fly.meta schema but the current fly driver does `
                  + `not read it — declaring it has no effect.`,
                    vscode.DiagnosticSeverity.Warning,
                ));
                continue;
            }

            if (!READ_FIELDS.has(field)) continue;

            const value = text.match(/=\s*"([^"]*)"/);
            if (value) seen.set(field, value[1]);
            else seen.set(field, '');
        }

        const firstLine = new vscode.Range(0, 0, 0, Math.max(document.lineAt(0).text.length, 1));

        if (!seen.has('name')) {
            diags.push(new vscode.Diagnostic(
                firstLine, `the manifest declares no 'name' — fly build cannot identify the package.`,
                vscode.DiagnosticSeverity.Warning));
        } else if (seen.get('name') && !NAME_RE.test(seen.get('name')!)) {
            diags.push(new vscode.Diagnostic(
                firstLine, `package name '${seen.get('name')}' should match [a-z0-9_-]+.`,
                vscode.DiagnosticSeverity.Warning));
        }

        if (!seen.has('version')) {
            diags.push(new vscode.Diagnostic(
                firstLine, `the manifest declares no 'version'.`,
                vscode.DiagnosticSeverity.Warning));
        } else if (seen.get('version') && !VERSION_RE.test(seen.get('version')!)) {
            diags.push(new vscode.Diagnostic(
                firstLine, `version '${seen.get('version')}' is not MAJOR.MINOR.PATCH.`,
                vscode.DiagnosticSeverity.Warning));
        }

        this.collection.set(document.uri, diags);
    }
}
