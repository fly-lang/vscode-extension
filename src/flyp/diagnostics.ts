import * as vscode from 'vscode';

// All section headers that fly.toml accepts.
const KNOWN_SECTIONS = new Set([
    'package', 'dependencies', 'dev-dependencies',
    'profile.debug', 'profile.release',
]);
// All array-of-tables headers.
const KNOWN_ARRAY_SECTIONS = new Set(['bin', 'lib', 'test']);

// Known keys per section (for typo detection).
const SECTION_KEYS: Record<string, Set<string>> = {
    package: new Set(['name','version','description','license','fly-version',
                      'authors','homepage','repository']),
    bin:     new Set(['name','path']),
    lib:     new Set(['name','path','type']),
    test:    new Set(['name','path']),
    'profile.debug':   new Set(['opt-level','debug-info','assertions','lto','strip']),
    'profile.release': new Set(['opt-level','debug-info','assertions','lto','strip']),
};

export class FlyTomlDiagnosticsProvider {
    constructor(private collection: vscode.DiagnosticCollection) {}

    run(document: vscode.TextDocument): void {
        const diags: vscode.Diagnostic[] = [];
        const lines = document.getText().split('\n');

        let inPackage      = false;
        let inDeps         = false;
        let inProfile      = false;
        let currentSection = '';        // tracks the current section name
        let foundPackage   = false;
        let foundName      = false;
        let foundVersion   = false;
        let packageCount   = 0;

        // Per-section key deduplication
        const sectionKeys  = new Set<string>();

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

            // ── Section headers ─────────────────────────────────────────────
            const arraySecM = line.match(/^\[\[([^\]]+)\]\]$/);
            const tableSecM = !arraySecM && line.match(/^\[([^\]]+)\]$/);

            if (arraySecM) {
                if (currentDep) { deps.push(currentDep); currentDep = null; }
                inPackage = false; inDeps = false; inProfile = false;
                sectionKeys.clear();
                const name = arraySecM[1].trim();
                currentSection = name;
                if (!KNOWN_ARRAY_SECTIONS.has(name)) {
                    warn(i, `Unknown array section "[[${name}]]". Expected: [[bin]], [[lib]], [[test]].`);
                }
                continue;
            }

            if (tableSecM) {
                if (currentDep) { deps.push(currentDep); currentDep = null; }
                sectionKeys.clear();
                const name = tableSecM[1].trim();
                currentSection = name;
                if (name === 'package') {
                    inPackage = true; inDeps = false; inProfile = false;
                    foundPackage = true;
                    packageCount++;
                    if (packageCount > 1) {
                        err(i, 'Duplicate [package] section — fly.toml can only have one.');
                    }
                } else if (name === 'dependencies' || name === 'dev-dependencies') {
                    inDeps = true; inPackage = false; inProfile = false;
                } else if (name === 'profile.debug' || name === 'profile.release') {
                    inProfile = true; inPackage = false; inDeps = false;
                } else {
                    inPackage = false; inDeps = false; inProfile = false;
                    if (!KNOWN_SECTIONS.has(name)) {
                        warn(i, `Unknown section "[${name}]". Known sections: [package], [dependencies], [dev-dependencies], [profile.debug], [profile.release].`);
                    }
                }
                continue;
            }

            if (/^\[/.test(line)) {
                // Malformed header — not caught by above patterns.
                if (currentDep) { deps.push(currentDep); currentDep = null; }
                inPackage = false; inDeps = false; inProfile = false;
                sectionKeys.clear();
                continue;
            }

            // ── Key-level checks ────────────────────────────────────────────
            const keyM = line.match(/^([a-z][a-z0-9_-]*)\s*=/);
            if (keyM) {
                const key = keyM[1];

                // Duplicate key detection within the current section.
                if (sectionKeys.has(key)) {
                    const col = raw.indexOf(key);
                    warn(i, `Duplicate key "${key}" in [${currentSection}].`, col, col + key.length);
                } else {
                    sectionKeys.add(key);
                }

                // Unknown key for known sections (typo detection).
                const allowed = SECTION_KEYS[currentSection];
                if (allowed && !allowed.has(key)) {
                    const col = raw.indexOf(key);
                    warn(i, `Unknown key "${key}" in [${currentSection}]. Known keys: ${[...allowed].join(', ')}.`, col, col + key.length);
                }
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
            if (dep.git === undefined) {
                err(dep.line, 'Dependency is missing the required "git" field.');
            }
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
