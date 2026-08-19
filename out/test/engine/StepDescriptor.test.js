"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const StepDescriptor_1 = require("../../src/engine/StepDescriptor");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
const CollectRequirement_1 = require("../../src/tasks/CollectRequirement");
const GitClone_1 = require("../../src/tasks/GitClone");
const ManualReview_1 = require("../../src/tasks/ManualReview");
const TaskType_1 = require("../../src/tasks/TaskType");
const fixtures_1 = require("../support/fixtures");
const noSink = { async copy() { }, async toTerminal() { } };
const workflow = (0, WorkflowCatalog_1.buildWorkflow)('researchTaskWorkflow', '1.0', {
    schemaVersion: 1,
    label: 'Research Task',
    initialStep: 'requirement',
    steps: {
        requirement: {
            stepType: 'task',
            taskType: 'CollectRequirement',
            documentation: 'Describe what you need to find out.',
            nextStep: 'gitClone',
        },
        gitClone: {
            stepType: 'commandExecution',
            taskType: 'gitClone',
            documentation: 'Clones the microservices you selected.',
            nextStep: 'reviewAnalysis',
        },
        reviewAnalysis: { stepType: 'manual', taskType: 'manualReview', documentation: '' },
    },
});
const registry = new TaskType_1.TaskTypeRegistry([
    new CollectRequirement_1.CollectRequirement(),
    new GitClone_1.GitClone('/code', () => false, noSink),
    new ManualReview_1.ManualReview(async () => { }, async () => 'h'),
]);
const state = (0, fixtures_1.taskState)({
    currentStepId: 'gitClone',
    steps: {
        requirement: { status: 'complete', answers: { story: 'why is checkout slow' } },
    },
});
const ctx = (0, fixtures_1.context)({ order: workflow.order, inputs: { services: ['pis'], baseBranch: 'develop', workDir: '/Users/you/work' } });
function build(values = {}, errors = {}) {
    return (0, StepDescriptor_1.buildWorkflowDescriptor)({ workflow, state, registry, ctx, values, errors });
}
(0, vitest_1.describe)('buildWorkflowDescriptor', () => {
    (0, vitest_1.it)('stamps protocol version 2', async () => {
        (0, vitest_1.expect)((await build()).protocolVersion).toBe(StepDescriptor_1.PROTOCOL_VERSION);
        (0, vitest_1.expect)(StepDescriptor_1.PROTOCOL_VERSION).toBe(2);
    });
    (0, vitest_1.it)('returns every step in nextStep order, so the whole journey is visible', async () => {
        (0, vitest_1.expect)((await build()).steps.map((s) => s.id)).toEqual(['requirement', 'gitClone', 'reviewAnalysis']);
    });
    (0, vitest_1.it)('numbers steps from one', async () => {
        (0, vitest_1.expect)((await build()).steps.map((s) => s.index)).toEqual([1, 2, 3]);
    });
    (0, vitest_1.it)('titles each step from its taskType, never from the workflow JSON', async () => {
        (0, vitest_1.expect)((await build()).steps.map((s) => s.title)).toEqual([
            'Collect the requirement',
            'Get the code',
            'Review the result',
        ]);
    });
    (0, vitest_1.it)('carries the workflow author’s documentation through to the developer', async () => {
        (0, vitest_1.expect)((await build()).steps[0].documentation).toBe('Describe what you need to find out.');
    });
    (0, vitest_1.it)('marks status across the workflow', async () => {
        (0, vitest_1.expect)((await build()).steps.map((s) => s.status)).toEqual(['complete', 'current', 'pending']);
    });
    (0, vitest_1.it)('names the active step', async () => {
        (0, vitest_1.expect)((await build()).activeStepId).toBe('gitClone');
    });
    (0, vitest_1.it)('gives fields only to the active step', async () => {
        const [requirement, gitClone, review] = (await build()).steps;
        (0, vitest_1.expect)(requirement.fields).toBeUndefined();
        (0, vitest_1.expect)(gitClone.fields).toBeUndefined();
        (0, vitest_1.expect)(review.fields).toBeUndefined();
    });
    (0, vitest_1.it)('gives the active step its fields when it has any', async () => {
        const onRequirement = await (0, StepDescriptor_1.buildWorkflowDescriptor)({
            workflow,
            state: (0, fixtures_1.taskState)({ currentStepId: 'requirement' }),
            registry,
            ctx,
            values: {},
            errors: {},
        });
        (0, vitest_1.expect)(onRequirement.steps[0].fields).toHaveLength(2);
    });
    (0, vitest_1.it)('summarises a completed step from its answers', async () => {
        (0, vitest_1.expect)((await build()).steps[0].summary).toBe('why is checkout slow');
    });
    (0, vitest_1.it)('shows a completed step’s answers read-only', async () => {
        (0, vitest_1.expect)((await build()).steps[0].answers).toEqual([
            { label: 'JIRA story acceptance criteria as is', value: 'why is checkout slow' },
        ]);
    });
    (0, vitest_1.it)('offers Edit on completed steps only', async () => {
        const [requirement, , review] = (await build()).steps;
        (0, vitest_1.expect)(requirement.actions?.map((a) => a.id)).toEqual(['edit']);
        (0, vitest_1.expect)(review.actions).toBeUndefined();
    });
    (0, vitest_1.it)('gives the active step the actions its taskType declares', async () => {
        (0, vitest_1.expect)((await build()).steps[1].actions?.map((a) => a.id)).toEqual(['back', 'submit']);
    });
    (0, vitest_1.it)('carries the planned commands on the active command step', async () => {
        (0, vitest_1.expect)((await build()).steps[1].commands?.map((c) => c.id)).toEqual(['pis']);
    });
    (0, vitest_1.it)('gives commands only to the active step', async () => {
        (0, vitest_1.expect)((await build()).steps[0].commands).toBeUndefined();
        (0, vitest_1.expect)((await build()).steps[2].commands).toBeUndefined();
    });
    (0, vitest_1.it)('prefills the active step from stored answers when re-editing', async () => {
        const editing = await (0, StepDescriptor_1.buildWorkflowDescriptor)({
            workflow,
            state: (0, fixtures_1.taskState)({ ...state, currentStepId: 'requirement' }),
            registry,
            ctx,
            values: {},
            errors: {},
        });
        (0, vitest_1.expect)(editing.steps[0].values).toEqual({ story: 'why is checkout slow' });
    });
    (0, vitest_1.it)('carries task identity for the header', async () => {
        (0, vitest_1.expect)((await build()).task).toEqual({
            id: 'T-1',
            platform: 'canada-assisted',
            epic: 'PLAT-1234',
            workflowLabel: 'Research Task',
        });
    });
    (0, vitest_1.it)('surfaces errors on the active step', async () => {
        (0, vitest_1.expect)((await build({}, { question: 'required' })).steps[1].errors).toEqual({ question: 'required' });
    });
});
(0, vitest_1.describe)('badgeFor', () => {
    (0, vitest_1.it)('labels a text form INPUT', () => {
        (0, vitest_1.expect)((0, StepDescriptor_1.badgeFor)((0, fixtures_1.step)('a'), [{ id: 'q', type: 'textarea', label: 'Q' }])).toBe('INPUT');
    });
    (0, vitest_1.it)('labels a choice form SELECT', () => {
        (0, vitest_1.expect)((0, StepDescriptor_1.badgeFor)((0, fixtures_1.step)('a'), [{ id: 's', type: 'multiselect', label: 'S' }])).toBe('SELECT');
    });
    (0, vitest_1.it)('labels the other stepTypes by stepType', () => {
        (0, vitest_1.expect)((0, StepDescriptor_1.badgeFor)((0, fixtures_1.step)('a', { stepType: 'commandExecution' }), undefined)).toBe('COMMAND');
        (0, vitest_1.expect)((0, StepDescriptor_1.badgeFor)((0, fixtures_1.step)('a', { stepType: 'aiHandoff' }), undefined)).toBe('COPILOT');
        (0, vitest_1.expect)((0, StepDescriptor_1.badgeFor)((0, fixtures_1.step)('a', { stepType: 'manual' }), undefined)).toBe('REVIEW');
    });
});
(0, vitest_1.describe)('summarise', () => {
    const git = (0, fixtures_1.step)('gitClone', { stepType: 'commandExecution' });
    (0, vitest_1.it)('reports repos and branch for a command step', () => {
        const s = (0, StepDescriptor_1.summarise)(git, {
            status: 'complete',
            result: { repos: [{ name: 'pis' }, { name: 'ords' }], branch: 'develop' },
        }, undefined);
        (0, vitest_1.expect)(s).toBe('2 repos on develop');
    });
    (0, vitest_1.it)('reads naturally for a single repository', () => {
        const s = (0, StepDescriptor_1.summarise)(git, { status: 'complete', result: { repos: [{ name: 'pis' }], branch: 'develop' } }, undefined);
        (0, vitest_1.expect)(s).toBe('1 repo on develop');
    });
    (0, vitest_1.it)('reports whether the handoff output arrived, by filename', () => {
        const handoff = (0, fixtures_1.step)('aiHandoff', { stepType: 'aiHandoff' });
        const result = { outputPath: '/tasks/T-1/02-analysis.md' };
        (0, vitest_1.expect)((0, StepDescriptor_1.summarise)(handoff, { status: 'complete', result: { ...result, outputPresent: true } }, undefined))
            .toBe('02-analysis.md written');
        (0, vitest_1.expect)((0, StepDescriptor_1.summarise)(handoff, { status: 'complete', result: { ...result, outputPresent: false } }, undefined))
            .toBe('02-analysis.md missing');
    });
    (0, vitest_1.it)('names the approved artifact for a manual step', () => {
        const review = (0, fixtures_1.step)('reviewAnalysis', { stepType: 'manual' });
        const s = (0, StepDescriptor_1.summarise)(review, { status: 'complete', result: { artifactPath: '/tasks/T-1/02-analysis.md' } }, undefined);
        (0, vitest_1.expect)(s).toBe('02-analysis.md approved');
    });
    (0, vitest_1.it)('returns nothing for an incomplete step', () => {
        (0, vitest_1.expect)((0, StepDescriptor_1.summarise)((0, fixtures_1.step)('a'), { status: 'pending' }, undefined)).toBeUndefined();
    });
    (0, vitest_1.it)('truncates a long answer', () => {
        const s = (0, StepDescriptor_1.summarise)((0, fixtures_1.step)('a'), { status: 'complete', answers: { q: 'x'.repeat(200) } }, [{ id: 'q', type: 'textarea', label: 'Q' }]);
        (0, vitest_1.expect)(s.length).toBeLessThanOrEqual(118);
        (0, vitest_1.expect)(s.endsWith('…')).toBe(true);
    });
});
