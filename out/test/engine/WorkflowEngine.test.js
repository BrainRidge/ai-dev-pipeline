"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const WorkflowEngine_1 = require("../../src/engine/WorkflowEngine");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
const TaskStateStore_1 = require("../../src/state/TaskStateStore");
const CollectRequirement_1 = require("../../src/tasks/CollectRequirement");
const TaskType_1 = require("../../src/tasks/TaskType");
const fixtures_1 = require("../support/fixtures");
/** Three task steps in a straight nextStep chain: a -> b -> c. */
const workflow = (0, WorkflowCatalog_1.buildWorkflow)('research', '1.0', {
    schemaVersion: 1,
    label: 'Research',
    initialStep: 'a',
    steps: {
        a: { stepType: 'task', taskType: 'CollectRequirement', documentation: '', nextStep: 'b' },
        b: { stepType: 'task', taskType: 'CollectRequirement', documentation: '', nextStep: 'c' },
        c: { stepType: 'task', taskType: 'CollectRequirement', documentation: '' },
    },
});
const registry = () => new TaskType_1.TaskTypeRegistry([new CollectRequirement_1.CollectRequirement()]);
async function harness(types = [new CollectRequirement_1.CollectRequirement()]) {
    const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'eng-'));
    const store = new TaskStateStore_1.TaskStateStore(dir);
    await store.write((0, fixtures_1.taskState)({ workflowId: 'research', currentStepId: 'a' }));
    const ctx = (0, fixtures_1.context)({ taskDir: dir, order: workflow.order });
    return { engine: new WorkflowEngine_1.WorkflowEngine(workflow, store, new TaskType_1.TaskTypeRegistry(types), ctx), store };
}
const answered = { story: 'why is checkout slow' };
(0, vitest_1.describe)('WorkflowEngine', () => {
    (0, vitest_1.it)('starts at the step the state names', async () => {
        const { engine } = await harness();
        (0, vitest_1.expect)((await engine.current()).id).toBe('a');
    });
    (0, vitest_1.it)('rejects an invalid submission and does not advance', async () => {
        const { engine } = await harness();
        const r = await engine.submit('a', 'submit', { question: '' });
        (0, vitest_1.expect)(r.ok).toBe(false);
        (0, vitest_1.expect)((await engine.current()).id).toBe('a');
    });
    (0, vitest_1.it)('advances along nextStep, not along declaration order', async () => {
        const { engine } = await harness();
        (0, vitest_1.expect)((await engine.submit('a', 'submit', answered)).ok).toBe(true);
        (0, vitest_1.expect)((await engine.current()).id).toBe('b');
    });
    (0, vitest_1.it)('records answers and the task result on the completed step', async () => {
        const { engine, store } = await harness();
        await engine.submit('a', 'submit', answered);
        (0, vitest_1.expect)((await store.read()).steps.a).toMatchObject({
            status: 'complete',
            answers: answered,
            result: answered,
        });
    });
    (0, vitest_1.it)('reports done on a step with no nextStep', async () => {
        const { engine } = await harness();
        await engine.submit('a', 'submit', answered);
        await engine.submit('b', 'submit', answered);
        (0, vitest_1.expect)(await engine.submit('c', 'submit', answered)).toEqual({ ok: true, done: true });
    });
    (0, vitest_1.it)('stays on the terminal step once the workflow is finished', async () => {
        const { engine } = await harness();
        await engine.submit('a', 'submit', answered);
        await engine.submit('b', 'submit', answered);
        await engine.submit('c', 'submit', answered);
        (0, vitest_1.expect)((await engine.current()).id).toBe('c');
    });
    (0, vitest_1.it)('goes back to the previous step in traversal order', async () => {
        const { engine } = await harness();
        await engine.submit('a', 'submit', answered);
        await engine.submit('b', 'back', {});
        (0, vitest_1.expect)((await engine.current()).id).toBe('a');
    });
    (0, vitest_1.it)('back from the first step has nowhere to go', async () => {
        const { engine } = await harness();
        (0, vitest_1.expect)(await engine.submit('a', 'back', {})).toEqual({ ok: true, done: false });
        (0, vitest_1.expect)((await engine.current()).id).toBe('a');
    });
    (0, vitest_1.it)('revise sends the work back to the step that produced it', async () => {
        const { engine } = await harness();
        await engine.submit('a', 'submit', answered);
        await engine.submit('b', 'submit', answered);
        await engine.submit('c', 'revise', {});
        (0, vitest_1.expect)((await engine.current()).id).toBe('b');
    });
    (0, vitest_1.it)('revise reopens the step it goes back to, so it runs again', async () => {
        const { engine, store } = await harness();
        await engine.submit('a', 'submit', answered);
        await engine.submit('b', 'submit', answered);
        await engine.submit('c', 'revise', {});
        (0, vitest_1.expect)((await store.read()).steps.b.status).toBe('pending');
    });
    (0, vitest_1.it)('persists state across a fresh engine instance', async () => {
        const { engine, store } = await harness();
        await engine.submit('a', 'submit', answered);
        // A fresh engine stands in for a restarted extension host.
        const reloaded = new WorkflowEngine_1.WorkflowEngine(workflow, store, registry(), (0, fixtures_1.context)({ order: workflow.order }));
        (0, vitest_1.expect)((await reloaded.current()).id).toBe('b');
    });
    (0, vitest_1.it)('edit reopens a completed step and makes it current', async () => {
        const { engine } = await harness();
        await engine.submit('a', 'submit', answered);
        await engine.edit('a');
        (0, vitest_1.expect)((await engine.current()).id).toBe('a');
    });
    (0, vitest_1.it)('edit marks the edited step and everything after it pending', async () => {
        const { engine, store } = await harness();
        await engine.submit('a', 'submit', answered);
        await engine.submit('b', 'submit', answered);
        await engine.edit('a');
        const state = await store.read();
        (0, vitest_1.expect)(state.steps.a.status).toBe('pending');
        (0, vitest_1.expect)(state.steps.b.status).toBe('pending');
    });
    (0, vitest_1.it)('edit keeps earlier answers so they prefill on the way back', async () => {
        const { engine, store } = await harness();
        await engine.submit('a', 'submit', answered);
        await engine.submit('b', 'submit', { story: 'a second answer' });
        await engine.edit('a');
        const state = await store.read();
        (0, vitest_1.expect)(state.steps.a.answers).toEqual(answered);
        (0, vitest_1.expect)(state.steps.b.answers).toEqual({ story: 'a second answer' });
    });
    (0, vitest_1.it)('edit rejects an unknown step', async () => {
        const { engine } = await harness();
        await (0, vitest_1.expect)(engine.edit('nowhere')).rejects.toThrow(/unknown step/);
    });
    (0, vitest_1.it)('names the known taskTypes when a workflow references one that is missing', async () => {
        const { engine } = await harness([]);
        await (0, vitest_1.expect)(engine.submit('a', 'submit', answered)).rejects.toThrow(/unknown taskType "CollectRequirement"/);
    });
});
/**
 * A draft an in-progress step wants to keep — an edited prompt — without
 * claiming the step is finished. It is a write, not a transition.
 */
