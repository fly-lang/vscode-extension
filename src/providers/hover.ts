import * as vscode from 'vscode';

interface HoverEntry {
    detail: string;
    doc: string;
}

const KEYWORD_DOCS: Record<string, HoverEntry> = {
    // Return value
    return: {
        detail: '(keyword) return',
        doc: 'Hands a value back, and leaves the function.\n\n```fly\nint double(const int n) {\n    return n * 2\n}\n```\n\nThe value is written into a hidden output parameter the compiler adds to the signature, so it is never copied out of the callee frame. A function with a return type must return on **every path**; a multi-return function returns one value per declared type (`return a, b`). In a `void` function a bare `return` exits early.',
    },

    // Error handling
    fail: {
        detail: '(keyword) fail',
        doc: 'Signals an error. Accepts 0–3 comma-separated arguments: an integer code, a string message, and/or an object instance (in any order, at most one each).\n\n```fly\nfail                        // code = 1\nfail 404                    // code = 404\nfail "not found"            // message\nfail 404, "not found"       // code + message\nfail 1, "oops", new Ctx()  // code + message + object\n```\n\nA failure is **not ignorable** (0.15.1): the function stops, and every caller stops right after the call too, until a `handle` stops the error. An error nobody handles ends the program from `main` with `error <code>: <message>` and its code as the exit code.',
    },
    handle: {
        detail: '(keyword) handle',
        doc: 'Guards the statements of its block against errors and binds the **implicit `error` variable** — a named error variable cannot be attached.\n\n```fly\nhandle {\n    riskyOp()\n}\nif error { /* inspect the failure */ }\n```\n\nA `fail` inside the handle body, or in anything it calls, jumps out of the block at once; the handle consumes the error, so it goes no further.',
    },
    error: {
        detail: '(type) error',
        doc: 'Built-in error type. Holds an integer code, a string message, and an optional object payload. A `handle` block binds the implicit `error` variable; test it with `if error` — a zero code means no error.\n\n```fly\nhandle { riskyOp() }\nif error { /* error occurred */ }\n```',
    },

    // Allocation
    new: {
        detail: '(keyword) new',
        doc: 'Allocates an object. The storage depends on the type:\n- **struct** → stack (`alloca`), freed at scope exit\n- **class** → heap (`malloc`); release it with `delete x` (0.15 still frees a local that never escapes at scope exit; from 0.16 plain `new` requires `delete`)\n- `new unique C()` → one owner, deleted at scope exit, moved on assignment/return\n- `new shared C()` → reference-counted; `C w = weak h` observes it without owning\n\n```fly\nPoint p = new Point(1, 2)      // struct: stack\nNode  n = new Node()           // class: heap\ndelete n\nNode  u = new unique Node()    // freed at scope exit\n```',
    },
    delete: {
        detail: '(keyword) delete',
        doc: 'Releases a class object made with plain `new`: runs its `free()` method if it has one, frees the memory and sets the variable to `null` (deleting `null` does nothing).\n\n```fly\nNode n = new Node()\ndelete n\n```',
    },

    // Import
    import: {
        detail: '(keyword) import',
        doc: 'Four import forms:\n\n```fly\nimport fly.str          // namespace import → str.len()\nimport fly.data.List    // class import    → new List()\nimport fly.data.*       // wildcard        → all symbols in scope\nimport fly.str as s     // alias           → s.len()\n```',
    },
    namespace: {
        detail: '(keyword) namespace',
        doc: 'Declares the namespace for the current file. Must be the first declaration, before any imports.\n\n```fly\nnamespace com.example.utils\n```\n\nDotted names create nested namespaces. If omitted, a default namespace based on the filename is used.',
    },

    // Testing
    suite: {
        detail: '(keyword) suite',
        doc: 'Declares a test suite — activates `test {}` blocks inside production functions by supplying inputs through named `case` steps.\n\n```fly\nsuite MathSuite {\n    void setup()    { /* once before all tests */ }\n    void teardown() { /* once after all tests  */ }\n\n    void classifyTest() {\n        case "positive": classify(5)\n        case "negative": classify(-3)\n    }\n}\n```\n\nMethods ending in `Test` are test-methods and run automatically. `setup` and `teardown` are lifecycle hooks recognised by exact name (not keywords). Helper methods (any other name) can be called from case blocks.',
    },
    test: {
        detail: '(keyword) test',
        doc: 'Inline test block — written directly inside a production function to observe its local state read-only.\n\n```fly\nstring classify(const int n) {\n    string label = "zero"\n    if n > 0 {\n        label = "positive"\n        test {\n            assertTrue(label == "positive")\n        }\n    }\n    return label\n}\n```\n\nIn **release** builds the block is completely stripped — zero IR, zero overhead.\nIn **test** mode (`fly --test`, or `fly test` in a project) it executes only when an active suite is running. Writing to outer-scope variables is a compile error.',
    },
    case: {
        detail: '(keyword) case',
        doc: 'Two uses:\n\n**1. Switch dispatch** — matches a value and jumps to the matching block:\n```fly\nswitch x {\n    case 1: doA() break\n    default: doB()\n}\n```\n\n**2. Suite test step** — named sequential execution inside a test-method:\n```fly\nvoid classifyTest() {\n    case "positive": classify(5)\n    case "negative": classify(-3)\n}\n```\nAll cases execute in order (no break, no dispatch). Each case has its own isolated error handler — an assertion failure in one case does not abort the others.',
    },

    // Built-in types
    bool:   { detail: '(type) bool',   doc: 'Boolean type. Values: `true` or `false`.' },
    byte:   { detail: '(type) byte',   doc: 'Unsigned 8-bit integer. Range: 0–255.' },
    short:  { detail: '(type) short',  doc: 'Signed 16-bit integer. Range: −32 768 to 32 767.' },
    ushort: { detail: '(type) ushort', doc: 'Unsigned 16-bit integer. Range: 0–65 535.' },
    int:    { detail: '(type) int',    doc: 'Signed 32-bit integer. Range: −2 147 483 648 to 2 147 483 647.' },
    uint:   { detail: '(type) uint',   doc: 'Unsigned 32-bit integer. Range: 0–4 294 967 295.' },
    long:   { detail: '(type) long',   doc: 'Signed 64-bit integer. Range: −9 223 372 036 854 775 808 to 9 223 372 036 854 775 807.' },
    ulong:  { detail: '(type) ulong',  doc: 'Unsigned 64-bit integer. Range: 0–18 446 744 073 709 551 615.' },
    float:  { detail: '(type) float',  doc: 'Single-precision 32-bit floating-point number (IEEE 754).' },
    double: { detail: '(type) double', doc: 'Double-precision 64-bit floating-point number (IEEE 754).' },
    string: { detail: '(type) string', doc: 'UTF-8 string (data pointer + byte size). Escapes are decoded: `\\n \\t \\r \\0 \\\\ \\" \\\' \\xHH \\u{…}`; a `"""…"""` literal is raw and may span lines. There is no `char`: a character is a one-character string (`str.charAt`, `str.charCount`).' },
    pointer: { detail: '(type) pointer', doc: 'Opaque machine address. Use `pointer` for raw addresses and OS/runtime handles — never `long`; there is no numeric cast between pointers and integers.' },
    complex: { detail: '(type) complex', doc: 'Complex number type (real and imaginary floating-point parts).' },
    void:   { detail: '(type) void',   doc: 'Void return type: the function hands back no value. A return type is mandatory, so a function that produces nothing declares `void` explicitly.' },
};

export class FlyHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | undefined {
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_]\w*/);
        if (!wordRange) return undefined;

        const word = document.getText(wordRange);
        const entry = KEYWORD_DOCS[word];
        if (!entry) return undefined;

        const md = new vscode.MarkdownString();
        md.appendCodeblock(entry.detail, 'fly');
        md.appendMarkdown('\n\n' + entry.doc);
        md.isTrusted = true;

        return new vscode.Hover(md, wordRange);
    }
}
