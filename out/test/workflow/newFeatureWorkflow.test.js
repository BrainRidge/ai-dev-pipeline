"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
const schema_1 = require("../../src/engine/schema");
const WorkflowEngine_1 = require("../../src/engine/WorkflowEngine");
const StepDescriptor_1 = require("../../src/engine/StepDescriptor");
const PromptComposer_1 = require("../../src/prompt/PromptComposer");
const TaskStateStore_1 = require("../../src/state/TaskStateStore");
const AuditLog_1 = require("../../src/audit/AuditLog");
const CollectRequirement_1 = require("../../src/tasks/CollectRequirement");
const GitClone_1 = require("../../src/tasks/GitClone");
const InvokeCopilot_1 = require("../../src/tasks/InvokeCopilot");
const InvokeCopilotCoding_1 = require("../../src/tasks/InvokeCopilotCoding");
const InvokeCopilotCodeReview_1 = require("../../src/tasks/InvokeCopilotCodeReview");
const ManualReview_1 = require("../../src/tasks/ManualReview");
const TaskType_1 = require("../../src/tasks/TaskType");
const fixtures_1 = require("../support/fixtures");
const ROOT = (0, node_path_1.join)(__dirname, '../..');
const CONFIG = {
    platformConfig: (0, node_path_1.join)(ROOT, 'examples/content-template/config/platforms.json'),
    microserviceConfig: (0, node_path_1.join)(ROOT, 'examples/content-template/config/microservices.json'),
};
const noSink = { async copy() { }, async toTerminal() { } };
/**
 * The bundled New Feature workflow, run against its real JSON and its real
 * prompt templates. Its microservices come from whatever the catalogue holds,
 * so editing config/microservices.json cannot break this test.
 */
