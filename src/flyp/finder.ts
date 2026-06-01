import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/** Resolve the flyp binary path from settings or next to fly.compilerPath. */
export function resolveFlypPath(): string {
    const cfg      = vscode.workspace.getConfiguration('fly');
    const explicit = cfg.get<string>('flypPath', '').trim();
    if (explicit) return explicit;

    const compilerPath = cfg.get<string>('compilerPath', 'fly');
    const dir          = path.dirname(compilerPath);
    const bin          = os.platform() === 'win32' ? 'flyp.exe' : 'flyp';
    return dir === '.' ? bin : path.join(dir, bin);
}

/**
 * Walk up from startDir looking for fly.toml, mirroring the logic in
 * flyp/cli/Commands.cpp find_project_root().
 * Returns the directory containing fly.toml, or undefined if not found.
 */
export function findFlyTomlDir(startDir: string): string | undefined {
    let dir = startDir;
    while (true) {
        if (fs.existsSync(path.join(dir, 'fly.toml'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return undefined;   // reached filesystem root
        dir = parent;
    }
}

/** Best-effort root for flyp commands: manifest dir > workspace root > cwd. */
export function resolveFlyTomlDir(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const fileDir = path.dirname(editor.document.uri.fsPath);
        const found   = findFlyTomlDir(fileDir);
        if (found) return found;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        const found = findFlyTomlDir(folders[0].uri.fsPath);
        if (found) return found;
    }
    return undefined;
}
