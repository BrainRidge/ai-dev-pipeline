"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const ToolCatalog_1 = require("../../src/engine/ToolCatalog");
async function fileWith(content) {
    const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'tools-'));
    const path = (0, node_path_1.join)(dir, 'tools.json');
    await (0, promises_1.writeFile)(path, content, 'utf8');
    return path;
}
const GIT = {
    id: 'git',
    label: 'Git',
    command: 'git',
    args: ['--version'],
    required: true,
    why: '',
    install: {},
};
(0, vitest_1.describe)('reading a version out of what a tool prints', () => {
    (0, vitest_1.it)('reads git', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.versionIn)('git version 2.50.1')).toBe('2.50.1');
    });
    (0, vitest_1.it)('reads a JDK, which quotes its version and adds a build date', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.versionIn)('openjdk version "21.0.8" 2025-07-15')).toBe('21.0.8');
    });
    (0, vitest_1.it)('reads an old JDK, whose 1.x scheme still compares correctly', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.versionIn)('java version "1.8.0_392"')).toBe('1.8.0');
    });
    (0, vitest_1.it)('reads Maven', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.versionIn)('Apache Maven 3.9.6')).toBe('3.9.6');
    });
    (0, vitest_1.it)('gives nothing back for output with no number in it', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.versionIn)('command not found')).toBeUndefined();
    });
});
(0, vitest_1.describe)('comparing a version against a floor', () => {
    (0, vitest_1.it)('accepts what is newer', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.meetsMinimum)('21.0.8', '17')).toBe(true);
    });
    (0, vitest_1.it)('accepts what is exactly the floor, with the segments unequal in length', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.meetsMinimum)('17', '17.0')).toBe(true);
    });
    (0, vitest_1.it)('rejects what is older', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.meetsMinimum)('1.8.0', '17')).toBe(false);
    });
    (0, vitest_1.it)('compares numerically rather than as text, so 10 beats 9', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.meetsMinimum)('2.10.0', '2.9.0')).toBe(true);
    });
    (0, vitest_1.it)('rejects a patch below the floor', () => {
        (0, vitest_1.expect)((0, ToolCatalog_1.meetsMinimum)('2.29.9', '2.30')).toBe(false);
    });
});
(0, vitest_1.describe)('the bundled default tool list', () => {
    (0, vitest_1.it)('obeys its own schema, since it is parsed through it at import', () => {
        (0, vitest_1.expect)(ToolCatalog_1.DEFAULT_TOOLS.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('requires git, because the Get the code step is git commands', () => {
        const git = ToolCatalog_1.DEFAULT_TOOLS.find((t) => t.id === 'git');
        (0, vitest_1.expect)(git.required).toBe(true);
    });
    (0, vitest_1.it)('leaves the build tools optional, since a repository picks one of them', () => {
        for (const id of ['maven', 'gradle']) {
            (0, vitest_1.expect)(ToolCatalog_1.DEFAULT_TOOLS.find((t) => t.id === id).required).toBe(false);
        }
    });
    (0, vitest_1.it)('gives every tool an install hint for each platform a developer might use', () => {
        for (const tool of ToolCatalog_1.DEFAULT_TOOLS) {
            for (const platform of ['darwin', 'win32', 'linux']) {
                (0, vitest_1.expect)(tool.install[platform]).toBeTruthy();
            }
        }
    });
    (0, vitest_1.it)('says why each tool is wanted, which is what the report shows', () => {
        for (const tool of ToolCatalog_1.DEFAULT_TOOLS)
            (0, vitest_1.expect)(tool.why.length).toBeGreaterThan(20);
    });
});
(0, vitest_1.describe)('loading a team tool list', () => {
    (0, vitest_1.it)('reads a file and fills the optional fields in', async () => {
        const path = await fileWith('[{"id":"git","label":"Git","command":"git"}]');
        const tools = await (0, ToolCatalog_1.loadTools)(path);
        (0, vitest_1.expect)(tools).toEqual([
            { id: 'git', label: 'Git', command: 'git', args: ['--version'], required: true, why: '', install: {} },
        ]);
    });
    // Absence is the ordinary path: it means fall back to the bundled default,
    // the same per-file fallback prompt templates get.
    (0, vitest_1.it)('gives nothing back when the file is not there, rather than failing', async () => {
        (0, vitest_1.expect)(await (0, ToolCatalog_1.loadTools)('/nowhere/at/all/tools.json')).toBeUndefined();
    });
    (0, vitest_1.it)('names the file when the JSON is malformed', async () => {
        const path = await fileWith('[{');
        await (0, vitest_1.expect)((0, ToolCatalog_1.loadTools)(path)).rejects.toThrow(new RegExp(`Tool config at ${path} is not valid JSON`));
    });
    (0, vitest_1.it)('names the file when the shape is wrong', async () => {
        const path = await fileWith('[{"label":"No id","command":"x"}]');
        await (0, vitest_1.expect)((0, ToolCatalog_1.loadTools)(path)).rejects.toThrow(/is not valid/);
    });
    (0, vitest_1.it)('refuses a minVersion that is not a version', async () => {
        const path = await fileWith('[{"id":"a","label":"A","command":"a","minVersion":"seventeen"}]');
        await (0, vitest_1.expect)((0, ToolCatalog_1.loadTools)(path)).rejects.toThrow(/dotted numbers/);
    });
    (0, vitest_1.it)('refuses two tools sharing an id, which would drop one from the report', async () => {
        const path = await fileWith('[{"id":"git","label":"Git","command":"git"},{"id":"git","label":"Git 2","command":"git2"}]');
        await (0, vitest_1.expect)((0, ToolCatalog_1.loadTools)(path)).rejects.toThrow(/share the id "git"/);
    });
});
(0, vitest_1.describe)('validateTools', () => {
    (0, vitest_1.it)('accepts distinct ids', () => {
        (0, vitest_1.expect)(() => (0, ToolCatalog_1.validateTools)([GIT, { ...GIT, id: 'java', label: 'Java' }])).not.toThrow();
    });
    (0, vitest_1.it)('names both tools in a clash, so the error says what to edit', () => {
        (0, vitest_1.expect)(() => (0, ToolCatalog_1.validateTools)([GIT, { ...GIT, label: 'Git again' }])).toThrow(/"Git again" and "Git" share the id "git"/);
    });
});
