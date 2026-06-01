import * as vscode from 'vscode';

export class FlyTomlDiagnosticsProvider {
    constructor(private collection: vscode.DiagnosticCollection) {}

    run(document: vscode.TextDocument): void {
        const diags: vscode.Diagnostic[] = [];
        const lines = document.getText().split('\n');

        let inPackage      = false;
        let inDeps         = false;
        let inProfile      = false;
        let foundPackage   = false;
        let foundName      = false;
        let foundVersion   = false;

        // Per-dependency ref tracking
        type DepRef = { line: number; tag?: number; branch?: number; rev?: number; git?: number };
        const deps: DepRef[] = [];
        let currentDep: DepRef | null = null;

        const warn = (lineIdx: number, msg: string, col = 0, endCol?: number) => {
            const end = endCol ?? lines[lineIdx]?.length ?? col + 1;
            const range = new vscode.Range(lineIdx, col, lineIdx, end);
            diags.push(new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning));
        };

        const err = (lineIdx: number, msg: string, col = 0, endCol?: number) => {
            const end = endCol ?? lines[lineIdx]?.length ?? col + 1;
            const range = new vscode.Range(lineIdx, col, lineIdx, end);
            diags.push(new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error));
        };

        for (let i = 0; i < lines.length; i++) {
            const raw  = lines[i];
            const line = raw.replace(/#.*$/, '').trim();  // strip comments
            if (!line) continue;

            // Section headers
            if (/^\[package\]$/.test(line)) {
                inPackage = true; inDeps = false; inProfile = false;
                foundPackage = true;
                if (currentDep) { deps.push(currentDep); currentDep = null; }
                continue;
            }
            if (/^\[(?:dev-)?dependencies\]$/.test(line)) {
                inDeps = true; inPackage = false; inProfile = false;
                if (currentDep) { deps.push(currentDep); currentDep = null; }
                continue;
            }
            if (/^\[profile\.(debug|release)\]$/.test(line)) {
                inProfile = true; inPackage = false; inDeps = false;
                if (currentDep) { deps.push(currentDep); currentDep = null; }
                continue;
            }
            if (/^\[\[?(bin|lib|test)\]?\]$/.test(line)) {
                inPackage = false; inDeps = false; inProfile = false;
                if (currentDep) { deps.push(currentDep); currentDep = null; }
                continue;
            }
            if (/^\[/.test(line)) {
                inPackage = false; inDeps = false; inProfile = false;
                if (currentDep) { deps.push(currentDep); currentDep = null; }
                continue;
            }

            // [package] field validation
            if (inPackage) {
                const nameM    = line.match(/^name\s*=\s*"([^"]*)"/);
                const versionM = line.match(/^version\s*=\s*"([^"]*)"/);

                if (nameM) {
                    foundName = true;
                    if (!/^[a-z0-9_-]+$/.test(nameM[1])) {
                        const col = raw.indexOf(nameM[1]);
                        err(i, `Invalid package name "${nameM[1]}": must match [a-z0-9_-]+.`, col, col + nameM[1].length);
                    }
                }
                if (versionM) {
                    foundVersion = true;
                    if (!/^\d+\.\d+\.\d+$/.test(versionM[1])) {
                        const col = raw.indexOf(versionM[1]);
                        err(i, `Invalid version "${versionM[1]}": must be MAJOR.MINOR.PATCH (e.g. "1.0.0").`, col, col + versionM[1].length);
                    }
                }
            }

            // [profile.*] field validation
            if (inProfile) {
                const optM = line.match(/^opt-level\s*=\s*(\S+)/);
                if (optM && !['0','1','2','3'].includes(optM[1])) {
                    const col = raw.indexOf(optM[1]);
                    warn(i, `opt-level must be 0, 1, 2, or 3. Got "${optM[1]}".`, col, col + optM[1].length);
                }
            }

            // [dependencies] / [dev-dependencies] inline table validation
            if (inDeps) {
                // Start of a new dependency line: name = { ... }
                const depLine = line.match(/^([a-z0-9_-]+)\s*=\s*\{/);
                if (depLine) {
                    if (currentDep) deps.push(currentDep);
                    currentDep = { line: i };
                }
                if (currentDep) {
                    if (/\bgit\s*=/.test(line))    currentDep.git    = i;
                    if (/\btag\s*=/.test(line))    currentDep.tag    = i;
                    if (/\bbranch\s*=/.test(line)) currentDep.branch = i;
                    if (/\brev\s*=/.test(line))    currentDep.rev    = i;
                    // Closed on same line
                    if (/\}/.test(line)) { deps.push(currentDep); currentDep = null; }
                }
            }
        }

        if (currentDep) deps.push(currentDep);

        // Global checks
        if (!foundPackage) {
            warn(0, 'fly.toml is missing a [package] section.');
        } else {
            if (!foundName)    err(0, '[package] is missing required field "name".');
            if (!foundVersion) err(0, '[package] is missing required field "version".');
        }

        // Per-dependency checks
        for (const dep of deps) {
            const refs = [dep.tag, dep.branch, dep.rev].filter(v => v !== undefined);
            if (refs.length === 0) {
                warn(dep.line, 'Dependency must specify exactly one of "tag", "branch", or "rev".');
            } else if (refs.length > 1) {
                warn(dep.line, 'Dependency must specify only ONE of "tag", "branch", or "rev" — not multiple.');
            }
        }

        this.collection.set(document.uri, diags);
    }

    clear(uri: vscode.Uri): void {
        this.collection.delete(uri);
    }
}
