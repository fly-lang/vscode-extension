import * as cp   from 'child_process';
import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';

export interface FlyInstallation {
    /** Absolute path to the fly binary. */
    path: string;
    /** Version string, e.g. "0.12.4". */
    version: string;
}

// Run `fly --version` and return the semver string, or undefined on failure.
export function detectVersion(flyPath: string): Promise<string | undefined> {
    return new Promise(resolve => {
        cp.execFile(flyPath, ['--version'], { timeout: 5_000 }, (_err, stdout, stderr) => {
            const out = (stdout + stderr).trim();
            // "Fly version 0.12.4 (https://flylang.org)"
            const m = out.match(/(\d+\.\d+\.\d+)/);
            resolve(m ? m[1] : undefined);
        });
    });
}

// Return the sibling fly-lsp path for a given fly binary path.
export function deriveLspPath(flyPath: string): string {
    const dir = path.dirname(flyPath);
    const lspName = os.platform() === 'win32' ? 'fly-lsp.exe' : 'fly-lsp';
    return dir === '.' ? lspName : path.join(dir, lspName);
}

// Collect candidate binary paths from PATH + well-known install directories.
function candidatePaths(): string[] {
    const candidates: string[] = [];
    const exe = os.platform() === 'win32' ? 'fly.exe' : 'fly';

    // Entries already on PATH
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
        if (dir) candidates.push(path.join(dir, exe));
    }

    // Common install prefixes
    const prefixes = [
        '/usr/local/bin',
        '/usr/bin',
        '/opt/homebrew/bin',
        path.join(os.homedir(), '.fly', 'bin'),
        path.join(os.homedir(), 'fly',  'bin'),
    ];
    for (const p of prefixes) candidates.push(path.join(p, exe));

    // Deduplicate while preserving order
    return [...new Set(candidates)];
}

// Find all Fly installations reachable from common locations.
export async function findFlyInstallations(): Promise<FlyInstallation[]> {
    const results: FlyInstallation[] = [];
    const seen = new Set<string>();

    for (const p of candidatePaths()) {
        if (seen.has(p)) continue;
        seen.add(p);
        if (!fs.existsSync(p)) continue;
        const version = await detectVersion(p);
        if (version !== undefined) results.push({ path: p, version });
    }

    return results;
}
