"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
const WorkflowEngine_1 = require("../../src/engine/WorkflowEngine");
const PromptComposer_1 = require("../../src/prompt/PromptComposer");
const TaskStateStore_1 = require("../../src/state/TaskStateStore");
const AuditLog_1 = require("../../src/audit/AuditLog");
const CollectRequirement_1 = require("../../src/tasks/CollectRequirement");
const InvokeCopilot_1 = require("../../src/tasks/InvokeCopilot");
const ManualReview_1 = require("../../src/tasks/ManualReview");
const TaskType_1 = require("../../src/tasks/TaskType");
const fixtures_1 = require("../support/fixtures");
const noSink = { async copy() { }, async toTerminal() { } };
const ROOT = (0, node_path_1.join)(__dirname, '../..');
const SECOND = {
    schemaVersion: 1,
    label: 'Throwaway Task',
    initialStep: 'requirement',
    steps: {
        requirement: {
            stepType: 'task',
            taskType: 'CollectRequirement',
            documentation: 'Say what you want.',
            nextStep: 'ask',
        },
        ask: {
            stepType: 'aiHandoff',
            taskType: 'invokeCopilot',
            documentation: 'Hand it over.',
            nextStep: 'check',
        },
        check: { stepType: 'manual', taskType: 'manualReview', documentation: 'Read it.' },
    },
};
const TEMPLATE = `---
output: throwaway.md
---
Answer this for {{task.epic}}: {{requirement.story}}
`;
/**
 * Spec acceptance criterion 11: a tool developer adds a workflow with a JSON
 * file and a prompt template, and no TypeScript. This test is that claim, run.
 */
(0, vitest_1.describe)('a second workflow', () => {
    async function bundle() {
        const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'ext-'));
        await (0, promises_1.mkdir)((0, node_path_1.join)(dir, 'workflows'), { recursive: true });
        await (0, promises_1.mkdir)((0, node_path_1.join)(dir, 'prompts', 'throwawayWorkflow'), { recursive: true });
        // Only ever adding files: the bundled workflow is copied in untouched.
        await (0, promises_1.cp)((0, node_path_1.join)(ROOT, 'workflows'), (0, node_path_1.join)(dir, 'workflows'), { recursive: true });
        await (0, promises_1.writeFile)((0, node_path_1.join)(dir, 'workflows', 'throwawayWorkflow_1_0.json'), JSON.stringify(SECOND, null, 2));
        await (0, promises_1.writeFile)((0, node_path_1.join)(dir, 'prompts', 'throwawayWorkflow', 'ask.md'), TEMPLATE);
        return dir;
    }
    (0, vitest_1.it)('is loaded alongside the bundled ones', async () => {
        const catalog = await WorkflowCatalog_1.WorkflowCatalog.load((0, node_path_1.join)(await bundle(), 'workflows'), (0, node_path_1.join)(ROOT, 'config'));
        (0, vitest_1.expect)(catalog.all().map((w) => w.id).sort()).toEqual([
            'bugFixWorkflow',
            'newFeatureWorkflow',
            'researchTaskWorkflow',
            'throwawayWorkflow',
        ]);
    });
    (0, vitest_1.it)('names only taskTypes that already exist', async () => {
        const catalog = await WorkflowCatalog_1.WorkflowCatalog.load((0, node_path_1.join)(await bundle(), 'workflows'), (0, node_path_1.join)(ROOT, 'config'));
        const registry = new TaskType_1.TaskTypeRegistry([
            new CollectRequirement_1.CollectRequirement(),
            new InvokeCopilot_1.InvokeCopilot(new PromptComposer_1.PromptComposer('/unused'), { async deliver() { return 'A'; } }, new AuditLog_1.AuditLog('/unused'), async () => true, noSink),
            new ManualReview_1.ManualReview(async () => { }, async () => 'h'),
        ]);
        const workflow = catalog.get('throwawayWorkflow');
        (0, vitest_1.expect)(() => registry.validateWorkflow(workflow.id, workflow.steps)).not.toThrow();
    });
    (0, vitest_1.it)('runs, using its own prompt template found by convention', async () => {
        const dir = await bundle();
        const taskDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'run2-'));
        const catalog = await WorkflowCatalog_1.WorkflowCatalog.load((0, node_path_1.join)(dir, 'workflows'), (0, node_path_1.join)(ROOT, 'config'));
        const workflow = catalog.get('throwawayWorkflow');
        const delivered = [];
        const handoff = new InvokeCopilot_1.InvokeCopilot(new PromptComposer_1.PromptComposer((0, node_path_1.join)(dir, 'prompts')), { async deliver(prompt) { delivered.push(prompt); return 'A'; } }, new AuditLog_1.AuditLog(taskDir), async () => true, noSink);
        const registry = new TaskType_1.TaskTypeRegistry([
            new CollectRequirement_1.CollectRequirement(),
            handoff,
            new ManualReview_1.ManualReview(async () => { }, async () => 'h'),
        ]);
        const store = new TaskStateStore_1.TaskStateStore(taskDir);
        await store.write((0, fixtures_1.taskState)({ workflowId: workflow.id, currentStepId: workflow.initialStep }));
        const holder = { state: await store.read() };
        const ctx = {
            platform: { id: 'canada-assisted', label: 'Canada Assisted' },
            microservices: catalog.microservices(),
            taskDir,
            epic: 'PLAT-9',
            taskId: 'T-9',
            workflowId: workflow.id,
            inputs: {},
            order: workflow.order,
            answersOf: (id) => holder.state.steps[id]?.answers ?? {},
            resultOf: (id) => holder.state.steps[id]?.result ?? {},
        };
        const engine = new WorkflowEngine_1.WorkflowEngine(workflow, store, registry, ctx);
        await engine.submit('requirement', 'submit', { story: 'does this need code?' });
        holder.state = await store.read();
        await handoff.deliver(workflow.steps.ask, ctx);
        (0, vitest_1.expect)(delivered[0]).toContain('Answer this for PLAT-9: does this need code?');
        (0, vitest_1.expect)(delivered[0]).toContain((0, node_path_1.join)(taskDir, 'throwaway.md'));
        (0, vitest_1.expect)(await handoff.outputPath(workflow.steps.ask, ctx)).toBe((0, node_path_1.join)(taskDir, 'throwaway.md'));
    });
});
