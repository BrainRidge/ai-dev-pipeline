"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_path_1 = require("node:path");
const promises_1 = require("node:fs/promises");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
const WORKFLOWS = (0, node_path_1.join)(__dirname, '../../workflows');
(0, vitest_1.describe)('bundled configuration', () => {
    (0, vitest_1.it)('loads and validates', async () => {
        const c = await WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS);
        (0, vitest_1.expect)(c.get('research').steps.map((s) => s.id)).toEqual([
            'scope',
            'checkout',
            'context',
            'analyse',
            'review',
        ]);
    });
    (0, vitest_1.it)('defines all four platforms', async () => {
        const c = await WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS);
        (0, vitest_1.expect)(c.platforms().map((p) => p.id).sort()).toEqual([
            'canada-assisted',
            'canada-self-serve',
            'us-assisted',
            'us-self-serve',
        ]);
    });
    (0, vitest_1.it)('offers research on every platform', async () => {
        const c = await WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS);
        for (const p of c.platforms()) {
            (0, vitest_1.expect)(c.forPlatform(p.id).map((w) => w.id)).toContain('research');
        }
    });
    (0, vitest_1.it)('gives every service a git url', async () => {
        const c = await WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS);
        for (const p of c.platforms()) {
            (0, vitest_1.expect)(p.services.length).toBeGreaterThan(0);
            for (const s of p.services)
                (0, vitest_1.expect)(s.gitUrl).toMatch(/^git@|^https:\/\//);
        }
    });
    (0, vitest_1.it)('references a prompt template that exists on disk', async () => {
        const c = await WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS);
        for (const step of c.get('research').steps) {
            if (step.kind !== 'ai-handoff')
                continue;
            await (0, vitest_1.expect)((0, promises_1.access)((0, node_path_1.join)(__dirname, '../../prompts', step.prompt))).resolves.toBeUndefined();
        }
    });
    (0, vitest_1.it)('points its review step at the artifact the handoff step produces', async () => {
        const steps = (await WorkflowCatalog_1.WorkflowCatalog.load(WORKFLOWS)).get('research').steps;
        const handoff = steps.find((s) => s.kind === 'ai-handoff');
        const review = steps.find((s) => s.kind === 'artifact-review');
        (0, vitest_1.expect)(review.artifact).toBe(handoff.output);
        (0, vitest_1.expect)(review.onRevise).toBe(handoff.id);
    });
});
