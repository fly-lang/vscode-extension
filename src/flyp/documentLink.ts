import * as vscode from 'vscode';

// Matches a git URL inside a double-quoted string value.
// Captures: https://github.com/… or git@github.com:…
const GIT_URL_RE = /"(https?:\/\/[^"]+|git@[^"]+)"/g;

export class FlyTomlDocumentLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const links: vscode.DocumentLink[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            let m: RegExpExecArray | null;
            GIT_URL_RE.lastIndex = 0;
            while ((m = GIT_URL_RE.exec(text)) !== null) {
                const url = m[1];
                // Only linkify https:// URLs (git@ SSH links can't open in browser directly).
                if (!url.startsWith('http')) continue;

                // +1 / -1 to skip the surrounding quotes.
                const start = new vscode.Position(i, m.index + 1);
                const end   = new vscode.Position(i, m.index + 1 + url.length);
                links.push(new vscode.DocumentLink(
                    new vscode.Range(start, end),
                    vscode.Uri.parse(url),
                ));
            }
        }

        return links;
    }
}
