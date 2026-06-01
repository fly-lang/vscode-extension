import * as vscode from 'vscode';
import { detectVersion } from './finder';

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
            if (e.affectsConfiguration('fly.compilerPath')) {
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

    const flyPath = vscode.workspace.getConfiguration('fly').get<string>('compilerPath', 'fly');
    const version = await detectVersion(flyPath);

    item.text    = version ? `$(tools) fly ${version}` : `$(warning) fly (not found)`;
    item.show();
}
