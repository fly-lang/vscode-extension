import * as vscode from 'vscode';

// Matches a dependency line like:  my-lib = { git = "...", tag = "v1.0.0" }
const DEP_LINE_RE = /^([a-z0-9_-]+)\s*=\s*\{/;

// Matches the section header [dependencies] or [dev-dependencies]
const DEPS_SECTION_RE = /^\[(dev-)?dependencies\]$/;

export class FlyTomlCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        let inDeps = false;

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text.trim();

            if (DEPS_SECTION_RE.test(text)) {
                inDeps = true;

                // "Add Dependency" lens on the section header itself.
                const range = new vscode.Range(i, 0, i, text.length);
                lenses.push(new vscode.CodeLens(range, {
                    title: '$(add) Add Dependency',
                    command: 'fly.flypAdd',
                    tooltip: 'Run flyp add interactively',
                }));
                continue;
            }

            // Any other [section] resets the context.
            if (/^\[/.test(text)) { inDeps = false; continue; }

            if (inDeps) {
                const m = text.match(DEP_LINE_RE);
                if (m) {
                    const pkgName = m[1];
                    const range   = new vscode.Range(i, 0, i, text.length);

                    lenses.push(new vscode.CodeLens(range, {
                        title:   '$(sync) Update',
                        command: 'fly.flypRunCmd',
                        tooltip: `Run: flyp update ${pkgName}`,
                        arguments: [['update', pkgName]],
                    }));

                    lenses.push(new vscode.CodeLens(range, {
                        title:   '$(trash) Remove',
                        command: 'fly.flypRunCmd',
                        tooltip: `Run: flyp remove ${pkgName}`,
                        arguments: [['remove', pkgName]],
                    }));
                }
            }
        }

        return lenses;
    }
}
