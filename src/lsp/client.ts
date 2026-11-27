import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { deriveLspPath } from '../compiler/finder';
// Type-only import: erased at compile time, generates NO runtime require().
// The actual module is loaded lazily inside startLspClient() so a missing
// vscode-languageclient package never prevents the rest of the extension
// (commands, status bar, providers) from loading.
import type {
    LanguageClient as LCType,
    LanguageClientOptions,
    ServerOptions,
    TransportKind as TKType,
} from 'vscode-languageclient/node';

let client: LCType | undefined;
let stateListener: (() => void) | undefined;

/** Called whenever the client starts, stops or changes state (status bar). */
export function setLspStateListener(fn: () => void): void {
    stateListener = fn;
}

/** The fly-lsp binary: fly.lspPath, else the one next to fly.compilerPath. */
export function resolveLspPath(): string {
    const cfg = vscode.workspace.getConfiguration('fly');
    const explicit = cfg.get<string>('lspPath', '').trim();
    if (explicit) return explicit;

    const compilerPath = cfg.get<string>('compilerPath', 'fly');
    // Shared helper: appends .exe on Windows and handles a bare "fly" path.
    return deriveLspPath(compilerPath);
}

/**
 * False only when the server is named by a path that does not exist. A bare
 * name ("fly-lsp") resolves through PATH, which only spawning it can tell.
 */
export function lspBinaryPresent(serverPath: string): boolean {
    if (path.basename(serverPath) === serverPath) return true;
    return fs.existsSync(serverPath);
}

export function startLspClient(): void {
    const cfg = vscode.workspace.getConfiguration('fly');
    if (!cfg.get<boolean>('enableLsp', true)) return;
    if (client) return;

    const serverPath = resolveLspPath();
    // A missing binary is a configuration state, not a crash: the status bar
    // says so, and starting the client anyway would only raise an error popup
    // at every window load.
    if (!lspBinaryPresent(serverPath)) return;

    let LanguageClient: typeof LCType;
    let TransportKind: typeof TKType;
    try {
        // Lazy require: deferred until this function runs so a missing module
        // only disables LSP features, not the entire extension.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        ({ LanguageClient, TransportKind } =
            require('vscode-languageclient/node') as typeof import('vscode-languageclient/node'));
    } catch {
        vscode.window.showWarningMessage(
            'Fly: vscode-languageclient module not found — LSP features disabled. ' +
            'Run `npm install` in the extension directory.',
        );
        return;
    }

    const serverOptions: ServerOptions = {
        run:   { command: serverPath, transport: TransportKind.stdio },
        debug: { command: serverPath, transport: TransportKind.stdio },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'fly' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.fly'),
        },
        outputChannelName: 'Fly Language Server',
    };

    const c = new LanguageClient(
        'fly-lsp',
        'Fly Language Server',
        serverOptions,
        clientOptions,
    );
    client = c;
    c.onDidChangeState(() => stateListener?.());
    void c.start().then(() => stateListener?.(), () => stateListener?.());
    stateListener?.();
}

export async function stopLspClient(): Promise<void> {
    const c = client;
    client = undefined;
    if (!c) return;
    try {
        await c.stop();
    } catch {
        // A server that already died cannot be stopped; nothing to do.
    }
    try {
        await c.dispose();
    } catch {
        // idem
    }
    stateListener?.();
}

// Restarts run one after the other: selecting a compiler changes two settings
// in a row, and two overlapping stop/start pairs would leave two servers.
let restarting: Promise<void> = Promise.resolve();

/** Stop the server and start it again with the current settings. */
export function restartLspClient(): Promise<void> {
    restarting = restarting.then(async () => {
        await stopLspClient();
        startLspClient();
    });
    return restarting;
}

/** Returns the active LanguageClient, or undefined if not started. */
export function getLspClient(): LCType | undefined {
    return client;
}
