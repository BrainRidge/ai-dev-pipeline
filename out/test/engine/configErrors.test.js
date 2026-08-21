"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
const WORKFLOWS = (0, node_path_1.join)(__dirname, '../../workflows');
/** Writes the given files to a temp dir and returns the two paths load() wants. */
async function configDir(files) {
    const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'cfg-'));
    await (0, promises_1.mkdir)(dir, { recursive: true });
    for (const [name, body] of Object.entries(files))
        await (0, promises_1.writeFile)((0, node_path_1.join)(dir, name), body);
    return {
        dir,
        platformConfig: (0, node_path_1.join)(dir, 'platforms.json'),
        microserviceConfig: (0, node_path_1.join)(dir, 'microservices.json'),
    };
}
const PLATFORMS = JSON.stringify({ platforms: [{ id: 'p', label: 'P' }] });
/**
 * These errors used to be raised on a tool developer's machine at build time.
 * They are now raised on a team member's machine at load time, so reaching the
 * developer intact matters more rather than less. See spec Section 16.
 */
(0, vitest_1.describe)('loading a content root that is wrong', () => {
    (0, vitest_1.it)('names the missing file and the path it looked at', async () => {
        const dir = await configDir({ 'platforms.json': PLATFORMS });
        await (0, vitest_1.expect)(WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(`Microservice config not found at ${dir.microserviceConfig}`);
    });
    (0, vitest_1.it)('names platforms.json when that is the one missing', async () => {
        const dir = await configDir({ 'microservices.json': '[]' });
        await (0, vitest_1.expect)(WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(`Platform config not found at ${dir.platformConfig}`);
    });
    (0, vitest_1.it)('attributes a schema failure to the file it came from', async () => {
        const dir = await configDir({
            'platforms.json': PLATFORMS,
            'microservices.json': JSON.stringify([{ shortCode: 'x' }]),
        });
        await (0, vitest_1.expect)(WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(/Microservice config/);
    });
    (0, vitest_1.it)('reports malformed JSON against the file rather than as a bare syntax error', async () => {
        const dir = await configDir({ 'platforms.json': PLATFORMS, 'microservices.json': '[' });
        await (0, vitest_1.expect)(WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(/Microservice config/);
    });
    // validateMicroservices already produces the most useful error the catalogue
    // loader has. It must not be flattened into a generic message.
    (0, vitest_1.it)('passes a duplicate shortCode through with its own wording intact', async () => {
        const dir = await configDir({
            'platforms.json': PLATFORMS,
            'microservices.json': JSON.stringify([
                { microserviceName: 'A', shortCode: 'dup', gitLocation: 'https://h/a' },
                { microserviceName: 'B', shortCode: 'dup', gitLocation: 'https://h/b' },
            ]),
        });
        await (0, vitest_1.expect)(WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow('microservices: "B" and "A" share the shortCode "dup"');
    });
    (0, vitest_1.it)('passes a cloning collision through the same way', async () => {
        const dir = await configDir({
            'platforms.json': PLATFORMS,
            'microservices.json': JSON.stringify([
                { microserviceName: 'A', shortCode: 'a', gitLocation: 'https://h/same' },
                { microserviceName: 'B', shortCode: 'b', gitLocation: 'https://other/same.git' },
            ]),
        });
        await (0, vitest_1.expect)(WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(/overwrite each other/);
    });
});
