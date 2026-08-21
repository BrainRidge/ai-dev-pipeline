"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
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
 * The bundled Bug Fix workflow, run against its real JSON and its real prompt
 * templates. It is composed entirely from taskTypes that already existed, which
 * is the claim spec acceptance criterion 11 makes: a new workflow costs a JSON
 * file and some markdown, and no TypeScript.
 */
(0, vitest_1.describe)('the bundled bug fix workflow', () => {
    let delivered = [];
    let outputWritten = false;
    (0, vitest_1.beforeEach)(() => {
        delivered = [];
        outputWritten = false;
    });
    async function run() {
        const catalog = await WorkflowCatalog_1.WorkflowCatalog.load((0, node_path_1.join)(ROOT, 'workflows'), CONFIG);
        const workflow = catalog.get('bugFixWorkflow');
        const taskDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'bf-'));
        const services = catalog.microservices().slice(0, 1).map((s) => s.shortCode);
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
            new InvokeCopilot_1.InvokeCopilot(composer, record('diagnosis'), new AuditLog_1.AuditLog(taskDir), async () => outputWritten, noSink),
            new InvokeCopilotCoding_1.InvokeCopilotCoding(composer, record('CodeFix'), new AuditLog_1.AuditLog(taskDir), noSink),
            new InvokeCopilotCodeReview_1.InvokeCopilotCodeReview(composer, record('CodeReview'), new AuditLog_1.AuditLog(taskDir), noSink),
            new ManualReview_1.ManualReview(async () => { }, async () => 'deadbeef'),
        ]);
        registry.validateWorkflow(workflow.id, workflow.steps);
        const store = new TaskStateStore_1.TaskStateStore(taskDir);
        const state = (0, fixtures_1.taskState)({
            workflowId: workflow.id,
            currentStepId: workflow.initialStep,
            inputs: { services, baseBranch: 'release/8.2', workDir: '/Users/you/work' },
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
    const defect = {
        story: 'Applying a promo code twice doubles the discount',
        notes: 'Reproduced on release/8.2 by QA, not on develop',
    };
    async function upTo(stepId) {
        const h = await run();
        for (const id of ['requirement', 'gitClone', 'diagnosis', 'reviewDiagnosis', 'CodeFix']) {
            if (id === stepId)
                break;
            if (id === 'requirement')
                await h.engine.submit(id, 'submit', defect);
            else if (id === 'diagnosis') {
                outputWritten = true;
                await h.engine.submit(id, 'done', { confirmed: true, outputPresent: true });
            }
            else if (id === 'CodeFix') {
                await h.engine.submit(id, 'done', { confirmed: true });
            }
            else
                await h.engine.submit(id, 'submit', {});
            await h.refresh();
        }
        return h;
    }
    (0, vitest_1.it)('joins Research and New Feature as a third task type', async () => {
        const catalog = await WorkflowCatalog_1.WorkflowCatalog.load((0, node_path_1.join)(ROOT, 'workflows'), CONFIG);
        (0, vitest_1.expect)(catalog.all().map((w) => w.label).sort()).toEqual([
            'Bug Fix',
            'New Feature',
            'Research Task',
        ]);
    });
    (0, vitest_1.it)('names only taskTypes that already existed — no new TypeScript', async () => {
        const { workflow, registry } = await run();
        (0, vitest_1.expect)(() => registry.validateWorkflow(workflow.id, workflow.steps)).not.toThrow();
    });
    (0, vitest_1.it)('diagnoses before it fixes, which is the whole shape of the workflow', async () => {
        const { workflow } = await run();
        (0, vitest_1.expect)(workflow.order).toEqual([
            'requirement',
            'gitClone',
            'diagnosis',
            'reviewDiagnosis',
            'CodeFix',
            'CodeReview',
        ]);
    });
    (0, vitest_1.it)('reaches the terminal review step and reports done', async () => {
        const h = await upTo('CodeReview');
        (0, vitest_1.expect)((await h.engine.current()).id).toBe('CodeReview');
        (0, vitest_1.expect)(await h.engine.submit('CodeReview', 'done', { confirmed: true })).toEqual({
            ok: true,
            done: true,
        });
    });
    (0, vitest_1.it)('contracts the diagnosis to a file, so D9 holds on the step that matters', async () => {
        const h = await upTo('diagnosis');
        const task = h.registry.get('invokeCopilot');
        (0, vitest_1.expect)(await task.outputPath(h.workflow.steps.diagnosis, h.ctx)).toBe((0, node_path_1.join)(h.ctx.taskDir, '02-root-cause.md'));
    });
    (0, vitest_1.it)('tells the diagnosis step to find the cause and change nothing', async () => {
        const h = await upTo('diagnosis');
        const task = h.registry.get('invokeCopilot');
        await task.deliver(h.workflow.steps.diagnosis, h.ctx);
        const prompt = delivered[0].prompt;
        (0, vitest_1.expect)(prompt).toMatch(/do not fix anything in this step/i);
        (0, vitest_1.expect)(prompt).toContain('Applying a promo code twice doubles the discount');
        (0, vitest_1.expect)(prompt).toContain('release/8.2');
        (0, vitest_1.expect)(prompt).not.toContain('{{');
    });
    (0, vitest_1.it)('reviews the diagnosis the handoff wrote, without naming the file twice', async () => {
        const h = await upTo('reviewDiagnosis');
        const task = h.registry.get('manualReview');
        (0, vitest_1.expect)(task.artifactPath(h.workflow.steps.reviewDiagnosis, h.ctx)).toBe((0, node_path_1.join)(h.ctx.taskDir, '02-root-cause.md'));
    });
    (0, vitest_1.it)('asks the fix step for a regression test that fails without the fix', async () => {
        const h = await upTo('CodeFix');
        const task = h.registry.get('invokeCopilotCoding');
        const delivery = await task.deliver(h.workflow.steps.CodeFix, h.ctx);
        (0, vitest_1.expect)(delivery.outputPath).toBeUndefined();
        const prompt = delivered.at(-1).prompt;
        (0, vitest_1.expect)(prompt).toMatch(/failing test first/i);
        (0, vitest_1.expect)(prompt).toContain((0, node_path_1.join)(h.ctx.taskDir, '02-root-cause.md'));
        (0, vitest_1.expect)(prompt).not.toContain('{{');
    });
    (0, vitest_1.it)('has the review step judge the fix against the cause, not the symptom', async () => {
        const h = await upTo('CodeReview');
        const task = h.registry.get('invokeCopilotCodeReview');
        await task.deliver(h.workflow.steps.CodeReview, h.ctx);
        const prompt = delivered.at(-1).prompt;
        (0, vitest_1.expect)(prompt).toMatch(/symptom, not cause/i);
        (0, vitest_1.expect)(prompt).not.toContain('{{');
    });
    (0, vitest_1.it)('never asks for a feature story, which a defect does not have', async () => {
        const h = await upTo('CodeFix');
        const task = h.registry.get('invokeCopilotCoding');
        await task.deliver(h.workflow.steps.CodeFix, h.ctx);
        (0, vitest_1.expect)(delivered.at(-1).prompt).not.toMatch(/story/i);
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
    });
});
