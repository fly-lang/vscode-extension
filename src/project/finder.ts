import * as fs     from 'fs';
import * as os     from 'os';
import * as path   from 'path';
import * as vscode from 'vscode';

/**
 * The manifest file names the driver accepts, in the order it tries them
 * (`Manifest.fly` is what `fly init` writes; the lowercase spelling is a
 * fallback). On Linux the case matters, so both are checked explicitly.
 */
export const MANIFEST_NAMES = ['Manifest.fly', 'manifest.fly'];

/** Glob selecting a project manifest, for DocumentSelector patterns. */
export const MANIFEST_GLOB = '**/{Manifest,manifest}.fly';

/** True when this document is a project manifest (by file name). */
export function isManifest(document: vscode.TextDocument): boolean {
    return MANIFEST_NAMES.includes(path.basename(document.uri.fsPath));
}

/**
 * Resolve the `fly` binary. There is no separate package-manager binary any
 * more: the compiler IS the package manager (`fly build`, `fly run`, …), so
 * this is just `fly.compilerPath`.
 */
export function resolveFlyPath(): string {
    const cfg      = vscode.workspace.getConfiguration('fly');
    const explicit = cfg.get<string>('compilerPath', '').trim();
    if (explicit) return explicit;
    return os.platform() === 'win32' ? 'fly.exe' : 'fly';
}

/**
 * Walk up from startDir looking for a manifest.
 * Returns the directory containing it, or undefined.
 *
 * The driver itself only looks in the CURRENT directory, so every command is
 * run with a `cd` into the directory found here.
 */
export function findManifestDir(startDir: string): string | undefined {
    let dir = startDir;
    for (;;) {
        for (const name of MANIFEST_NAMES) {
            if (fs.existsSync(path.join(dir, name))) return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) return undefined;   // reached the filesystem root
        dir = parent;
    }
}

/** Best-effort project root: manifest dir above the active file > workspace root. */
export function resolveManifestDir(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const found = findManifestDir(path.dirname(editor.document.uri.fsPath));
        if (found) return found;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        const found = findManifestDir(folders[0].uri.fsPath);
        if (found) return found;
    }
    return undefined;
}
