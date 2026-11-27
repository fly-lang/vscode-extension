import * as vscode from 'vscode';

/**
 * Hover documentation for a project manifest.
 *
 * `Manifest.fly` is ordinary Fly source — a class extending `fly.meta.Manifest`
 * — so the language server already answers hover for its syntax. What it cannot
 * know is what each FIELD MEANS to the package manager, which is what this
 * provider adds.
 */

interface FieldDoc { detail: string; doc: string; }

const FIELDS: Record<string, FieldDoc> = {
    name: {
        detail: 'string name',
        doc:    'The package name (REQUIRED). Must match `[a-z0-9_-]+`.\n\n'
              + 'On a `Target` it is the output name, and on a `Profile` the name '
              + '`--profile` selects.',
    },
    version: {
        detail: 'string version',
        doc:    'The package version (REQUIRED). `MAJOR.MINOR.PATCH`, e.g. `"0.1.0"`.\n\n'
              + 'On a `Dependency`, the second argument is a version REQUIREMENT and the '
              + 'resolver picks the highest available version satisfying it.\n\n'
              + '| Syntax | Meaning |\n|---|---|\n'
              + '| `"*"` | Any (latest) |\n'
              + '| `"1.2.3"` | Exact |\n'
              + '| `"^1.2.3"` | `>=1.2.3, <2.0.0` |\n'
              + '| `"~1.2.3"` | `>=1.2.3, <1.3.0` |\n'
              + '| `"1.x"` | `>=1.0.0, <2.0.0` |',
    },
    description: {
        detail: 'string description',
        doc:    'A short, human-readable description of the package.',
    },
    license: {
        detail: 'string license',
        doc:    'SPDX license identifier, e.g. `"Apache-2.0"`, `"MIT"`, `"GPL-3.0-only"`.',
    },
    flyVersion: {
        detail: 'string flyVersion',
        doc:    'The Fly toolchain version this package expects — the version reported '
              + 'by `fly --version`. `fly init` fills it in with the version that '
              + 'scaffolded the project.',
    },
    homepage: {
        detail: 'string homepage',
        doc:    'URL of the project homepage or documentation site.',
    },
    repository: {
        detail: 'string repository',
        doc:    'URL of the source repository, e.g. `"https://github.com/user/repo.git"`.',
    },
    registry: {
        detail: 'string registry',
        doc:    'Default registry alias for this package\'s dependencies. '
              + 'Empty means the default registry.',
    },
    authors: {
        detail: 'string[] authors',
        doc:    'Author strings, e.g. `{ "Alice <alice@example.com>" }`.',
    },
    linkLibs: {
        detail: 'string[] linkLibs',
        doc:    'Native libraries to link, without the `-l` prefix: at the top level for '
              + 'every target, inside a target for that one only.\n\n'
              + '```fly\nstring[] linkLibs = { "m", "pthread" }\n```',
    },
    targets: {
        detail: 'Target[] targets',
        doc:    'The build targets — executables, libraries and file copies — built in '
              + 'the order they are written.\n\n'
              + '```fly\nTarget[] targets = {\n'
              + '    { name = "mylib", srcDirs = { "lib" }, lib = "static", dir = "lib" },\n'
              + '    { name = "app", srcDirs = { "src" }, entry = "src/main.fly",\n'
              + '      libDirs = { "@out/lib" }, dir = "bin" },\n'
              + '    { name = "assets", dir = "share", copy = { "assets" } }\n'
              + '}\n```\n\n'
              + 'Each target is a struct literal with named fields; only `name` is required. '
              + 'No `lib` makes the target an **executable**; `"static"`, `"dynamic"` or '
              + '`"both"` make it a library. `@out` is the output directory.\n\n'
              + 'The short form `new Target(name, path, lib)` still works.\n\n'
              + 'The name is what `fly build --target <name>` and `fly run --bin <name>` select.',
    },
    srcDirs: {
        detail: 'string[] srcDirs  (Target)',
        doc:    'Source roots of the target. The first is where the entry (`main()`, the '
              + 'suites, or every source of a library) is discovered; all of them resolve imports.',
    },
    path: {
        detail: 'string path  (Target / Dependency)',
        doc:    'On a **Target**: a source file, e.g. `"src/main.fly"` — its directory is '
              + 'compiled (the short way to say `srcDirs` + `entry`).\n\n'
              + 'On a **Dependency**: the directory of a local package (8th argument).',
    },
    files: {
        detail: 'string[] files  (Target)',
        doc:    'Compile exactly these files instead of a whole directory.',
    },
    entry: {
        detail: 'string entry  (Target)',
        doc:    'The file declaring `main()`, for a source tree that has more than one.',
    },
    lib: {
        detail: 'string lib  (Target)',
        doc:    '`"static"`, `"dynamic"` or `"both"` build a library (a merged object or a '
              + 'shared library, plus one `.fly.h` header per public module). Empty or '
              + 'omitted: an executable.',
    },
    os: {
        detail: 'string os  (Target)',
        doc:    '`"linux"`, `"windows"` or `"macos"`: the target is built only on that host '
              + 'and reported as skipped elsewhere. Omitted: built everywhere.',
    },
    artifact: {
        detail: 'string artifact  (Target)',
        doc:    'The exact output name, with no `lib` prefix; the extension is added per platform.',
    },
    libDirs: {
        detail: 'string[] libDirs  (Target)',
        doc:    'Package directories (`-L`): their `.fly.h` headers resolve imports and '
              + 'their archives are linked. `@out` is the output directory, so `"@out/lib"` '
              + 'names the libraries built by the targets before this one.',
    },
    flags: {
        detail: 'string[] flags  (Target)',
        doc:    'Extra compiler arguments, passed verbatim. `@out` is the output directory.',
    },
    dir: {
        detail: 'string dir  (Target)',
        doc:    'Subdirectory of the output directory the artifact lands in (a library\'s '
              + 'headers and the target\'s copies too) — e.g. `"bin"` and `"lib"` for an '
              + 'installable layout.',
    },
    copy: {
        detail: 'string[] copy  (Target)',
        doc:    'Files or directories copied into the target\'s directory. A directory is '
              + 'copied whole, a symbolic link is followed, and `dir/prefix*suffix` takes the '
              + 'matching files (none matching is fine). A target with only copies compiles nothing.',
    },
    rpaths: {
        detail: 'string[] rpaths  (Target)',
        doc:    'Where an executable looks for its shared libraries at run time (Linux and '
              + 'macOS; Windows has no such thing). `$ORIGIN` is the executable\'s own '
              + 'directory: `"$ORIGIN/../lib"`.',
    },
    optLevel: {
        detail: 'int optLevel  (Profile)',
        doc:    'Optimisation level, `0`..`3` (`-O<n>`).',
    },
    debugInfo: {
        detail: 'bool debugInfo  (Profile)',
        doc:    'Emit debug information (source lines, parameters and local variables).',
    },
    assertions: {
        detail: 'bool assertions  (Profile)',
        doc:    'Keep assertions in the build.',
    },
    warningsAsErrors: {
        detail: 'bool warningsAsErrors  (Profile)',
        doc:    'A warning fails the build like an error.',
    },
    debugPrefixMap: {
        detail: 'string debugPrefixMap  (Profile)',
        doc:    '`"OLD=NEW"` pairs separated by `;`: `NEW` is written for the directory '
              + 'prefix `OLD` in debug information and run-time error positions, so a '
              + 'build carries no path of the machine that made it. `@root` is the package '
              + 'root, `@out` the output directory, `@fly` the toolchain.',
    },
    dependencies: {
        detail: 'Dependency[] dependencies',
        doc:    'Runtime dependencies. Arguments are positional — '
              + '`(name, version, registry, git, tag, branch, rev, path)` — and trailing '
              + 'ones may be omitted.\n\n'
              + '```fly\nDependency[] dependencies = {\n'
              + '    new Dependency("json", "^1.2.0"),                                  // registry\n'
              + '    new Dependency("util", "", "", "https://github.com/acme/util", "v1.0"),  // git tag\n'
              + '    new Dependency("core", "", "", "", "", "", "", "../libs/core")     // path\n'
              + '}\n```\n\n'
              + 'Edit with `fly add` / `fly remove`, then `fly lock` rewrites `Lock.fly`.',
    },
    devDependencies: {
        detail: 'Dependency[] devDependencies',
        doc:    'Same shape as `dependencies`, but not propagated to packages that depend '
              + 'on yours — available only for local development and testing '
              + '(`fly add --dev`).',
    },
    profiles: {
        detail: 'Profile[] profiles',
        doc:    'Named build profiles, selected with `fly build --profile <name>` '
              + '(`--release` selects `release`; with neither, `debug`).\n\n'
              + '```fly\nProfile[] profiles = {\n'
              + '    { name = "release", optLevel = 2, warningsAsErrors = true },\n'
              + '    { name = "dist", optLevel = 3, debugInfo = false }\n'
              + '}\n```\n\n'
              + 'A field left out keeps the built-in default of that profile: `release` is '
              + '`-O3` with no debug info and assertions off, every other name starts from '
              + 'the debug defaults (`-O0`, debug info, assertions on). Each profile builds '
              + 'into its own `target/<name>/`.\n\n'
              + 'Pick the one the editor commands use with **Fly: Select Profile**.',
    },
    repositories: {
        detail: 'Registry[] repositories — NOT READ YET',
        doc:    '⚠️ The current `fly` driver does **not** read this field.\n\n'
              + 'Registry aliases map a short name to a registry URL. To serve packages '
              + 'yourself: `fly-registry --storage ~/.fly/registry --port 5000`',
    },
    tst: {
        detail: 'TestConfig tst — NOT READ YET',
        doc:    '⚠️ The current `fly` driver does **not** read this field. '
              + '(Named `tst` because `test` is a reserved keyword.)\n\n'
              + '`fly test` discovers the project\'s `*Suite.fly` files instead.',
    },
    workspace: {
        detail: 'Workspace workspace — NOT READ YET',
        doc:    '⚠️ The current `fly` driver does **not** read this field, so a workspace '
              + 'root does not yet build its members.',
    },
    hooks: {
        detail: 'Hooks hooks — NOT READ YET',
        doc:    '⚠️ The current `fly` driver does **not** read this field: pre/post-build '
              + 'commands are not run.',
    },
};