(0, vitest_1.describe)('saveAnswers', () => {
    (0, vitest_1.it)('keeps a draft on the current step without advancing it', async () => {
        const { engine, store } = await harness();
        await engine.saveAnswers('a', { edited: { prompt: 'MY OWN WORDS' } });
        const state = await store.read();
        (0, vitest_1.expect)(state.currentStepId).toBe('a');
        (0, vitest_1.expect)(state.steps.a.answers).toEqual({ edited: { prompt: 'MY OWN WORDS' } });
        (0, vitest_1.expect)(state.steps.a.status).toBe('in_progress');
    });
    (0, vitest_1.it)('merges into what the step already answered rather than replacing it', async () => {
        const { engine, store } = await harness();
        await engine.saveAnswers('a', { story: 'kept' });
        await engine.saveAnswers('a', { edited: { prompt: 'added' } });
        (0, vitest_1.expect)((await store.read()).steps.a.answers).toEqual({
            story: 'kept',
            edited: { prompt: 'added' },
        });
    });
    (0, vitest_1.it)('leaves a completed step complete, so a draft cannot reopen it', async () => {
        const { engine, store } = await harness();
        await engine.submit('a', 'submit', answered);
        await engine.saveAnswers('a', { edited: { prompt: 'late' } });
        const state = await store.read();
        (0, vitest_1.expect)(state.steps.a.status).toBe('complete');
        (0, vitest_1.expect)(state.currentStepId).toBe('b');
    });
    (0, vitest_1.it)('refuses a step the workflow does not have', async () => {
        const { engine } = await harness();
        await (0, vitest_1.expect)(engine.saveAnswers('nope', {})).rejects.toThrow(/unknown step/);
    });
});
