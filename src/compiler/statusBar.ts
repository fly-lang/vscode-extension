import * as vscode from 'vscode';
import { detectVersion } from './finder';
import { getLspClient, resolveLspPath, lspBinaryPresent } from '../lsp/client';

let item:    vscode.StatusBarItem | undefined;
let lspItem: vscode.StatusBarItem | undefined;

// `fly --version` of the configured compiler, asked once per path: the status
// bar refreshes at every editor switch, and spawning the compiler each time
// was the only cost of switching tabs.
let versionFor: string | undefined;
let versionIs:  string | undefined;

async function compilerVersion(flyPath: string, force: boolean): Promise<string | undefined> {
    if (!force && versionFor === flyPath) return versionIs;
    const v = await detectVersion(flyPath);
    versionFor = flyPath;
    versionIs  = v;
    return v;
}

export function createStatusBar(context: vscode.ExtensionContext): void {
    // ── Compiler version item (left, priority 100) ────────────────────────
    item = vscode.window.createStatusBarItem(
        'fly.compilerStatus',
        vscode.StatusBarAlignment.Left,
        100,
    );
    item.command = 'fly.selectCompiler';
    item.tooltip  = 'Select Fly Compiler';
    context.subscriptions.push(item);

    // ── LSP connection state item (left, priority 99) ────────────────────
    lspItem = vscode.window.createStatusBarItem(
        'fly.lspStatus',
        vscode.StatusBarAlignment.Left,
        99,
    );
    lspItem.command = 'fly.restartLsp';
    context.subscriptions.push(lspItem);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(e => void refresh(e)),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('fly.compilerPath') ||
                e.affectsConfiguration('fly.lspPath') ||
                e.affectsConfiguration('fly.enableLsp')) {
                void refresh(vscode.window.activeTextEditor, true);
            }
        }),
    );

    void refresh(vscode.window.activeTextEditor);
}

/**
 * Redraw both items. `force` asks the compiler for its version again (the
 * binary behind the same path may have been replaced by a new install).
 */
export async function refresh(
    editor: vscode.TextEditor | undefined,
    force: boolean = false,
): Promise<void> {
    if (!item || !lspItem) return;

    const isFly = editor?.document.languageId === 'fly';
    if (!isFly) { item.hide(); lspItem.hide(); return; }

    const cfg     = vscode.workspace.getConfiguration('fly');
    const flyPath = cfg.get<string>('compilerPath', 'fly');
    const version = await compilerVersion(flyPath, force);

    // Compiler item
    item.text = version
        ? `$(tools) fly ${version}`
        : `$(warning) fly (not found)`;
    item.show();

    // LSP status item
    const lspPath = resolveLspPath();
    const client  = getLspClient();
    if (!cfg.get<boolean>('enableLsp', true)) {
        lspItem.text    = `$(circle-slash) LSP`;
        lspItem.tooltip = 'Language server disabled (fly.enableLsp = false)';
    } else if (!lspBinaryPresent(lspPath)) {
        lspItem.text    = `$(warning) LSP`;
        lspItem.tooltip = `fly-lsp not found at "${lspPath}"`;
    } else if (!client) {
        lspItem.text    = `$(error) LSP`;
        lspItem.tooltip = 'Language server not running — click to start it';
    } else {
        // vscode-languageclient State: Stopped = 1, Running = 2, Starting = 3.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state: number = (client as any).state ?? 2;
        switch (state) {
        case 3:
            lspItem.text    = `$(loading~spin) LSP`;
            lspItem.tooltip = 'Language server starting…';
            break;
        case 2:
            lspItem.text    = `$(check) LSP`;
            lspItem.tooltip = 'Language server running — click to restart it';
            break;
        default:
            lspItem.text    = `$(error) LSP`;
            lspItem.tooltip = 'Language server stopped — click to restart it '
                            + '(see the "Fly Language Server" output channel)';
        }
    }
    lspItem.show();
}
