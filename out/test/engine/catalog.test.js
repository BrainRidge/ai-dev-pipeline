"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
async function fixture() {
    const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'wf-'));
    await (0, promises_1.writeFile)((0, node_path_1.join)(dir, 'platforms.yaml'), 'platforms:\n' +
        '  - id: canada-assisted\n' +
        '    label: Canada Assisted\n' +
        '    services:\n' +
        '      - { id: payments, label: Payments, gitUrl: "git@example.com:payments.git" }\n');
    await (0, promises_1.writeFile)((0, node_path_1.join)(dir, 'research.yaml'), 'id: research\nlabel: Research Task\nplatforms: [canada-assisted]\nsteps:\n' +
        '  - id: scope\n    kind: form\n    title: Scope\n' +
        '    fields: [{ id: question, type: textarea, label: Question }]\n' +
        '  - id: analyse\n    kind: ai-handoff\n    title: Analyse\n' +
        '    prompt: prompts/x.md\n    output: 02-analysis.md\n');
    return dir;
}
(0, vitest_1.describe)('WorkflowCatalog', () => {
    (0, vitest_1.it)('loads workflows and platforms', async () => {
        const c = await WorkflowCatalog_1.WorkflowCatalog.load(await fixture());
        (0, vitest_1.expect)(c.get('research').label).toBe('Research Task');
        (0, vitest_1.expect)(c.platforms()[0].services[0].id).toBe('payments');
    });
    (0, vitest_1.it)('filters workflows by platform', async () => {
        const c = await WorkflowCatalog_1.WorkflowCatalog.load(await fixture());
        (0, vitest_1.expect)(c.forPlatform('canada-assisted').map((w) => w.id)).toEqual(['research']);
        (0, vitest_1.expect)(c.forPlatform('us-assisted')).toEqual([]);
    });
    (0, vitest_1.it)('throws for an unknown workflow id', async () => {
        const c = await WorkflowCatalog_1.WorkflowCatalog.load(await fixture());
        (0, vitest_1.expect)(() => c.get('nope')).toThrow(/unknown workflow/);
    });
    (0, vitest_1.it)('rejects a placeholder referencing a step that has not completed', async () => {
        const dir = await fixture();
        await (0, promises_1.writeFile)((0, node_path_1.join)(dir, 'bad.yaml'), 'id: bad\nlabel: Bad\nplatforms: [canada-assisted]\nsteps:\n' +
            '  - id: a\n    kind: ai-handoff\n    title: A\n    prompt: p.md\n    output: o.md\n' +
            '    branch: "{{nosuch.field}}"\n');
        await (0, vitest_1.expect)(WorkflowCatalog_1.WorkflowCatalog.load(dir)).rejects.toThrow(/nosuch/);
    });
    (0, vitest_1.it)('accepts a placeholder referencing an earlier step', async () => {
        const dir = await fixture();
        await (0, promises_1.writeFile)((0, node_path_1.join)(dir, 'good.yaml'), 'id: good\nlabel: Good\nplatforms: [canada-assisted]\nsteps:\n' +
            '  - id: scope\n    kind: form\n    title: Scope\n' +
            '    fields: [{ id: services, type: multiselect, label: Services }]\n' +
            '  - id: checkout\n    kind: git-ops\n    title: Checkout\n' +
            '    repos: "{{scope.services}}"\n    ops: [clone]\n    branch: "{{task.epic}}-x"\n');
        const c = await WorkflowCatalog_1.WorkflowCatalog.load(dir);
        (0, vitest_1.expect)(c.get('good').steps).toHaveLength(2);
    });
    (0, vitest_1.it)('rejects an unknown task placeholder', async () => {
        const dir = await fixture();
        await (0, promises_1.writeFile)((0, node_path_1.join)(dir, 'badtask.yaml'), 'id: badtask\nlabel: BadTask\nplatforms: [canada-assisted]\nsteps:\n' +
            '  - id: a\n    kind: git-ops\n    title: A\n    ops: [clone]\n' +
            '    branch: "{{task.nonsense}}"\n');
        await (0, vitest_1.expect)(WorkflowCatalog_1.WorkflowCatalog.load(dir)).rejects.toThrow(/task\.nonsense/);
    });
});
