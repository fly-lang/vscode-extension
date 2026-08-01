import * as vscode from 'vscode';

// The dependency array declaration:  Dependency[] dependencies = { … }
const DEPS_DECL_RE = /^\s*Dependency\[\]\s+(dev)?[Dd]ependencies\s*=/;

// One entry inside it:  new Dependency("name", …)
const DEP_ENTRY_RE = /new\s+Dependency\s*\(\s*"([a-zA-Z0-9_-]+)"/g;

export class ManifestCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;

            if (DEPS_DECL_RE.test(text)) {
                lenses.push(new vscode.CodeLens(
                    new vscode.Range(i, 0, i, text.length),
                    {
                        title:   '$(add) Add Dependency',
                        command: 'fly.pkgAdd',
                        tooltip: 'Run fly add interactively',
                    },
                ));
            }

            // Entries can share the declaration line or sit on their own, so every
            // line is scanned for them rather than tracking a section.
            DEP_ENTRY_RE.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = DEP_ENTRY_RE.exec(text)) !== null) {
                const pkg   = m[1];
                const range = new vscode.Range(i, m.index, i, m.index + m[0].length);

                lenses.push(new vscode.CodeLens(range, {
                    title:     '$(question) Why',
                    command:   'fly.pkgRunCmd',
                    tooltip:   `Run: fly why ${pkg}`,
                    arguments: [['why', pkg]],
                }));

                lenses.push(new vscode.CodeLens(range, {
                    title:     '$(trash) Remove',
                    command:   'fly.pkgRunCmd',
                    tooltip:   `Run: fly remove ${pkg}`,
                    arguments: [['remove', pkg]],
                }));
            }
        }

        return lenses;
    }
}
