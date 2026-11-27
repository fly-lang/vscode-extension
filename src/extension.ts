import * as fs    from 'fs';
import * as os    from 'os';
import * as path  from 'path';
import * as vscode from 'vscode';
import { FlyDocumentSymbolProvider } from './providers/documentSymbol';
import { FlyHoverProvider }          from './providers/hover';
import { FlyCompletionProvider }     from './providers/completion';
import { FlyDiagnosticsProvider }    from './providers/diagnostics';
import { FlyFormattingProvider }     from './providers/format';
import {
    startLspClient, stopLspClient, restartLspClient, setLspStateListener,
} from './lsp/client';
import { findFlyInstallations, detectVersion, deriveLspPath, deriveDapPath } from './compiler/finder';
import { createStatusBar, refresh as refreshStatusBar } from './compiler/statusBar';
import { flyTask, runTask } from './compiler/tasks';
import {
    resolveFlyPath, resolveManifestDir, readManifest, isManifest, MANIFEST_GLOB,
} from './project/finder';
import { ManifestCompletionProvider }   from './project/completions';
import { ManifestHoverProvider }        from './project/hover';
import { ManifestDiagnosticsProvider }  from './project/diagnostics';
import { ManifestCodeLensProvider }     from './project/codeLens';
import { ManifestDocumentLinkProvider } from './project/documentLink';
// Pure arg/path logic lives in core/toolchain (unit-tested without vscode).
import {
    singleFileArgs, exeName, profileArgs, splitArgs, manifestProfiles,
} from './core/toolchain';

const FLY_SELECTOR: vscode.DocumentSelector = { language: 'fly', scheme: 'file' };

// A manifest IS a .fly file, so it is selected by name rather than by language.
const MANIFEST_SELECTOR: vscode.DocumentSelector = {
    language: 'fly', scheme: 'file', pattern: MANIFEST_GLOB,
};

const NO_MANIFEST =
    'Fly: no Manifest.fly found in this workspace. Run "Fly: Init Project" to create one.';

/** The active .fly editor, saved — or undefined after telling the user why not. */
async function activeFlyFile(verb: string): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'fly') {
        vscode.window.showWarningMessage(`Fly: Open a .fly file to ${verb}.`);
        return undefined;
    }
    await editor.document.save();
    return editor.document.uri.fsPath;
}

/** Where a single-file command runs: the file's workspace folder, else its directory. */
function fileCwd(filePath: string): string {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    return folder ? folder.uri.fsPath : path.dirname(filePath);
}

/** The executable a single-file Run / Debug builds, in the OS temp directory. */
function tempExe(filePath: string): string {
    return exeName(path.join(os.tmpdir(), path.basename(filePath, '.fly')));
}

