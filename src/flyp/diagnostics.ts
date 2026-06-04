import * as vscode from 'vscode';

// All single-bracket section headers that fly.toml accepts.
const KNOWN_SECTIONS = new Set([
    'package', 'repo', 'targets', 'hooks', 'test',
    'dependencies', 'dev-dependencies',
    'profiles', 'workspace',
]);

// Known keys per section (for typo detection).
// [targets] uses user-defined keys so it is not listed here.
const SECTION_KEYS: Record<string, Set<string>> = {
    package: new Set(['name','version','description','license','fly-version',
                      'authors','homepage','repository','registry']),
    hooks:     new Set(['pre-build','post-build']),
    workspace: new Set(['members']),
    test:      new Set(['suites','parallel','timeout_ms','fail_fast']),
    // [profiles] entries are user-defined keys (profile names), not fixed keys
};

export class FlyTomlDiagnosticsProvider {
    constructor(private collection: vscode.DiagnosticCollection) {}

    run(document: vscode.TextDocument): void {
        const diags: vscode.Diagnostic[] = [];
        const lines = document.getText().split('\n');

        let inPackage      = false;
        let inDeps         = false;
        let inTargets      = false;   // [targets]
        let inProfile      = false;   // unused now, kept for [profile.*] migration warning
        let currentSection = '';
        let foundPackage   = false;
        let foundName      = false;
        let foundVersion   = false;
        let packageCount   = 0;

        // Per-section key deduplication
        const sectionKeys  = new Set<string>();

        // Per-dependency ref tracking
        type DepRef = {
            line: number;
            tag?: number; branch?: number; rev?: number; git?: number;
            registry?: number; version?: number; path?: number;
        };
        const deps: DepRef[] = [];
        let currentDep: DepRef | null = null;

        // Per-target tracking ([targets])
        type TargetEntry = { line: number; path?: number };
        const targets: TargetEntry[] = [];
        let currentTarget: TargetEntry | null = null;

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
                if (currentDep)    { deps.push(currentDep);       currentDep    = null; }
                if (currentTarget) { targets.push(currentTarget); currentTarget = null; }
                inPackage = false; inDeps = false; inTargets = false; inProfile = false;
                sectionKeys.clear();
                const name = arraySecM[1].trim();
                currentSection = name;
                const hint = (name === 'bin' || name === 'lib' || name === 'test')
                    ? ` Use \`[${name}]\` (single brackets) instead.`
                    : '';
                warn(i, `fly.toml does not use array-of-tables syntax \`[[${name}]]\`.${hint}`);
                continue;
            }

            if (tableSecM) {
                if (currentDep)    { deps.push(currentDep);       currentDep    = null; }
                if (currentTarget) { targets.push(currentTarget); currentTarget = null; }
                sectionKeys.clear();
                const name = tableSecM[1].trim();
                currentSection = name;
                if (name === 'package') {
                    inPackage = true; inDeps = false; inTargets = false; inProfile = false;
                    foundPackage = true;
                    packageCount++;
                    if (packageCount > 1) {
                        err(i, 'Duplicate [package] section — fly.toml can only have one.');
                    }
                } else if (name === 'dependencies' || name === 'dev-dependencies') {
                    inDeps = true; inPackage = false; inTargets = false; inProfile = false;
                } else if (name === 'targets') {
                    inTargets = true; inDeps = false; inPackage = false; inProfile = false;
                } else if (name === 'bin' || name === 'lib') {
                    warn(i, `"[${name}]" is no longer valid. Use "[targets]" with a ${name === 'lib' ? '`lib = "static"`' : '`path`'} entry instead.`);
                    inPackage = false; inDeps = false; inTargets = false; inProfile = false;
                } else if (name === 'profile.debug' || name === 'profile.release') {
                    warn(i, `"[${name}]" is no longer valid. Use "[profiles]" with inline entries instead.`);
                    inPackage = false; inDeps = false; inTargets = false; inProfile = false;
                } else {
                    inPackage = false; inDeps = false; inTargets = false; inProfile = false;
                    if (!KNOWN_SECTIONS.has(name)) {
                        warn(i, `Unknown section "[${name}]". Known sections: [package], [targets], [test], [dependencies], [dev-dependencies], [profiles].`);
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

            // [targets] inline table validation
            if (inTargets) {
                const targetLine = line.match(/^([a-z0-9_-]+)\s*=\s*\{/);
                if (targetLine) {
                    if (currentTarget) targets.push(currentTarget);
                    currentTarget = { line: i };
                }
                if (currentTarget) {
                    if (/\bpath\s*=/.test(line)) currentTarget.path = i;
                    if (/\}/.test(line)) { targets.push(currentTarget); currentTarget = null; }
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
                    if (/\bgit\s*=/.test(line))      currentDep.git      = i;
                    if (/\btag\s*=/.test(line))      currentDep.tag      = i;
                    if (/\bbranch\s*=/.test(line))   currentDep.branch   = i;
                    if (/\brev\s*=/.test(line))      currentDep.rev      = i;
                    if (/\bregistry\s*=/.test(line)) currentDep.registry = i;
                    if (/\bversion\s*=/.test(line))  currentDep.version  = i;
                    if (/\bpath\s*=/.test(line))     currentDep.path     = i;
                    if (/\}/.test(line)) { deps.push(currentDep); currentDep = null; }
                }
            }
        }

        if (currentDep)    deps.push(currentDep);
        if (currentTarget) targets.push(currentTarget);

        // Global checks
        if (!foundPackage) {
            warn(0, 'fly.toml is missing a [package] section.');
        } else {
            if (!foundName)    err(0, '[package] is missing required field "name".');
            if (!foundVersion) err(0, '[package] is missing required field "version".');
        }

        // Per-target checks ([targets])
        for (const target of targets) {
            if (target.path === undefined) {
                err(target.line, 'Target is missing the required "path" field.');
            }
        }

        // Per-dependency checks
        for (const dep of deps) {
            const isPath     = dep.path     !== undefined;
            const isRegistry = dep.registry !== undefined;
            const isGit      = dep.git      !== undefined;

            if (!isPath && !isRegistry && !isGit) {
                err(dep.line,
                    'Dependency must specify one of: "git" (git dep), "registry" (registry dep), or "path" (path dep).');
                continue;
            }

            if (isGit) {
                const refs = [dep.tag, dep.branch, dep.rev].filter(v => v !== undefined);
                if (refs.length === 0)
                    warn(dep.line, 'Git dependency must specify exactly one of "tag", "branch", or "rev".');
                else if (refs.length > 1)
                    warn(dep.line, 'Git dependency must specify only ONE of "tag", "branch", or "rev".');
            }

            if (isRegistry && dep.version === undefined) {
                warn(dep.line, 'Registry dependency should specify a "version" field.');
            }
        }

        this.collection.set(document.uri, diags);
    }

    clear(uri: vscode.Uri): void {
        this.collection.delete(uri);
    }
}
