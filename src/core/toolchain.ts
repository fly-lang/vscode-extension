/**
 * Pure toolchain-path helpers — NO vscode import, NO ambient state beyond the
 * injected platform flag, so plain node can unit-test them (tests/unit.js).
 */
import * as path from 'path';
import * as os from 'os';

/**
 * Path of a tool shipped next to the fly binary (fly-lsp, lldb-dap, …).
 * A bare compilerPath ("fly") yields the bare tool name, which resolves
 * through PATH like the compiler itself.
 */
export function deriveSiblingTool(
    flyPath: string,
    tool: string,
    isWindows: boolean = os.platform() === 'win32',
): string {
    // The path flavor follows the TARGET platform, not the host, so the
    // function is deterministic everywhere (and unit-testable on any CI).
    const p    = isWindows ? path.win32 : path.posix;
    const dir  = p.dirname(flyPath);
    const name = isWindows ? `${tool}.exe` : tool;
    return dir === '.' ? name : p.join(dir, name);
}

/**
 * The driver takes no positional file arguments: it compiles a source
 * directory. A single file builds via --entry <file> (discovery is skipped)
 * with its directory as the import root.
 */
export function singleFileArgs(filePath: string): string[] {
    return ['--entry', filePath, '--src-dir', path.dirname(filePath)];
}

/**
 * The file a linked executable ends up in. On Windows the linker appends
 * `.exe` to any `-o` name that does not already end with it (dotted names
 * included: `my.app` → `my.app.exe`), so naming the extension up front keeps
 * the path the extension runs identical to the one the compiler wrote.
 */
export function exeName(
    outPath: string,
    isWindows: boolean = os.platform() === 'win32',
): string {
    if (!isWindows || /\.exe$/i.test(outPath)) return outPath;
    return outPath + '.exe';
}

/**
 * Arguments selecting a build profile for `fly build / run / test / clean`.
 * Empty and "debug" are the driver's default; "release" has its own flag; any
 * other name is a profile the manifest declares (`Profile[] profiles`).
 */
export function profileArgs(profile: string): string[] {
    const p = profile.trim();
    if (p === '' || p === 'debug') return [];
    if (p === 'release') return ['--release'];
    return ['--profile', p];
}

/**
 * Split a settings string of extra arguments into argv. Whitespace separates;
 * double quotes group (`-o "bin/my app"`) and are removed. The commands run
 * the compiler directly, with no shell in between, so nothing else is special.
 */
export function splitArgs(s: string): string[] {
    const out: string[] = [];
    let cur = '';
    let has = false;        // a token is open (so `""` yields an empty argument)
    let quoted = false;
    for (const c of s) {
        if (c === '"') {
            quoted = !quoted;
            has = true;
        } else if (!quoted && /\s/.test(c)) {
            if (has) out.push(cur);
            cur = '';
            has = false;
        } else {
            cur += c;
            has = true;
        }
    }
    if (has) out.push(cur);
    return out;
}

/**
 * The text between the `{` that opens `<Type>[] <field> = {` and its matching
 * `}` in a manifest, or undefined when the field is not declared. Braces
 * inside string literals and comments do not count.
 */
export function manifestArrayBody(text: string, type: string, field: string): string | undefined {
    const decl = new RegExp(`\\b${type}\\s*\\[\\]\\s+${field}\\s*=\\s*\\{`, 'g');
    let m: RegExpExecArray | null;
    for (;;) {
        m = decl.exec(text);
        if (!m) return undefined;
        // A declaration that was commented out is not one.
        const lineStart = text.lastIndexOf('\n', m.index) + 1;
        if (!text.slice(lineStart, m.index).includes('//')) break;
    }

    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < text.length) {
        const c = text[i];
        const c2 = text[i + 1];
        if (c === '/' && c2 === '/') {
            const nl = text.indexOf('\n', i);
            i = nl < 0 ? text.length : nl;
            continue;
        }
        if (c === '/' && c2 === '*') {
            const end = text.indexOf('*/', i + 2);
            i = end < 0 ? text.length : end + 2;
            continue;
        }
        if (c === '"') {
            i++;
            while (i < text.length && text[i] !== '"') {
                if (text[i] === '\\') i++;
                i++;
            }
            i++;
            continue;
        }
        if (c === '{') depth++;
        if (c === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i);
        }
        i++;
    }
    return undefined;
}

/**
 * Names of the entries of a manifest array written in the named form
 * (`{ name = "dist", … }`) or, for targets, the positional one
 * (`new Target("app", …)`). In declaration order, without duplicates.
 */
export function manifestNames(text: string, type: string, field: string): string[] {
    const body = manifestArrayBody(text, type, field);
    if (body === undefined) return [];
    const names: string[] = [];
    const re = new RegExp(`\\bname\\s*=\\s*"([^"]+)"|\\bnew\\s+${type}\\s*\\(\\s*"([^"]+)"`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        const n = m[1] ?? m[2];
        if (!names.includes(n)) names.push(n);
    }
    return names;
}

/** Profiles usable with the project commands: the two built-ins, then the manifest's. */
export function manifestProfiles(text: string): string[] {
    const out = ['debug', 'release'];
    for (const n of manifestNames(text, 'Profile', 'profiles')) {
        if (!out.includes(n)) out.push(n);
    }
    return out;
}