export function activate(context: vscode.ExtensionContext): void {
    const flyConfig = () => vscode.workspace.getConfiguration('fly');

    // ── Compiler selection command ─────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('fly.selectCompiler', async () => {
            const config    = flyConfig();
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

            // The configuration listener below restarts the language server
            // and redraws the status bar.
            vscode.window.showInformationMessage(`Fly compiler set to ${newPath} (v${version})`);
        }),
    );

    // ── Build File ─────────────────────────────────────────────────────────
    // A task, so errors appear in the Problems panel via the $fly matcher.
    context.subscriptions.push(
        vscode.commands.registerCommand('fly.buildFile', async () => {
            const filePath = await activeFlyFile('build');
            if (!filePath) return;

            const extra = splitArgs(flyConfig().get<string>('buildArgs', ''));
            await vscode.tasks.executeTask(flyTask(
                'Build File', 'build', resolveFlyPath(),
                [...singleFileArgs(filePath), ...extra], fileCwd(filePath)));
        }),
    );

    // ── Run File (compile, then run only if the compile succeeded) ────────
    context.subscriptions.push(
        vscode.commands.registerCommand('fly.runFile', async () => {
            const filePath = await activeFlyFile('run');
            if (!filePath) return;

            // Output binary in the system temp dir to avoid polluting the project.
            const exe  = tempExe(filePath);
            const cwd  = fileCwd(filePath);
            const code = await runTask(flyTask(
                'Build File', 'build', resolveFlyPath(),
                [...singleFileArgs(filePath), '-o', exe], cwd));
            if (code !== 0) return;

            const args = splitArgs(flyConfig().get<string>('runArgs', ''));
            await vscode.tasks.executeTask(flyTask(
                `Run ${path.basename(filePath)}`, 'run', exe, args, cwd,
                { matcher: false, focus: true, dedicated: true }));
        }),
    );

    // ── Manifest.fly providers ────────────────────────────────────────────
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(MANIFEST_SELECTOR, new ManifestCompletionProvider()),
        vscode.languages.registerHoverProvider(MANIFEST_SELECTOR, new ManifestHoverProvider()),
        vscode.languages.registerCodeLensProvider(MANIFEST_SELECTOR, new ManifestCodeLensProvider()),
        vscode.languages.registerDocumentLinkProvider(MANIFEST_SELECTOR, new ManifestDocumentLinkProvider()),
    );

    const manifestDiag         = vscode.languages.createDiagnosticCollection('fly-manifest');
    const manifestDiagProvider = new ManifestDiagnosticsProvider(manifestDiag);
    context.subscriptions.push(manifestDiag);

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (isManifest(doc)) manifestDiagProvider.run(doc);
        }),
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (isManifest(doc)) manifestDiagProvider.run(doc);
        }),
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (isManifest(doc)) manifestDiagProvider.clear(doc.uri);
        }),
    );
    for (const doc of vscode.workspace.textDocuments) {
        if (isManifest(doc)) manifestDiagProvider.run(doc);
    }

    // ── Project commands (fly build / run / test / …) ─────────────────────
    //
    // The compiler IS the package manager: there is no separate binary, and the
    // subcommands below are exactly the ones the self-hosted driver implements.
    // Anything else it rejects as an unknown argument, so nothing here offers a
    // button that cannot work.
    //
    // The driver reads the manifest from the CURRENT directory only, so every
    // task runs with the manifest's directory as its working directory.
    function runFly(label: string, args: string[], opts: { focus?: boolean } = {}): void {
        const projectDir = resolveManifestDir();
        if (!projectDir) {
            vscode.window.showWarningMessage(NO_MANIFEST);
            return;
        }
        void vscode.tasks.executeTask(flyTask(
            label, `project-${args[0]}`, resolveFlyPath(), args, projectDir,
            { focus: opts.focus }));
    }

    /** `--release` / `--profile <name>` for the selected profile; none for debug. */
    function selectedProfile(): string[] {
        return profileArgs(flyConfig().get<string>('projectProfile', ''));
    }

    const DEP_NAME = (v: string) => /^[a-z0-9_-]+$/.test(v) ? undefined : 'Name must match [a-z0-9_-]+';

    context.subscriptions.push(
        vscode.commands.registerCommand('fly.pkgBuild', () => {
            const cfg   = flyConfig();
            const force = cfg.get<boolean>('projectForceRebuild', false);
            // --force bypasses the per-target fingerprint cache; no clean needed.
            runFly('Build Project', [
                'build', ...selectedProfile(), ...(force ? ['--force'] : []),
                ...splitArgs(cfg.get<string>('projectBuildArgs', '')),
            ]);
        }),
        vscode.commands.registerCommand('fly.pkgRun',
            () => runFly('Run Project', ['run', ...selectedProfile()], { focus: true })),
        vscode.commands.registerCommand('fly.pkgTest',
            () => runFly('Test Project', ['test', ...selectedProfile()])),
        vscode.commands.registerCommand('fly.pkgClean',
            () => runFly('Clean Project', ['clean', ...selectedProfile()])),
        vscode.commands.registerCommand('fly.pkgLock',
            () => runFly('Lock', ['lock'])),
        vscode.commands.registerCommand('fly.pkgInit', async () => {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders || folders.length === 0) {
                vscode.window.showWarningMessage('Fly: open a folder first.');
                return;
            }
            const root = folders[0].uri.fsPath;
            const name = await vscode.window.showInputBox({
                prompt: 'Package name',
                value: path.basename(root),
                validateInput: DEP_NAME,
            });
            if (!name) return;
            const version = await vscode.window.showInputBox({
                prompt: 'Package version', value: '0.1.0',
                validateInput: v => /^\d+\.\d+\.\d+$/.test(v) ? undefined : 'Use MAJOR.MINOR.PATCH',
            });
            if (!version) return;

            void vscode.tasks.executeTask(flyTask(
                'Init Project', 'project-init', resolveFlyPath(),
                ['init', '--name', name, '--version', version], root));
        }),
        vscode.commands.registerCommand('fly.pkgRemove', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Dependency to remove', validateInput: DEP_NAME,
            });
            if (!name) return;
            runFly('Remove Dependency', ['remove', name]);
        }),
        vscode.commands.registerCommand('fly.pkgWhy', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Explain why this package is in the dependency graph',
                validateInput: DEP_NAME,
            });
            if (!name) return;
            runFly('Why', ['why', name]);
        }),
        vscode.commands.registerCommand('fly.pkgSelectProfile', async () => {
            const current = flyConfig().get<string>('projectProfile', '').trim() || 'debug';

            // debug and release are built in; the manifest's `profiles` field
            // can redefine them and declare any other name.
            const projectDir = resolveManifestDir();
            const names = manifestProfiles(projectDir ? readManifest(projectDir) : '');
            if (!names.includes(current)) names.push(current);

            const items = names.map(p => ({
                label:       p,
                description: p === current ? '$(check) active' : undefined,
                detail:      p === 'debug'   ? 'fly build' :
                             p === 'release' ? 'fly build --release' :
                                               `fly build --profile ${p}`,
            }));

            const picked = await vscode.window.showQuickPick(items, {
                title:       'Fly: Select Build Profile',
                placeHolder: 'Profile used by Fly: Build / Run / Test / Clean Project',
            });
            if (!picked) return;

            const value = picked.label === 'debug' ? '' : picked.label;
            await flyConfig().update('projectProfile', value, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Fly profile set to "${picked.label}".`);
        }),
        // Used by the CodeLens actions in Manifest.fly (Why / Remove dependency).
        vscode.commands.registerCommand('fly.pkgRunCmd',
            (args: string[]) => runFly(`fly ${args[0]}`, args)),
        // `fly add` writes a GIT dependency: it requires exactly one of
        // --tag/--branch/--rev and takes no version, so a registry dependency is
        // added by editing `dependencies` in the manifest directly.
        vscode.commands.registerCommand('fly.pkgAdd',  async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Dependency name (e.g. my-lib)', validateInput: DEP_NAME,
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

            const kind = await vscode.window.showQuickPick(
                [
                    { label: 'dependency',     description: 'runtime dependency' },
                    { label: 'dev-dependency', description: 'development and testing only' },
                ],
                { placeHolder: 'Dependency kind' },
            );
            if (!kind) return;

            runFly('Add Dependency', ['add', name, '--git', gitUrl, `--${refType}`, refValue,
                    ...(kind.label === 'dev-dependency' ? ['--dev'] : [])]);
        }),
    );

    // ── Status bar (shows active fly version, click to change) ────────────
    createStatusBar(context);

    // ── LSP client (hover on symbols, go-to-definition, find references) ──
    setLspStateListener(() => void refreshStatusBar(vscode.window.activeTextEditor));
    startLspClient();
    context.subscriptions.push(
        vscode.commands.registerCommand('fly.restartLsp', () => restartLspClient()),
        // A new compiler (or server path) means a new server: the one running
        // belongs to the toolchain that was selected before.
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('fly.compilerPath') ||
                e.affectsConfiguration('fly.lspPath')) {
                void restartLspClient();
            }
            if (e.affectsConfiguration('fly.enableLsp')) {
                // The fallback providers below are registered once, by the value
                // this setting had at activation.
                void vscode.window.showInformationMessage(
                    'Fly: reload the window to apply the fly.enableLsp change.',
                    'Reload Window',
                ).then(choice => {
                    if (choice) void vscode.commands.executeCommand('workbench.action.reloadWindow');
                });
            }
        }),
    );

    // Whether the language server owns the features it implements. Everything
    // below that DUPLICATES one of them registers only when it is off.
    const lspActive = flyConfig().get<boolean>('enableLsp', true);

    // ── Document outline (OUTLINE panel + breadcrumbs) ────────────────────
    //
    // FALLBACK ONLY: fly-lsp answers textDocument/documentSymbol from the real
    // AST, and VS Code shows every provider's symbols as its own group — with
    // both registered the outline listed each declaration twice. The regex
    // provider stays for editing without the server.
    if (!lspActive) {
        context.subscriptions.push(
            vscode.languages.registerDocumentSymbolProvider(
                FLY_SELECTOR,
                new FlyDocumentSymbolProvider(),
            ),
        );
    }

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

    // ── Format Document (fly fmt) ─────────────────────────────────────────
    // The language server has no formatting provider: this is the only one.
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            FLY_SELECTOR,
            new FlyFormattingProvider(),
        ),
    );

    // ── Live diagnostics via compiler JSON output ─────────────────────────
    //
    // FALLBACK ONLY: when the language server is enabled it is the single
    // source of diagnostics (it compiles the project and publishes per file),
    // and running the compiler here too would duplicate every squiggle and
    // double the work. Same policy as vscode-go, which disables its legacy
    // buildOnSave/vetOnSave diagnostics while gopls is active.
    if (!lspActive) {
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

    // ── Workspace-wide diagnostics ─────────────────────────────────────────
    // Scan all .fly files at startup so the Problems panel reflects the full
    // project, not just files the user has explicitly opened.
    const runWorkspaceScan = async (): Promise<void> => {
        const cfg = flyConfig();
        if (!cfg.get<boolean>('enableWorkspaceDiagnostics', true)) return;
        const uris = await vscode.workspace.findFiles('**/*.fly', '**/node_modules/**');
        const openPaths = new Set(
            vscode.workspace.textDocuments.map(d => d.uri.fsPath)
        );
        for (const uri of uris) {
            if (!openPaths.has(uri.fsPath)) {
                diagProvider.runForPath(uri.fsPath);
            }
        }
    };
    void runWorkspaceScan();

    // Re-run diagnostics when new .fly files appear in the workspace.
    const flyWatcher = vscode.workspace.createFileSystemWatcher('**/*.fly');
    context.subscriptions.push(flyWatcher);
    context.subscriptions.push(
        flyWatcher.onDidCreate(uri => diagProvider.runForPath(uri.fsPath)),
    );
    }   // end of the !lspActive fallback diagnostics

    // ── Debug adapter: lldb-dap bundled with the Fly toolchain ────────────
    // The toolchain ships lldb-dap next to fly in bin/, so the adapter is
    // always the one matching the installed compiler — no third-party
    // debugger extension needed.
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory('fly', {
            createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
                const dap = deriveDapPath(resolveFlyPath());
                if (path.dirname(dap) !== '.' && !fs.existsSync(dap)) {
                    void vscode.window.showErrorMessage(
                        `Fly: lldb-dap not found at "${dap}". It ships with the Fly ` +
                        `toolchain (bin/lldb-dap) — check fly.compilerPath, or run ` +
                        `"Fly: Select Compiler".`,
                    );
                    return undefined;
                }
                return new vscode.DebugAdapterExecutable(dap, []);
            },
        }),
    );

    // ── Debug File (compile with debug info, launch via lldb-dap) ─────────
    context.subscriptions.push(
        vscode.commands.registerCommand('fly.debugFile', async () => {
            const filePath = await activeFlyFile('debug');
            if (!filePath) return;

            const cfg       = flyConfig();
            const debugArgs = splitArgs(cfg.get<string>('debugBuildArgs', '--debug-symbols'));
            const exe       = tempExe(filePath);

            // Compile as a task — errors land in the Problems panel and the
            // extension host is not blocked — and launch only on success.
            const code = await runTask(flyTask(
                'Build File (debug)', 'build-debug', resolveFlyPath(),
                [...singleFileArgs(filePath), ...debugArgs, '-o', exe], fileCwd(filePath)));
            if (code !== 0) return;

            await vscode.debug.startDebugging(undefined, {
                type:    'fly',
                request: 'launch',
                name:    'Fly Debug',
                program: exe,
                args:    splitArgs(cfg.get<string>('runArgs', '')),
                cwd:     fileCwd(filePath),
            });
        }),
    );
}

export async function deactivate(): Promise<void> {
    await stopLspClient();
}
