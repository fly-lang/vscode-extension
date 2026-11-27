import * as vscode from 'vscode';

/**
 * Every command of the extension runs the toolchain as a TASK with a
 * ProcessExecution: the executable and its arguments go to the OS as an argv,
 * with no shell in between. The earlier `sendText("cd … && fly …")` depended on
 * the user's terminal shell — Windows PowerShell 5.1 has no `&&`, and no
 * PowerShell runs a quoted path as a command — and on hand-made quoting.
 * A task also feeds the `$fly` problem matcher and reports its exit code.
 */
export function flyTask(
    label: string,
    kind: string,
    exe: string,
    args: string[],
    cwd: string | undefined,
    opts: { matcher?: boolean; focus?: boolean; dedicated?: boolean } = {},
): vscode.Task {
    const task = new vscode.Task(
        { type: 'fly', task: kind },
        vscode.TaskScope.Workspace,
        label,
        'fly',
        new vscode.ProcessExecution(exe, args, cwd ? { cwd } : undefined),
        opts.matcher === false ? [] : '$fly',
    );
    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel:  opts.dedicated ? vscode.TaskPanelKind.Dedicated : vscode.TaskPanelKind.Shared,
        focus:  opts.focus ?? false,
        clear:  true,
    };
    return task;
}

/**
 * Run a task to its end. Resolves with the process exit code, or undefined
 * when the process never started (executable not found) or the task was
 * terminated.
 */
export async function runTask(task: vscode.Task): Promise<number | undefined> {
    let code: number | undefined;
    const exec = await vscode.tasks.executeTask(task);
    return new Promise(resolve => {
        const onProc = vscode.tasks.onDidEndTaskProcess(e => {
            if (e.execution === exec) code = e.exitCode;
        });
        const onEnd = vscode.tasks.onDidEndTask(e => {
            if (e.execution !== exec) return;
            onProc.dispose();
            onEnd.dispose();
            resolve(code);
        });
    });
}
