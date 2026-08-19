"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const schema_1 = require("../../src/engine/schema");
const minimal = {
    schemaVersion: 1,
    label: 'Research Task',
    initialStep: 'requirement',
    steps: {
        requirement: {
            stepType: 'task',
            taskType: 'CollectRequirement',
            documentation: 'Describe what you need to find out.',
        },
    },
};
(0, vitest_1.describe)('workflowFileSchema', () => {
    (0, vitest_1.it)('accepts a minimal valid workflow', () => {
        (0, vitest_1.expect)(schema_1.workflowFileSchema.parse(minimal).steps.requirement.taskType).toBe('CollectRequirement');
    });
    (0, vitest_1.it)('defaults documentation to empty rather than failing the load', () => {
        const parsed = schema_1.workflowFileSchema.parse({
            ...minimal,
            steps: { requirement: { stepType: 'task', taskType: 'CollectRequirement' } },
        });
        (0, vitest_1.expect)(parsed.steps.requirement.documentation).toBe('');
    });
    (0, vitest_1.it)('rejects an unknown stepType', () => {
        (0, vitest_1.expect)(() => schema_1.workflowFileSchema.parse({
            ...minimal,
            steps: { requirement: { stepType: 'teleport', taskType: 'X' } },
        })).toThrow();
    });
    (0, vitest_1.it)('rejects a step with no taskType, since there would be nothing to run', () => {
        (0, vitest_1.expect)(() => schema_1.workflowFileSchema.parse({ ...minimal, steps: { requirement: { stepType: 'task' } } })).toThrow();
    });
    (0, vitest_1.it)('rejects a schemaVersion it does not understand', () => {
        (0, vitest_1.expect)(() => schema_1.workflowFileSchema.parse({ ...minimal, schemaVersion: 2 })).toThrow();
    });
    (0, vitest_1.it)('rejects a workflow with no entry point', () => {
        const { initialStep: _initialStep, ...rest } = minimal;
        (0, vitest_1.expect)(() => schema_1.workflowFileSchema.parse(rest)).toThrow();
    });
});
(0, vitest_1.describe)('microservicesFileSchema', () => {
    const service = {
        microserviceName: 'Payment Service',
        shortCode: 'pis',
        gitLocation: 'https://abc.github/payment-service.ui',
    };
    (0, vitest_1.it)('accepts a service with only its required facts', () => {
        const [parsed] = schema_1.microservicesFileSchema.parse([service]);
        (0, vitest_1.expect)(parsed.purpose).toBe('');
        (0, vitest_1.expect)(parsed.category).toBe('');
    });
    (0, vitest_1.it)('requires a git location, because a service that cannot be cloned is useless', () => {
        const { gitLocation: _gitLocation, ...rest } = service;
        (0, vitest_1.expect)(() => schema_1.microservicesFileSchema.parse([rest])).toThrow();
    });
    (0, vitest_1.it)('requires a shortCode, because it is what the sidebar selects by', () => {
        const { shortCode: _shortCode, ...rest } = service;
        (0, vitest_1.expect)(() => schema_1.microservicesFileSchema.parse([rest])).toThrow();
    });
});
(0, vitest_1.describe)('platformsFileSchema', () => {
    (0, vitest_1.it)('accepts platforms as id and label only — platform is context, not a filter', () => {
        const parsed = schema_1.platformsFileSchema.parse({
            platforms: [{ id: 'canada-assisted', label: 'Canada Assisted' }],
        });
        (0, vitest_1.expect)(parsed.platforms).toHaveLength(1);
    });
    (0, vitest_1.it)('rejects a platform with no label', () => {
        (0, vitest_1.expect)(() => schema_1.platformsFileSchema.parse({ platforms: [{ id: 'x' }] })).toThrow();
    });
});
