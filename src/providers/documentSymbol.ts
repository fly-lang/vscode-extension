import * as vscode from 'vscode';

// Patterns for top-level declarations in a .fly file.
// Fly syntax: [modifiers] [returnType] name(...) { } or class/struct/enum/interface name { }
const PATTERNS: { re: RegExp; kind: vscode.SymbolKind; group: number }[] = [
    {
        re: /^\s*(?:public\s+|private\s+|protected\s+)*class\s+([a-zA-Z_]\w*)(?:\s*<[^>]*>)?/,
        kind: vscode.SymbolKind.Class,
        group: 1,
    },
    {
        re: /^\s*(?:public\s+|private\s+|protected\s+)*struct\s+([a-zA-Z_]\w*)(?:\s*<[^>]*>)?/,
        kind: vscode.SymbolKind.Struct,
        group: 1,
    },
    {
        re: /^\s*(?:public\s+|private\s+|protected\s+)*interface\s+([a-zA-Z_]\w*)/,
        kind: vscode.SymbolKind.Interface,
        group: 1,
    },
    {
        re: /^\s*(?:public\s+|private\s+|protected\s+)*enum\s+([a-zA-Z_]\w*)/,
        kind: vscode.SymbolKind.Enum,
        group: 1,
    },
    {
        // Function: optional modifiers, optional return type(s), then name followed by '('
        // Captures the function name (last word before the opening paren)
        re: /^\s*(?:(?:public|private|protected|static|const)\s+)*(?:(?:[\w,.<>\[\]]+)\s+)?([a-zA-Z_]\w*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:\{|$)/,
        kind: vscode.SymbolKind.Function,
        group: 1,
    },
];

// Keywords that should never be treated as function names
const SKIP_NAMES = new Set([
    'if', 'elsif', 'else', 'for', 'while', 'switch', 'case', 'default',
    'return', 'break', 'continue', 'fail', 'handle', 'new', 'delete',
    'namespace', 'import', 'as', 'class', 'struct', 'interface', 'enum',
    'public', 'private', 'protected', 'static', 'const', 'void',
]);

export class FlyDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
    ): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];
        const stack: { symbol: vscode.DocumentSymbol; indent: number }[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;

            // Skip blank lines and comments
            const trimmed = text.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
                continue;
            }

            for (const { re, kind, group } of PATTERNS) {
                const m = text.match(re);
                if (!m) continue;

                const name = m[group];
                if (!name || SKIP_NAMES.has(name)) continue;

                const range = new vscode.Range(i, 0, i, text.length);
                const sym = new vscode.DocumentSymbol(name, '', kind, range, range);

                // Determine nesting by indent level
                const indent = text.search(/\S/);
                while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
                    stack.pop();
                }

                if (stack.length > 0) {
                    stack[stack.length - 1].symbol.children.push(sym);
                } else {
                    symbols.push(sym);
                }

                if (kind === vscode.SymbolKind.Class ||
                    kind === vscode.SymbolKind.Struct ||
                    kind === vscode.SymbolKind.Interface ||
                    kind === vscode.SymbolKind.Enum) {
                    stack.push({ symbol: sym, indent });
                }

                break; // only one pattern per line
            }
        }

        return symbols;
    }
}
