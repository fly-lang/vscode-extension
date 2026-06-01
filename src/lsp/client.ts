import * as path   from 'path';
import * as vscode from 'vscode';
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

function resolveLspPath(): string {
    const cfg = vscode.workspace.getConfiguration('fly');
    const explicit = cfg.get<string>('lspPath', '').trim();
    if (explicit) return explicit;

    const compilerPath = cfg.get<string>('compilerPath', 'fly');
    const dir = path.dirname(compilerPath);
    return dir === '.' ? 'fly-lsp' : path.join(dir, 'fly-lsp');
}

export function startLspClient(context: vscode.ExtensionContext): void {
    const cfg = vscode.workspace.getConfiguration('fly');
    if (!cfg.get<boolean>('enableLsp', true)) return;

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

    // LanguageClient is Disposable in v9; start() returns Promise<void>
    context.subscriptions.push(client);
    void client.start();
}

export function stopLspClient(): Thenable<void> | undefined {
    const c = client;
    client = undefined;
    return c?.stop();
}