const TYPES: Record<string, FieldDoc> = {
    Manifest: {
        detail: 'class Manifest : fly.meta.Manifest',
        doc:    'The project manifest. It is **Fly source, not TOML**: the package manager '
              + 'reads it with the compiler\'s own parser and walks the AST, so one language '
              + 'and one parser cover both the code and its configuration.\n\n'
              + 'Create one with `fly init`.',
    },
    Target: {
        detail: '{ name = …, srcDirs = { … }, … }  or  new Target(name, path, lib)',
        doc:    'One build target. Named fields: `name`, `path`, `lib`, `srcDirs`, `files`, '
              + '`entry`, `os`, `artifact`, `libDirs`, `linkLibs`, `flags`, `dir`, `copy`, '
              + '`rpaths`. `lib` is empty for an executable, else `"static"`, `"dynamic"` '
              + 'or `"both"`.',
    },
    Dependency: {
        detail: 'new Dependency(name, version, registry, git, tag, branch, rev, path)',
        doc:    'One dependency. Set the arguments that fit its kind: `version` for a '
              + 'registry dependency, `git` plus exactly one of `tag`/`branch`/`rev` for a '
              + 'git dependency, or `path` for a local one. Trailing arguments may be omitted.',
    },
    Profile: {
        detail: '{ name = …, optLevel = …, debugInfo = …, … }',
        doc:    'A named build profile, written as a struct literal. Fields: `name`, '
              + '`optLevel`, `debugInfo`, `assertions`, `lto`, `strip`, `warningsAsErrors`, '
              + '`debugPrefixMap`. Selected with `fly build --profile <name>`.',
    },
    Registry: {
        detail: 'new Registry(name, url)',
        doc:    'A registry alias mapping a short name to a registry URL. Used inside the '
              + '`repositories` field (**not read** by the current driver).',
    },
    Workspace: {
        detail: 'new Workspace(members)',
        doc:    'A multi-package workspace root. ⚠️ **Not read** by the current driver.',
    },
    Hooks: {
        detail: 'new Hooks(preBuild, postBuild)',
        doc:    'Shell commands run around the build. ⚠️ **Not read** by the current driver.',
    },
    TestConfig: {
        detail: 'TestConfig — test-run configuration',
        doc:    'Configuration for `fly test` in the `tst` field. ⚠️ **Not read** by the '
              + 'current driver — suites are discovered from `*Suite.fly` files.',
    },
};

export class ManifestHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | undefined {
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
        if (!wordRange) return undefined;

        const word  = document.getText(wordRange);
        const entry = FIELDS[word] ?? TYPES[word];
        if (!entry) return undefined;

        const md = new vscode.MarkdownString();
        md.appendCodeblock(entry.detail, 'fly');
        md.appendMarkdown('\n\n' + entry.doc);
        return new vscode.Hover(md, wordRange);
    }
}
