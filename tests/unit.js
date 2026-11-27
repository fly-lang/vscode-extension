// Unit tests for the pure core modules (out/core/*, compiled by `npm run
// compile`). Plain node + assert: no framework, no vscode — the same reason
// the logic lives in src/core in the first place.
//
//   npm test        (compile + run; wired into CI before packaging)
'use strict';
const assert = require('assert');
const path = require('path');

const {
    deriveSiblingTool, singleFileArgs, exeName, profileArgs, splitArgs,
    manifestNames, manifestProfiles,
} = require('../out/core/toolchain');
const { sanitizeCompilerJson, resolveDiagFile } = require('../out/core/diagjson');

let n = 0;
function t(name, fn) { fn(); n++; console.log(`  ok    ${name}`); }

// ── deriveSiblingTool ────────────────────────────────────────────────────────
t('sibling tool next to an absolute fly path (windows)', () => {
    assert.strictEqual(
        deriveSiblingTool('C:\\tc\\bin\\fly.exe', 'fly-lsp', true),
        'C:\\tc\\bin\\fly-lsp.exe');
});
t('sibling tool next to an absolute fly path (posix)', () => {
    assert.strictEqual(deriveSiblingTool('/tc/bin/fly', 'lldb-dap', false),
        '/tc/bin/lldb-dap');
});
t('bare "fly" resolves the bare tool name through PATH', () => {
    assert.strictEqual(deriveSiblingTool('fly', 'fly-lsp', false), 'fly-lsp');
    assert.strictEqual(deriveSiblingTool('fly', 'fly-lsp', true), 'fly-lsp.exe');
});

// ── singleFileArgs ───────────────────────────────────────────────────────────
t('single file compiles via --entry with its directory as import root', () => {
    const p = path.join('proj', 'src', 'main.fly');
    assert.deepStrictEqual(singleFileArgs(p),
        ['--entry', p, '--src-dir', path.join('proj', 'src')]);
});

// ── sanitizeCompilerJson ─────────────────────────────────────────────────────
t('raw windows path in "file" becomes parseable JSON', () => {
    // The raw string below contains SINGLE backslashes — the exact broken
    // output of older compilers (illegal JSON escapes like \U).
    const raw = '{"file":"C:\\Users\\m\\broken","message":"boom"}';
    const p = JSON.parse(sanitizeCompilerJson(raw));
    assert.strictEqual(p.file, 'C:\\Users\\m\\broken');
});
t('backslash-b and backslash-u path segments survive as literal characters', () => {
    // \b would decode as backspace, \U is an illegal escape: both are raw
    // separators in that broken output and must survive as literal text.
    const raw = '{"file":"C:\\build\\unit"}';
    assert.strictEqual(JSON.parse(sanitizeCompilerJson(raw)).file, 'C:\\build\\unit');
});
t('idempotent on correctly escaped output (fixed compilers)', () => {
    const good = '{"file":"C:\\\\tc\\\\a.fly","message":"say \\"hi\\""}';
    assert.strictEqual(sanitizeCompilerJson(good), good);
    const p = JSON.parse(good);
    assert.strictEqual(p.file, 'C:\\tc\\a.fly');
    assert.strictEqual(p.message, 'say "hi"');
});

// ── resolveDiagFile ──────────────────────────────────────────────────────────
t('extensionless module path maps back to the real .fly source', () => {
    const exists = (p) => p === '/proj/broken.fly';
    assert.strictEqual(resolveDiagFile('/proj/broken', '/proj/x.fly', exists),
        '/proj/broken.fly');
});
t('a path that exists as reported is kept (fixed compilers)', () => {
    const exists = (p) => p === '/proj/broken.fly';
    assert.strictEqual(resolveDiagFile('/proj/broken.fly', '/proj/x.fly', exists),
        '/proj/broken.fly');
});
t('unknown or missing file falls back to the compiled file', () => {
    const never = () => false;
    assert.strictEqual(resolveDiagFile('/gone', '/proj/x.fly', never), '/proj/x.fly');
    assert.strictEqual(resolveDiagFile(undefined, '/proj/x.fly', never), '/proj/x.fly');
});

// ── exeName ──────────────────────────────────────────────────────────────────
t('the linked executable carries .exe on windows only, once', () => {
    assert.strictEqual(exeName('C:\\t\\hello', true), 'C:\\t\\hello.exe');
    assert.strictEqual(exeName('C:\\t\\my.app', true), 'C:\\t\\my.app.exe');
    assert.strictEqual(exeName('C:\\t\\hello.EXE', true), 'C:\\t\\hello.EXE');
    assert.strictEqual(exeName('/t/hello', false), '/t/hello');
});

// ── profileArgs ──────────────────────────────────────────────────────────────
t('debug is the default, release has its flag, the rest go through --profile', () => {
    assert.deepStrictEqual(profileArgs(''), []);
    assert.deepStrictEqual(profileArgs('debug'), []);
    assert.deepStrictEqual(profileArgs('release'), ['--release']);
    assert.deepStrictEqual(profileArgs(' dist '), ['--profile', 'dist']);
});

// ── splitArgs ────────────────────────────────────────────────────────────────
t('extra arguments split on spaces, double quotes group', () => {
    assert.deepStrictEqual(splitArgs(''), []);
    assert.deepStrictEqual(splitArgs('  -O2   --target app '), ['-O2', '--target', 'app']);
    assert.deepStrictEqual(splitArgs('-o "bin/my app" -c'), ['-o', 'bin/my app', '-c']);
    assert.deepStrictEqual(splitArgs('--out-dir="a b" ""'), ['--out-dir=a b', '']);
});

// ── manifest names ───────────────────────────────────────────────────────────
const MANIFEST = [
    'class Manifest : fly.meta.Manifest {',
    '    string name = "demo"',
    '    // Profile[] profiles = { { name = "commented" } }',
    '    Profile[] profiles = {',
    '        { name = "dist", optLevel = 0, debugPrefixMap = "@root=.;{x}=y" },',
    '        { name = "release", optLevel = 2 }',
    '    }',
    '    Target[] targets = {',
    '        { name = "lib", dir = "lib", copy = { "a.h" } },',
    '        new Target("app", "src/main.fly", "")',
    '    }',
    '}',
].join('\n');
t('profiles of a manifest: the built-ins first, then the declared ones, once each', () => {
    assert.deepStrictEqual(manifestProfiles(MANIFEST), ['debug', 'release', 'dist']);
    assert.deepStrictEqual(manifestProfiles('class Manifest { }'), ['debug', 'release']);
});
t('targets in both the named and the positional form', () => {
    assert.deepStrictEqual(manifestNames(MANIFEST, 'Target', 'targets'), ['lib', 'app']);
});

console.log(`${n} tests passed`);
