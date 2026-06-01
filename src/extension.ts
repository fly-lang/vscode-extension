import * as fs    from 'fs';
import * as vscode from 'vscode';
import { FlyDocumentSymbolProvider } from './providers/documentSymbol';
import { FlyHoverProvider }          from './providers/hover';
import { FlyCompletionProvider }     from './providers/completion';
import { FlyDiagnosticsProvider }    from './providers/diagnostics';
import { startLspClient, stopLspClient } from './lsp/client';
import { findFlyInstallations, detectVersion, deriveLspPath } from './compiler/finder';
import { createStatusBar, refresh as refreshStatusBar } from './compiler/statusBar';
import { resolveFlypPath, resolveFlyTomlDir } from './flyp/finder';
import { FlyTomlCompletionProvider } from './flyp/completions';
import { FlyTomlHoverProvider }      from './flyp/hover';
import { FlyTomlDiagnosticsProvider } from './flyp/diagnostics';

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
            // Always sync lspPath to the new compiler directory so a stale path
            // from a previous installation never persists.
            const derivedLsp = deriveLspPath(newPath);
            await config.update('lspPath', derivedLsp, vscode.ConfigurationTarget.Global);

            if (!fs.existsSync(derivedLsp)) {
                vscode.window.showWarningMessage(
                    `fly-lsp not found at "${derivedLsp}". ` +
                    `LSP features (go-to-definition, hover on symbols) will be disabled. ` +
                    `Set fly.lspPath manually if the server is installed elsewhere.`,
                );
            }

            void refreshStatusBar(vscode.window.activeTextEditor);
            vscode.window.showInformationMessage(`Fly compiler set to ${newPath} (v${version})`);
        }),
    );

    // ── Build command ──────────────────────────────────────────────────────
    let buildTerminal: vscode.Terminal | undefined;
    context.subscriptions.push(
        vscode.commands.registerCommand('fly.buildFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'fly') {
                vscode.window.showWarningMessage('Fly: Open a .fly file to build.');
                return;
            }
            // Save before building so the compiler sees up-to-date source.
            await editor.document.save();

            const cfg          = vscode.workspace.getConfiguration('fly');
            const compiler     = cfg.get<string>('compilerPath', 'fly');
            const extraArgs    = cfg.get<string>('buildArgs', '').trim();
            const filePath     = editor.document.uri.fsPath;
            const quotedFile   = `"${filePath.replace(/"/g, '\\"')}"`;
            const cmd          = [compiler, quotedFile, extraArgs].filter(Boolean).join(' ');

            // Reuse existing terminal if still alive, otherwise create a new one.
            if (!buildTerminal || buildTerminal.exitStatus !== undefined) {
                buildTerminal = vscode.window.createTerminal('Fly Build');
            }
            buildTerminal.show(true);   // true = preserve editor focus
            buildTerminal.sendText(cmd);
        }),
    );

    // ── fly.toml providers ────────────────────────────────────────────────
    const TOML_SEL: vscode.DocumentSelector = { language: 'flyp-toml', scheme: 'file' };

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(TOML_SEL, new FlyTomlCompletionProvider()),
        vscode.languages.registerHoverProvider(TOML_SEL, new FlyTomlHoverProvider()),
    );

    const tomlDiag         = vscode.languages.createDiagnosticCollection('flyp-toml');
    const tomlDiagProvider = new FlyTomlDiagnosticsProvider(tomlDiag);
    context.subscriptions.push(tomlDiag);

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'flyp-toml') tomlDiagProvider.run(doc);
        }),
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === 'flyp-toml') tomlDiagProvider.run(doc);
        }),
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.languageId === 'flyp-toml') tomlDiagProvider.clear(doc.uri);
        }),
    );
    for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId === 'flyp-toml') tomlDiagProvider.run(doc);
    }

    // ── flyp commands ─────────────────────────────────────────────────────
    let flypTerminal: vscode.Terminal | undefined;

    function runFlyp(args: string[]): void {
        const projectDir = resolveFlyTomlDir();
        if (!projectDir) {
            vscode.window.showWarningMessage('Flyp: could not find fly.toml in this workspace.');
            return;
        }
        const flyp = resolveFlypPath();
        const cmd  = [flyp, ...args].join(' ');

        if (!flypTerminal || flypTerminal.exitStatus !== undefined) {
            flypTerminal = vscode.window.createTerminal('Flyp');
        }
        flypTerminal.show(true);
        flypTerminal.sendText(`cd "${projectDir.replace(/"/g, '\\"')}" && ${cmd}`);
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('fly.flypBuild', () => {
            const cfg   = vscode.workspace.getConfiguration('fly');
            const extra = cfg.get<string>('flypBuildArgs', '').trim();
            runFlyp(extra ? ['build', ...extra.split(/\s+/)] : ['build']);
        }),
        vscode.commands.registerCommand('fly.flypRun',  () => runFlyp(['run'])),
        vscode.commands.registerCommand('fly.flypTest', () => runFlyp(['test'])),
        vscode.commands.registerCommand('fly.flypLock', () => runFlyp(['lock'])),
        vscode.commands.registerCommand('fly.flypAdd',  async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Dependency name (e.g. my-lib)',
                validateInput: v => /^[a-z0-9_-]+$/.test(v) ? undefined : 'Name must match [a-z0-9_-]+',
            });
            if (!name) return;

            const gitUrl = await vscode.window.showInputBox({
                prompt: 'Git repository URL (e.g. https://github.com/user/repo.git)',
                validateInput: v => v.startsWith('http') || v.startsWith('git@') ? undefined : 'Enter a valid git URL',
            });
            if (!gitUrl) return;

            const refType = await vscode.window.showQuickPick(
                ['tag', 'branch', 'rev'],
                { placeHolder: 'Reference type' },
            );
            if (!refType) return;

            const refLabel = refType === 'tag' ? 'Tag (e.g. v1.0.0)' :
                             refType === 'branch' ? 'Branch name (e.g. main)' :
                             'Commit hash (40 characters)';
            const refValue = await vscode.window.showInputBox({ prompt: refLabel });
            if (!refValue) return;

            runFlyp(['add', name, '--git', gitUrl, `--${refType}`, refValue]);
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
