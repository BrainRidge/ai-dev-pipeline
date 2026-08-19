"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const taskIndex_1 = require("../../src/session/taskIndex");
const fixtures_1 = require("../support/fixtures");
async function root() {
    return (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'idx-'));
}
async function writeTask(dir, taskId, state, mtime) {
    const engine = (0, node_path_1.join)(dir, taskId, '.engine');
    await (0, promises_1.mkdir)(engine, { recursive: true });
    const file = (0, node_path_1.join)(engine, '_state.json');
    await (0, promises_1.writeFile)(file, JSON.stringify((0, fixtures_1.taskState)({ taskId, ...state })), 'utf8');
    if (mtime)
        await (0, promises_1.utimes)(file, mtime, mtime);
}
/**
 * Whether a task is finished is not recorded anywhere, but it does not need to
 * be: the engine parks currentStepId on a step and marks it complete only when
 * that step is terminal. Every other state leaves the current step unfinished.
 */
(0, vitest_1.describe)('isFinished', () => {
    (0, vitest_1.it)('is true once the step the task is parked on is complete', () => {
        (0, vitest_1.expect)((0, taskIndex_1.isFinished)((0, fixtures_1.taskState)({ currentStepId: 'c', steps: { c: { status: 'complete' } } }))).toBe(true);
    });
    (0, vitest_1.it)('is false mid-workflow, where earlier steps are complete but this one is not', () => {
        (0, vitest_1.expect)((0, taskIndex_1.isFinished)((0, fixtures_1.taskState)({
            currentStepId: 'b',
            steps: { a: { status: 'complete' }, b: { status: 'pending' } },
        }))).toBe(false);
    });
    (0, vitest_1.it)('is false for a task that has recorded nothing yet', () => {
        (0, vitest_1.expect)((0, taskIndex_1.isFinished)((0, fixtures_1.taskState)({ currentStepId: 'a', steps: {} }))).toBe(false);
    });
});
(0, vitest_1.describe)('listUnfinishedTasks', () => {
    (0, vitest_1.it)('finds nothing in a directory that does not exist', async () => {
        (0, vitest_1.expect)(await (0, taskIndex_1.listUnfinishedTasks)((0, node_path_1.join)(await root(), 'nope'))).toEqual([]);
    });
    (0, vitest_1.it)('reports what the sidebar needs to describe a task', async () => {
        const dir = await root();
        await writeTask(dir, 'PLAT-1-bugFixWorkflow-20260818-01', {
            epic: 'PLAT-1',
            workflowId: 'bugFixWorkflow',
            currentStepId: 'diagnosis',
        });
        (0, vitest_1.expect)(await (0, taskIndex_1.listUnfinishedTasks)(dir)).toMatchObject([
            {
                taskId: 'PLAT-1-bugFixWorkflow-20260818-01',
                epic: 'PLAT-1',
                workflowId: 'bugFixWorkflow',
                currentStepId: 'diagnosis',
            },
        ]);
    });
    (0, vitest_1.it)('hides finished tasks, which is what "continue" means', async () => {
        const dir = await root();
        await writeTask(dir, 'done-01', {
            currentStepId: 'c',
            steps: { c: { status: 'complete' } },
        });
        await writeTask(dir, 'open-01', { currentStepId: 'b' });
        (0, vitest_1.expect)((await (0, taskIndex_1.listUnfinishedTasks)(dir)).map((t) => t.taskId)).toEqual(['open-01']);
    });
    (0, vitest_1.it)('skips a folder with no state, so an abandoned experiment is not an error', async () => {
        const dir = await root();
        await (0, promises_1.mkdir)((0, node_path_1.join)(dir, 'never-started'), { recursive: true });
        await writeTask(dir, 'open-01', {});
        (0, vitest_1.expect)((await (0, taskIndex_1.listUnfinishedTasks)(dir)).map((t) => t.taskId)).toEqual(['open-01']);
    });
    (0, vitest_1.it)('skips unreadable state rather than failing the whole list', async () => {
        const dir = await root();
        await (0, promises_1.mkdir)((0, node_path_1.join)(dir, 'corrupt-01', '.engine'), { recursive: true });
        await (0, promises_1.writeFile)((0, node_path_1.join)(dir, 'corrupt-01', '.engine', '_state.json'), '{ not json', 'utf8');
        await writeTask(dir, 'open-01', {});
        (0, vitest_1.expect)((await (0, taskIndex_1.listUnfinishedTasks)(dir)).map((t) => t.taskId)).toEqual(['open-01']);
    });
    (0, vitest_1.it)('puts the most recently touched task first, which is the one you want', async () => {
        const dir = await root();
        await writeTask(dir, 'old-01', {}, new Date('2026-01-01T00:00:00Z'));
        await writeTask(dir, 'new-01', {}, new Date('2026-08-01T00:00:00Z'));
        await writeTask(dir, 'mid-01', {}, new Date('2026-04-01T00:00:00Z'));
        (0, vitest_1.expect)((await (0, taskIndex_1.listUnfinishedTasks)(dir)).map((t) => t.taskId)).toEqual([
            'new-01',
            'mid-01',
            'old-01',
        ]);
    });
});
(0, vitest_1.describe)('taskLabel', () => {
    const summary = {
        taskId: 'PLAT-1-bugFixWorkflow-20260818-01',
        epic: 'PLAT-1',
        workflowId: 'bugFixWorkflow',
        currentStepId: 'diagnosis',
        updatedAt: Date.parse('2026-08-18T09:30:00Z'),
    };
    (0, vitest_1.it)('reads as epic, task type and date — enough to tell two apart', () => {
        (0, vitest_1.expect)((0, taskIndex_1.taskLabel)(summary, 'Bug Fix')).toBe('PLAT-1 · Bug Fix · 2026-08-18');
    });
    (0, vitest_1.it)('falls back to the workflow id when the catalogue no longer has it', () => {
        (0, vitest_1.expect)((0, taskIndex_1.taskLabel)(summary, undefined)).toBe('PLAT-1 · bugFixWorkflow · 2026-08-18');
    });
});
