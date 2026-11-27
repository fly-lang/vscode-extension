import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveFlyPath } from '../project/finder';

/**
 * Format Document through the toolchain's own formatter, `fly fmt`.
 *
 * `fly fmt <file>` rewrites the file in place, so the buffer is formatted on a
 * copy in the OS temp directory and read back: the document on disk is never
 * touched, unsaved edits are formatted too, and the result comes back as an
 * ordinary edit (undoable, and usable by Format On Save).
 *
 * The formatter only moves whitespace and it refuses a source that does not
 * parse (exit code 2, file left as is) — in that case nothing is edited.
 */
export class FlyFormattingProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
        const fly  = resolveFlyPath();
        const text = document.getText();

        let dir: string;
        let tmp: string;
        try {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fly-fmt-'));
            tmp = path.join(dir, path.basename(document.uri.fsPath) || 'buffer.fly');
            fs.writeFileSync(tmp, text, 'utf8');
        } catch {
            return Promise.resolve([]);
        }

        const cleanup = (): void => {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
        };

        return new Promise(resolve => {
            cp.execFile(fly, ['fmt', tmp], { timeout: 15_000, cwd: dir }, (err, _stdout, stderr) => {
                let formatted: string | undefined;
                try { formatted = fs.readFileSync(tmp, 'utf8'); } catch { /* reported below */ }
                cleanup();

                if (err) {
                    // Exit code 2: the source does not parse. Anything else: no
                    // compiler, or one without `fly fmt`.
                    const code = (err as { code?: number | string }).code;
                    const why = code === 2
                        ? 'the file does not parse — fix the syntax errors first'
                        : (String(stderr).trim().split(/\r?\n/)[0] || err.message);
                    vscode.window.setStatusBarMessage(`$(warning) fly fmt: ${why}`, 6000);
                    resolve([]);
                    return;
                }
                if (formatted === undefined || formatted === text) {
                    resolve([]);
                    return;
                }
                const whole = new vscode.Range(
                    document.positionAt(0), document.positionAt(text.length));
                resolve([vscode.TextEdit.replace(whole, formatted)]);
            });
        });
    }
}
