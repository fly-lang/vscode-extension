import * as vscode from 'vscode';

// A git URL inside a double-quoted string value.
const GIT_URL_RE = /"(https?:\/\/[^"]+|git@[^"]+)"/g;

export class ManifestDocumentLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const links: vscode.DocumentLink[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            let m: RegExpExecArray | null;
            GIT_URL_RE.lastIndex = 0;
            while ((m = GIT_URL_RE.exec(text)) !== null) {
                const url = m[1];
                // Only https:// URLs open in a browser; git@ SSH remotes cannot.
                if (!url.startsWith('http')) continue;

                // +1 to skip the opening quote.
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