(0, vitest_1.describe)('the bundled new feature workflow', () => {
    let delivered = [];
    let outputWritten = false;
    (0, vitest_1.beforeEach)(() => {
        delivered = [];
        outputWritten = false;
    });
    async function run() {
        const catalog = await WorkflowCatalog_1.WorkflowCatalog.load((0, node_path_1.join)(ROOT, 'workflows'), CONFIG);
        const workflow = catalog.get('newFeatureWorkflow');
        const taskDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'nf-'));
        const services = catalog.microservices().slice(0, 2).map((s) => s.shortCode);
        const composer = new PromptComposer_1.PromptComposer((0, fixtures_1.bundledResolver)((0, node_path_1.join)(ROOT, 'prompts')));
        const record = (stepId) => ({
            async deliver(prompt) {
                delivered.push({ stepId, prompt });
                return 'A';
            },
        });
        const registry = new TaskType_1.TaskTypeRegistry([
            new CollectRequirement_1.CollectRequirement(),
            new GitClone_1.GitClone('/code', () => false, noSink),
            new InvokeCopilot_1.InvokeCopilot(composer, record('aiHandoff'), new AuditLog_1.AuditLog(taskDir), async () => outputWritten, noSink),
            new InvokeCopilotCoding_1.InvokeCopilotCoding(composer, record('CodeImplementation'), new AuditLog_1.AuditLog(taskDir), noSink),
            new InvokeCopilotCodeReview_1.InvokeCopilotCodeReview(composer, record('CodeReview'), new AuditLog_1.AuditLog(taskDir), noSink),
            new ManualReview_1.ManualReview(async () => { }, async () => 'deadbeef'),
        ]);
        registry.validateWorkflow(workflow.id, workflow.steps);
        const store = new TaskStateStore_1.TaskStateStore(taskDir);
        const state = (0, fixtures_1.taskState)({
            workflowId: workflow.id,
            currentStepId: workflow.initialStep,
            inputs: { services, baseBranch: 'develop', workDir: '/Users/you/work', featureStory: 'PLAT-4821' },
        });
        await store.write(state);
        const holder = { state: await store.read() };
        const ctx = {
            platform: { id: 'canada-assisted', label: 'Canada Assisted' },
            microservices: catalog.microservices(),
            taskDir,
            epic: 'PLAT-1234',
            taskId: state.taskId,
            workflowId: workflow.id,
            inputs: state.inputs,
            order: workflow.order,
            answersOf: (id) => holder.state.steps[id]?.answers ?? {},
            resultOf: (id) => holder.state.steps[id]?.result ?? {},
        };
        const engine = new WorkflowEngine_1.WorkflowEngine(workflow, store, registry, ctx);
        const refresh = async () => {
            holder.state = await store.read();
        };
        return { workflow, engine, registry, ctx, store, refresh, services };
    }
    const requirement = { story: 'As a customer I can apply for a product', notes: 'from refinement' };
    async function upTo(stepId) {
        const h = await run();
        const path = ['requirement', 'gitClone', 'aiHandoff', 'reviewAnalysis', 'CodeImplementation'];
        for (const id of path) {
            if (id === stepId)
                break;
            if (id === 'requirement')
                await h.engine.submit(id, 'submit', requirement);
            else if (id === 'aiHandoff') {
                outputWritten = true;
                await h.engine.submit(id, 'done', { confirmed: true, outputPresent: true });
            }
            else if (id === 'CodeImplementation') {
                await h.engine.submit(id, 'done', { confirmed: true });
            }
            else
                await h.engine.submit(id, 'submit', {});
            await h.refresh();
        }
        return h;
    }
    (0, vitest_1.it)('is loaded from the workflows directory alongside the other task types', async () => {
        const catalog = await WorkflowCatalog_1.WorkflowCatalog.load((0, node_path_1.join)(ROOT, 'workflows'), CONFIG);
        (0, vitest_1.expect)(catalog.all().map((w) => w.label).sort()).toEqual([
            'Bug Fix',
            'New Feature',
            'Research Task',
        ]);
    });
    (0, vitest_1.it)('names only taskTypes that are implemented', async () => {
        const { workflow, registry } = await run();
        (0, vitest_1.expect)(() => registry.validateWorkflow(workflow.id, workflow.steps)).not.toThrow();
    });
    (0, vitest_1.it)('walks all six steps in nextStep order', async () => {
        const { workflow } = await run();
        (0, vitest_1.expect)(workflow.order).toEqual([
            'requirement',
            'gitClone',
            'aiHandoff',
            'reviewAnalysis',
            'CodeImplementation',
            'CodeReview',
        ]);
    });
    (0, vitest_1.it)('reaches the terminal code review step and reports done', async () => {
        const h = await upTo('CodeReview');
        (0, vitest_1.expect)((await h.engine.current()).id).toBe('CodeReview');
        (0, vitest_1.expect)(await h.engine.submit('CodeReview', 'done', { confirmed: true })).toEqual({
            ok: true,
            done: true,
        });
    });
    (0, vitest_1.it)('carries the feature story and base branch into the planning prompt', async () => {
        const h = await upTo('aiHandoff');
        const task = h.registry.get('invokeCopilot');
        await task.deliver(h.workflow.steps.aiHandoff, h.ctx);
        const prompt = delivered[0].prompt;
        (0, vitest_1.expect)(prompt).toContain('Story: PLAT-4821');
        (0, vitest_1.expect)(prompt).toContain('based on `develop`');
        (0, vitest_1.expect)(prompt).toContain('As a customer I can apply for a product');
        (0, vitest_1.expect)(prompt).not.toContain('{{');
    });
    (0, vitest_1.it)('contracts the planning step to a file, so D9 still holds there', async () => {
        const h = await upTo('aiHandoff');
        const task = h.registry.get('invokeCopilot');
        (0, vitest_1.expect)(await task.outputPath(h.workflow.steps.aiHandoff, h.ctx)).toBe((0, node_path_1.join)(h.ctx.taskDir, '02-implementation-plan.md'));
    });
    (0, vitest_1.it)('contracts the coding step to edits instead of a file', async () => {
        const h = await upTo('CodeImplementation');
        const task = h.registry.get('invokeCopilotCoding');
        const delivery = await task.deliver(h.workflow.steps.CodeImplementation, h.ctx);
        (0, vitest_1.expect)(delivery.outputPath).toBeUndefined();
        (0, vitest_1.expect)(delivered.at(-1).prompt).toContain('Change the code in place');
        (0, vitest_1.expect)(delivered.at(-1).prompt).not.toContain('Create the file if it does not exist');
    });
    (0, vitest_1.it)('points the coding step at the plan the developer approved', async () => {
        const h = await upTo('CodeImplementation');
        const task = h.registry.get('invokeCopilotCoding');
        await task.deliver(h.workflow.steps.CodeImplementation, h.ctx);
        (0, vitest_1.expect)(delivered.at(-1).prompt).toContain((0, node_path_1.join)(h.ctx.taskDir, '02-implementation-plan.md'));
    });
    (0, vitest_1.it)('lets the coding step complete on confirmation alone', async () => {
        const h = await upTo('CodeImplementation');
        (0, vitest_1.expect)(await h.engine.submit('CodeImplementation', 'done', { confirmed: true })).toEqual({
            ok: true,
            done: false,
        });
    });
    (0, vitest_1.it)('blocks the coding step when the developer has not confirmed', async () => {
        const h = await upTo('CodeImplementation');
        (0, vitest_1.expect)(await h.engine.submit('CodeImplementation', 'done', {})).toMatchObject({ ok: false });
    });
    (0, vitest_1.it)('reviews the plan the handoff wrote, without naming it twice', async () => {
        const h = await upTo('reviewAnalysis');
        const task = h.registry.get('manualReview');
        (0, vitest_1.expect)(task.artifactPath(h.workflow.steps.reviewAnalysis, h.ctx)).toBe((0, node_path_1.join)(h.ctx.taskDir, '02-implementation-plan.md'));
    });
    (0, vitest_1.it)('shows the real composed prompt on the handoff step, ready to copy', async () => {
        const h = await upTo('aiHandoff');
        const descriptor = await (0, StepDescriptor_1.buildWorkflowDescriptor)({
            workflow: h.workflow,
            state: await h.store.read(),
            registry: h.registry,
            ctx: h.ctx,
            values: {},
            errors: {},
        });
        const handoff = descriptor.steps.find((s) => s.id === 'aiHandoff');
        const prompt = handoff.commands[0].lines.join('\n');
        (0, vitest_1.expect)(prompt).toContain('Story: PLAT-4821');
        (0, vitest_1.expect)(prompt).toContain('As a customer I can apply for a product');
        (0, vitest_1.expect)(prompt).not.toContain('{{');
        (0, vitest_1.expect)(handoff.commands[0].actions.map((a) => a.id)).toEqual(['copy', 'send']);
    });
    (0, vitest_1.it)('badges the six steps for the panel with no workflow-specific code', async () => {
        const h = await upTo('gitClone');
        const descriptor = await (0, StepDescriptor_1.buildWorkflowDescriptor)({
            workflow: h.workflow,
            state: await h.store.read(),
            registry: h.registry,
            ctx: h.ctx,
            values: {},
            errors: {},
        });
        (0, vitest_1.expect)(descriptor.steps.map((s) => s.badge)).toEqual([
            'INPUT',
            'COMMAND',
            'COPILOT',
            'REVIEW',
            'COPILOT',
            'COPILOT',
        ]);
        (0, vitest_1.expect)(descriptor.steps.map((s) => s.title)).toEqual([
            'Collect the requirement',
            'Get the code',
            'Hand off to Copilot',
            'Review the result',
            'Implement the code',
            'Review the code',
        ]);
    });
    (0, vitest_1.it)('plans commands for whichever services the catalogue actually holds', async () => {
        const h = await upTo('gitClone');
        const task = h.registry.get('gitClone');
        (0, vitest_1.expect)(task.plan(h.ctx).map((b) => b.id)).toEqual(h.services);
    });
    (0, vitest_1.it)('puts each repository on the base branch chosen in the sidebar', async () => {
        const h = await upTo('gitClone');
        const task = h.registry.get('gitClone');
        const lines = task.plan(h.ctx).flatMap((b) => b.lines);
        (0, vitest_1.expect)(lines).toContain('git checkout develop');
        (0, vitest_1.expect)(lines.join('\n')).not.toContain('checkout -b');
    });
    (0, vitest_1.it)('records the repositories under their own repository names', async () => {
        const h = await upTo('gitClone');
        await h.engine.submit('gitClone', 'submit', {});
        const expected = h.ctx.microservices
            .filter((s) => h.services.includes(s.shortCode))
            .map((s) => (0, schema_1.repoNameOf)(s.gitLocation));
        const result = (await h.store.read()).steps.gitClone.result;
        (0, vitest_1.expect)(result.repos.map((r) => r.name)).toEqual(expected);
    });
});
