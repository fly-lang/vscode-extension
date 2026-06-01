import * as path from 'path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

// Derive the fly-lsp path from settings.
// If fly.lspPath is set explicitly, use it directly.
// Otherwise look for fly-lsp in the same directory as fly.compilerPath.
function resolveLspPath(): string {
    const cfg = vscode.workspace.getConfiguration('fly');
    const explicit = cfg.get<string>('lspPath', '').trim();
    if (explicit) return explicit;

    const compilerPath = cfg.get<string>('compilerPath', 'fly');
    const dir = path.dirname(compilerPath);
    // dirname('fly') === '.'  → compiler is on PATH, assume lsp is too
    return dir === '.' ? 'fly-lsp' : path.join(dir, 'fly-lsp');
}

export function startLspClient(context: vscode.ExtensionContext): void {
    const cfg = vscode.workspace.getConfiguration('fly');
    if (!cfg.get<boolean>('enableLsp', true)) return;

    const serverPath = resolveLspPath();

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

    client = new LanguageClient(
        'fly-lsp',
        'Fly Language Server',
        serverOptions,
        clientOptions,
    );

    // LanguageClient itself is Disposable in v9; start() returns Promise<void>
    context.subscriptions.push(client);
    void client.start();
}

export function stopLspClient(): Thenable<void> | undefined {
    const c = client;
    client = undefined;
    return c?.stop();
}
