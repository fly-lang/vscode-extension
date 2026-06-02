import * as fs   from 'fs';
import * as vscode from 'vscode';
import { detectVersion, deriveLspPath } from './finder';
import { getLspClient } from '../lsp/client';

let item:    vscode.StatusBarItem | undefined;
let lspItem: vscode.StatusBarItem | undefined;

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
    lspItem.command = 'fly.selectCompiler';
    lspItem.tooltip  = 'Fly Language Server status';
    context.subscriptions.push(lspItem);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(e => void refresh(e)),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('fly.compilerPath') ||
                e.affectsConfiguration('fly.lspPath')) {
                void refresh(vscode.window.activeTextEditor);
            }
        }),
    );

    void refresh(vscode.window.activeTextEditor);
}

export async function refresh(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!item || !lspItem) return;

    const isFly = editor?.document.languageId === 'fly';
    if (!isFly) { item.hide(); lspItem.hide(); return; }

    const cfg     = vscode.workspace.getConfiguration('fly');
    const flyPath = cfg.get<string>('compilerPath', 'fly');
    const lspPath = cfg.get<string>('lspPath', '').trim() || deriveLspPath(flyPath);
    const version = await detectVersion(flyPath);
    const lspOk   = fs.existsSync(lspPath);

    // Compiler item
    item.text = version
        ? `$(tools) fly ${version}`
        : `$(warning) fly (not found)`;
    item.show();

    // LSP status item — reads LanguageClient state if available.
    const client = getLspClient();
    if (!lspOk) {
        lspItem.text    = `$(warning) LSP`;
        lspItem.tooltip = `fly-lsp not found at "${lspPath}"`;
    } else if (!client) {
        lspItem.text    = `$(circle-slash) LSP`;
        lspItem.tooltip = 'Language server disabled (fly.enableLsp = false)';
    } else {
        // vscode-languageclient v9 exposes state via client.state
        // State: 1=Starting, 2=Running, 3=Stopping, 4=Stopped
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const state: number = (client as any).state ?? 2;
            switch (state) {
            case 1:
                lspItem.text    = `$(loading~spin) LSP`;
                lspItem.tooltip = 'Language server starting…';
                break;
            case 2:
                lspItem.text    = `$(check) LSP`;
                lspItem.tooltip = 'Language server running';
                break;
            case 3:
                lspItem.text    = `$(loading~spin) LSP`;
                lspItem.tooltip = 'Language server stopping…';
                break;
            default:
                lspItem.text    = `$(error) LSP`;
                lspItem.tooltip = 'Language server stopped';
            }
        } catch {
            lspItem.text    = `$(check) LSP`;
            lspItem.tooltip = 'Language server active';
        }
    }
    lspItem.show();
}
