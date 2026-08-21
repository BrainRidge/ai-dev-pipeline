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
const ManualReview_1 = require("../../src/tasks/ManualReview");
const TaskType_1 = require("../../src/tasks/TaskType");
const fixtures_1 = require("../support/fixtures");
const ROOT = (0, node_path_1.join)(__dirname, '../..');
const CONFIG = {
    platformConfig: (0, node_path_1.join)(ROOT, 'examples/content-template/config/platforms.json'),
    microserviceConfig: (0, node_path_1.join)(ROOT, 'examples/content-template/config/microservices.json'),
};
/**
 * The bundled research workflow, run end to end against the real JSON, the real
 * microservice catalogue and the real prompt template. This is what proves the
 * configuration and the code agree — every other test uses fixtures.
 */
(0, vitest_1.describe)('the bundled research workflow', () => {
    let copied = [];
    const sink = {
        async copy(text) { copied.push(text); },
        async toTerminal(text) { copied.push(text); },
    };
    let delivered = [];
    let opened = [];
    let outputWritten = false;
    (0, vitest_1.beforeEach)(() => {
        copied = [];
        delivered = [];
        opened = [];
        outputWritten = false;
    });
    async function run() {
        const catalog = await WorkflowCatalog_1.WorkflowCatalog.load((0, node_path_1.join)(ROOT, 'workflows'), CONFIG);
        const workflow = catalog.get('researchTaskWorkflow');
        const taskDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'run-'));
        const services = catalog.microservices().slice(0, 2).map((s) => s.shortCode);
        const registry = new TaskType_1.TaskTypeRegistry([
            new CollectRequirement_1.CollectRequirement(),
            new GitClone_1.GitClone('/code', () => false, sink),
            new InvokeCopilot_1.InvokeCopilot(new PromptComposer_1.PromptComposer((0, fixtures_1.bundledResolver)((0, node_path_1.join)(ROOT, 'prompts'))), { async deliver(prompt) { delivered.push(prompt); return 'A'; } }, new AuditLog_1.AuditLog(taskDir), async () => outputWritten, sink),
            new ManualReview_1.ManualReview(async (p) => { opened.push(p); }, async () => 'deadbeef'),
        ]);
        registry.validateWorkflow(workflow.id, workflow.steps);
        const store = new TaskStateStore_1.TaskStateStore(taskDir);
        const state = (0, fixtures_1.taskState)({
            workflowId: workflow.id,
            currentStepId: workflow.initialStep,
            inputs: { services, baseBranch: 'develop', workDir: '/Users/you/work' },
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
        return { workflow, engine, registry, ctx, store, refresh, taskDir, services };
    }
    (0, vitest_1.it)('walks requirement → gitClone → aiHandoff → reviewAnalysis', async () => {
        const { engine, store, refresh } = await run();
        (0, vitest_1.expect)((await engine.current()).id).toBe('requirement');
        await engine.submit('requirement', 'submit', { story: 'why is checkout slow' });
        await refresh();
        (0, vitest_1.expect)((await engine.current()).id).toBe('gitClone');
        await engine.submit('gitClone', 'submit', {});
        await refresh();
        (0, vitest_1.expect)((await engine.current()).id).toBe('aiHandoff');
        outputWritten = true;
        await engine.submit('aiHandoff', 'done', { confirmed: true, outputPresent: true });
        await refresh();
        (0, vitest_1.expect)((await engine.current()).id).toBe('reviewAnalysis');
        (0, vitest_1.expect)(await engine.submit('reviewAnalysis', 'approve', {})).toEqual({ ok: true, done: true });
        const final = await store.read();
        (0, vitest_1.expect)(Object.keys(final.steps)).toEqual([
            'requirement',
            'gitClone',
            'aiHandoff',
            'reviewAnalysis',
        ]);
    });
    (0, vitest_1.it)('plans clone commands rather than running them', async () => {
        const { engine, registry, ctx, refresh, services } = await run();
        await engine.submit('requirement', 'submit', { story: 'why' });
        await refresh();
        const blocks = registry.get('gitClone').plan(ctx);
        (0, vitest_1.expect)(blocks.map((b) => b.id)).toEqual(services);
        (0, vitest_1.expect)(blocks[0].lines).toContain('cd /Users/you/work');
        (0, vitest_1.expect)(blocks[0].lines).toContain('git checkout develop');
    });
    (0, vitest_1.it)('copies a block only when the developer asks for it', async () => {
        const { engine, registry, ctx, refresh, services } = await run();
        await engine.submit('requirement', 'submit', { story: 'why' });
        await refresh();
        (0, vitest_1.expect)(copied).toEqual([]);
        await registry.get('gitClone').deliver(services[0], 'copy', ctx);
        (0, vitest_1.expect)(copied).toHaveLength(1);
        (0, vitest_1.expect)(copied[0]).toContain('git checkout develop');
    });
    (0, vitest_1.it)('composes a prompt carrying the answers, the repo paths and the output contract', async () => {
        const { engine, registry, ctx, workflow, refresh } = await run();
        await engine.submit('requirement', 'submit', { story: 'why is checkout slow' });
        await refresh();
        await engine.submit('gitClone', 'submit', {});
        await refresh();
        // The handoff finds the cloned repositories itself, from the step behind it.
        const task = registry.get('invokeCopilot');
        await task.deliver(workflow.steps.aiHandoff, ctx);
        const prompt = delivered[0];
        (0, vitest_1.expect)(prompt).toContain('why is checkout slow');
        (0, vitest_1.expect)(prompt).toContain('Platform: canada-assisted');
        (0, vitest_1.expect)(prompt).toContain('#file:/Users/you/work/');
        (0, vitest_1.expect)(prompt).toContain((0, node_path_1.join)(ctx.taskDir, '02-analysis.md'));
        (0, vitest_1.expect)(prompt).not.toContain('{{');
    });
    (0, vitest_1.it)('opens the artifact the handoff step declared, without naming it twice', async () => {
        const { engine, registry, ctx, workflow, refresh, taskDir } = await run();
        await engine.submit('requirement', 'submit', { story: 'why' });
        await refresh();
        await engine.submit('gitClone', 'submit', {});
        await refresh();
        outputWritten = true;
        await (0, promises_1.writeFile)((0, node_path_1.join)(taskDir, '02-analysis.md'), '# Analysis\n');
        await engine.submit('aiHandoff', 'done', { confirmed: true, outputPresent: true });
        await refresh();
        await registry.get('manualReview').open(workflow.steps.reviewAnalysis, ctx);
        (0, vitest_1.expect)(opened).toEqual([(0, node_path_1.join)(taskDir, '02-analysis.md')]);
    });
    (0, vitest_1.it)('revise on the review step sends the work back to the handoff', async () => {
        const { engine, store, refresh } = await run();
        await engine.submit('requirement', 'submit', { story: 'why' });
        await refresh();
        await engine.submit('gitClone', 'submit', {});
        await refresh();
        outputWritten = true;
        await engine.submit('aiHandoff', 'done', { confirmed: true, outputPresent: true });
        await refresh();
        await engine.submit('reviewAnalysis', 'revise', {});
        (0, vitest_1.expect)((await engine.current()).id).toBe('aiHandoff');
        (0, vitest_1.expect)((await store.read()).steps.aiHandoff.status).toBe('pending');
    });
    (0, vitest_1.it)('blocks the handoff until the artifact exists, whatever the developer clicks', async () => {
        const { engine, refresh } = await run();
        await engine.submit('requirement', 'submit', { story: 'why' });
        await refresh();
        await engine.submit('gitClone', 'submit', {});
        await refresh();
        const blocked = await engine.submit('aiHandoff', 'done', {
            confirmed: true,
            outputPresent: false,
            outputFile: '02-analysis.md',
        });
        (0, vitest_1.expect)(blocked).toMatchObject({ ok: false });
        (0, vitest_1.expect)((await engine.current()).id).toBe('aiHandoff');
    });
    (0, vitest_1.it)('renders a descriptor the webview can draw, with no workflow-specific code', async () => {
        const { engine, workflow, registry, ctx, store, refresh } = await run();
        await engine.submit('requirement', 'submit', { story: 'why is checkout slow' });
        await refresh();
        const descriptor = await (0, StepDescriptor_1.buildWorkflowDescriptor)({
            workflow,
            state: await store.read(),
            registry,
            ctx,
            values: {},
            errors: {},
        });
        (0, vitest_1.expect)(descriptor.steps.map((s) => s.badge)).toEqual([
            'INPUT',
            'COMMAND',
            'COPILOT',
            'REVIEW',
        ]);
        (0, vitest_1.expect)(descriptor.activeStepId).toBe('gitClone');
        (0, vitest_1.expect)(descriptor.steps[0].summary).toBe('why is checkout slow');
        (0, vitest_1.expect)(descriptor.steps.every((s) => (s.documentation ?? '').length > 20)).toBe(true);
    });
});
