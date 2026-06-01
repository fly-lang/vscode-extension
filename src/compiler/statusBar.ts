import * as fs   from 'fs';
import * as vscode from 'vscode';
import { detectVersion, deriveLspPath } from './finder';

let item: vscode.StatusBarItem | undefined;

export function createStatusBar(context: vscode.ExtensionContext): void {
    item = vscode.window.createStatusBarItem(
        'fly.compilerStatus',
        vscode.StatusBarAlignment.Left,
        100,
    );
    item.command = 'fly.selectCompiler';
    item.tooltip  = 'Select Fly Compiler';
    context.subscriptions.push(item);

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
    if (!item) return;

    const isFly = editor?.document.languageId === 'fly';
    if (!isFly) { item.hide(); return; }

    const cfg     = vscode.workspace.getConfiguration('fly');
    const flyPath = cfg.get<string>('compilerPath', 'fly');
    const lspPath = cfg.get<string>('lspPath', '').trim() || deriveLspPath(flyPath);
    const version = await detectVersion(flyPath);
    const lspOk   = fs.existsSync(lspPath);

    item.text = version
        ? `$(tools) fly ${version}${lspOk ? '' : '  $(warning) no lsp'}`
        : `$(warning) fly (not found)`;
    item.show();
}
