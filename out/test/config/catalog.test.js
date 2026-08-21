"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_path_1 = require("node:path");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
const TaskType_1 = require("../../src/tasks/TaskType");
const CollectRequirement_1 = require("../../src/tasks/CollectRequirement");
const WORKFLOWS = (0, node_path_1.join)(__dirname, '../../workflows');
const CONFIG = {
    platformConfig: (0, node_path_1.join)(__dirname, '../../examples/content-template/config/platforms.json'),
    microserviceConfig: (0, node_path_1.join)(__dirname, '../../examples/content-template/config/microservices.json'),
};
const load = () => WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS, CONFIG);
(0, vitest_1.describe)('bundled configuration', () => {
    (0, vitest_1.it)('loads the versioned research workflow', async () => {
        const wf = (await load()).get('researchTaskWorkflow');
        (0, vitest_1.expect)(wf.version).toBe('1.0');
        (0, vitest_1.expect)(wf.label).toBe('Research Task');
    });
    (0, vitest_1.it)('walks the graph in nextStep order', async () => {
        (0, vitest_1.expect)((await load()).get('researchTaskWorkflow').order).toEqual([
            'systemCheck',
            'requirement',
            'gitClone',
            'aiHandoff',
            'reviewAnalysis',
        ]);
    });
    (0, vitest_1.it)('gives every step documentation to explain it to the developer', async () => {
        const wf = (await load()).get('researchTaskWorkflow');
        for (const id of wf.order) {
            (0, vitest_1.expect)(wf.steps[id].documentation.length).toBeGreaterThan(20);
        }
    });
    // Every workflow opens on the machine check: there is no point collecting a
    // requirement for a task that cannot finish for want of a tool.
    (0, vitest_1.it)('starts every bundled workflow on the system check', async () => {
        for (const wf of (await load()).all()) {
            (0, vitest_1.expect)(wf.initialStep).toBe('systemCheck');
            (0, vitest_1.expect)(wf.order[0]).toBe('systemCheck');
            (0, vitest_1.expect)(wf.steps.systemCheck.stepType).toBe('systemCheck');
        }
    });
    (0, vitest_1.it)('ends on a terminal step', async () => {
        const wf = (await load()).get('researchTaskWorkflow');
        (0, vitest_1.expect)(wf.steps.reviewAnalysis.nextStep).toBeUndefined();
    });
    (0, vitest_1.it)('loads all four platforms as context', async () => {
        (0, vitest_1.expect)((await load()).platforms().map((p) => p.id)).toEqual([
            'canada-assisted',
            'canada-self-serve',
            'us-assisted',
            'us-self-serve',
        ]);
    });
    // Asserted against the shape of the catalogue, not its contents: editing
    // config/microservices.json is configuration, and must not break tests.
    (0, vitest_1.it)('loads every microservice with the facts a task needs', async () => {
        const services = (await load()).microservices();
        (0, vitest_1.expect)(services.length).toBeGreaterThan(0);
        for (const s of services) {
            (0, vitest_1.expect)(s.shortCode).not.toBe('');
            (0, vitest_1.expect)(s.microserviceName).not.toBe('');
            (0, vitest_1.expect)(s.gitLocation).toMatch(/^https?:\/\//);
        }
    });
    (0, vitest_1.it)('finds a service by the shortCode the sidebar selects with', async () => {
        const catalog = await load();
        const first = catalog.microservices()[0];
        (0, vitest_1.expect)(catalog.microserviceByCode(first.shortCode)).toEqual(first);
    });
    (0, vitest_1.it)('gives every service a distinct shortCode, since it is the key', async () => {
        const codes = (await load()).microservices().map((s) => s.shortCode);
        (0, vitest_1.expect)(new Set(codes).size).toBe(codes.length);
    });
    (0, vitest_1.it)('every taskType named by the workflow is implemented', async () => {
        const registry = new TaskType_1.TaskTypeRegistry([new CollectRequirement_1.CollectRequirement()]);
        const wf = (await load()).get('researchTaskWorkflow');
        const named = new Set(Object.values(wf.steps).map((s) => s.taskType));
        (0, vitest_1.expect)(named).toContain('CollectRequirement');
        (0, vitest_1.expect)(registry.has('CollectRequirement')).toBe(true);
    });
});
(0, vitest_1.describe)('microservice search', async () => {
    (0, vitest_1.it)('matches on the full name', async () => {
        const catalog = await load();
        const target = catalog.microservices()[0];
        (0, vitest_1.expect)(catalog.searchMicroservices(target.microserviceName)).toContainEqual(target);
    });
    (0, vitest_1.it)('matches on short code, which is the point for a long list', async () => {
        const catalog = await load();
        const target = catalog.microservices()[0];
        (0, vitest_1.expect)(catalog.searchMicroservices(target.shortCode)).toContainEqual(target);
    });
    (0, vitest_1.it)('matches on category', async () => {
        const catalog = await load();
        const target = catalog.microservices().find((s) => s.category !== '');
        if (!target)
            return;
        (0, vitest_1.expect)(catalog.searchMicroservices(target.category)).toContainEqual(target);
    });
    (0, vitest_1.it)('is case-insensitive', async () => {
        const catalog = await load();
        const code = catalog.microservices()[0].shortCode;
        (0, vitest_1.expect)(catalog.searchMicroservices(code.toUpperCase())).toEqual(catalog.searchMicroservices(code.toLowerCase()));
    });
    (0, vitest_1.it)('finds nothing for a query no service matches', async () => {
        (0, vitest_1.expect)((await load()).searchMicroservices('zzzz-no-such-service')).toEqual([]);
    });
    (0, vitest_1.it)('returns everything for an empty query', async () => {
        const c = await load();
        (0, vitest_1.expect)(c.searchMicroservices('  ').length).toBe(c.microservices().length);
    });
});
(0, vitest_1.describe)('TaskTypeRegistry', async () => {
    const registry = new TaskType_1.TaskTypeRegistry([new CollectRequirement_1.CollectRequirement()]);
    (0, vitest_1.it)('resolves a registered taskType', () => {
        (0, vitest_1.expect)(registry.get('CollectRequirement').stepType).toBe('task');
    });
    (0, vitest_1.it)('lists known types when one is missing, so the error is actionable', () => {
        (0, vitest_1.expect)(() => registry.get('Nope')).toThrow(/Known: CollectRequirement/);
    });
    (0, vitest_1.it)('rejects a workflow whose stepType contradicts its taskType', () => {
        (0, vitest_1.expect)(() => registry.validateWorkflow('wf', {
            a: {
                id: 'a',
                stepType: 'aiHandoff',
                taskType: 'CollectRequirement',
                documentation: '',
            },
        })).toThrow(/declares stepType "aiHandoff" but taskType "CollectRequirement" is a "task" step/);
    });
});
