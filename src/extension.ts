import * as vscode from 'vscode';
import { FlyDocumentSymbolProvider } from './providers/documentSymbol';
import { FlyHoverProvider }          from './providers/hover';
import { FlyCompletionProvider }     from './providers/completion';
import { FlyDiagnosticsProvider }    from './providers/diagnostics';
import { startLspClient, stopLspClient } from './lsp/client';
import { findFlyInstallations, detectVersion, deriveLspPath } from './compiler/finder';
import { createStatusBar, refresh as refreshStatusBar } from './compiler/statusBar';

const FLY_SELECTOR: vscode.DocumentSelector = { language: 'fly', scheme: 'file' };

export function activate(context: vscode.ExtensionContext): void {
    // ── Compiler selection command ─────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('fly.selectCompiler', async () => {
            const config    = vscode.workspace.getConfiguration('fly');
            const current   = config.get<string>('compilerPath', 'fly');

            // Discover installations in the background while showing the picker
            const installations = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Window, title: 'Searching for Fly installations…' },
                () => findFlyInstallations(),
            );

            type Item = vscode.QuickPickItem & { fsPath?: string };
            const items: Item[] = [
                ...installations.map(i => ({
                    label:       `$(tools) fly ${i.version}`,
                    description: i.path,
                    detail:      i.path === current ? '$(check) Currently selected' : undefined,
                    fsPath:      i.path,
                })),
                {
                    label:       '$(folder-opened) Browse…',
                    description: 'Select a custom fly binary path',
                },
            ];

            const picked = await vscode.window.showQuickPick(items, {
                title:            'Select Fly Compiler',
                placeHolder:      'Choose a Fly installation or browse…',
                matchOnDescription: true,
            });
            if (!picked) return;

            let newPath: string;
            if (picked.fsPath) {
                newPath = picked.fsPath;
            } else {
                const uri = await vscode.window.showOpenDialog({
                    canSelectFiles:   true,
                    canSelectFolders: false,
                    openLabel:        'Select fly binary',
                });
                if (!uri || uri.length === 0) return;
                newPath = uri[0].fsPath;
            }

            // Validate before saving
            const version = await detectVersion(newPath);
            if (!version) {
                vscode.window.showErrorMessage(
                    `"${newPath}" does not appear to be a valid Fly compiler (fly --version failed).`
                );
                return;
            }

            await config.update('compilerPath', newPath, vscode.ConfigurationTarget.Global);
            // Auto-fill lspPath if the user hasn't set it explicitly
            const lspExplicit = config.get<string>('lspPath', '').trim();
            if (!lspExplicit) {
                const lsp = deriveLspPath(newPath);
                await config.update('lspPath', lsp, vscode.ConfigurationTarget.Global);
            }

            void refreshStatusBar(vscode.window.activeTextEditor);
            vscode.window.showInformationMessage(`Fly compiler set to ${newPath} (v${version})`);
        }),
    );

    // ── Status bar (shows active fly version, click to change) ────────────
    createStatusBar(context);

    // ── LSP client (hover on symbols, go-to-definition, find references) ──
    startLspClient(context);

    // ── Document outline (OUTLINE panel + breadcrumbs) ────────────────────
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            FLY_SELECTOR,
            new FlyDocumentSymbolProvider(),
        ),
    );

    // ── Hover documentation for keywords and built-in types ───────────────
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            FLY_SELECTOR,
            new FlyHoverProvider(),
        ),
    );

    // ── Stdlib completion (triggers on '.' and after 'import'/'new') ──────
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            FLY_SELECTOR,
            new FlyCompletionProvider(context.extensionPath),
            '.',   // trigger on dot
        ),
    );

    // ── Live diagnostics via compiler JSON output ─────────────────────────
    const diagCollection = vscode.languages.createDiagnosticCollection('fly');
    context.subscriptions.push(diagCollection);

    const diagProvider = new FlyDiagnosticsProvider(diagCollection);

    // Run on save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (vscode.languages.match(FLY_SELECTOR, doc)) {
                diagProvider.schedule(doc);
            }
        }),
    );

    // Run when opening a .fly file
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (vscode.languages.match(FLY_SELECTOR, doc)) {
                diagProvider.schedule(doc);
            }
        }),
    );

    // Clear diagnostics when closing
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (vscode.languages.match(FLY_SELECTOR, doc)) {
                diagProvider.clear(doc.uri);
            }
        }),
    );

    // Run for any already-open .fly documents
    for (const doc of vscode.workspace.textDocuments) {
        if (vscode.languages.match(FLY_SELECTOR, doc)) {
            diagProvider.schedule(doc);
        }
    }
}

export async function deactivate(): Promise<void> {
    await stopLspClient();
}
