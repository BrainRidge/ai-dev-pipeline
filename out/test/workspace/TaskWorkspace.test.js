"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const TaskWorkspace_1 = require("../../src/workspace/TaskWorkspace");
const SOURCE = JSON.stringify({ schemaVersion: 1, label: 'Research', initialStep: 'a', steps: {} });
async function make(epic = 'PLAT-1234') {
    return TaskWorkspace_1.TaskWorkspace.create({
        tasksRoot: await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'root-')),
        epic,
        workflowId: 'research',
        platform: 'canada-assisted',
        workflowJson: SOURCE,
        now: new Date('2026-08-14T10:00:00Z'),
    });
}
(0, vitest_1.describe)('TaskWorkspace', () => {
    (0, vitest_1.it)('builds a task id from epic, workflow and date', async () => {
        (0, vitest_1.expect)((await make()).taskId).toBe('PLAT-1234-research-20260814-01');
    });
    (0, vitest_1.it)('sanitises an epic containing path separators', async () => {
        (0, vitest_1.expect)((await make('feature/PLAT 9')).taskId).toBe('feature-PLAT-9-research-20260814-01');
    });
    (0, vitest_1.it)('snapshots the workflow source under .engine', async () => {
        const ws = await make();
        (0, vitest_1.expect)(await (0, promises_1.readFile)((0, node_path_1.join)(ws.dir, '.engine', 'workflow.json'), 'utf8')).toBe(SOURCE);
    });
    (0, vitest_1.it)('detects an unmodified snapshot', async () => {
        const ws = await make();
        (0, vitest_1.expect)(await ws.verifySnapshot(await ws.hashOfSnapshot())).toBe(true);
    });
    (0, vitest_1.it)('detects a tampered snapshot', async () => {
        const ws = await make();
        const original = await ws.hashOfSnapshot();
        await (0, promises_1.writeFile)((0, node_path_1.join)(ws.dir, '.engine', 'workflow.json'), `${SOURCE} `);
        (0, vitest_1.expect)(await ws.verifySnapshot(original)).toBe(false);
    });
    (0, vitest_1.it)('writes a .code-workspace carrying the taskId breadcrumb', async () => {
        const ws = await make();
        const file = await ws.writeWorkspaceFile([{ name: 'payments', path: '/code/payments' }]);
        const parsed = JSON.parse(await (0, promises_1.readFile)(file, 'utf8'));
        (0, vitest_1.expect)(parsed.settings['aiDevWorkflow.taskId']).toBe(ws.taskId);
        (0, vitest_1.expect)(parsed.folders).toEqual([
            { name: 'payments', path: '/code/payments' },
            { name: ws.taskId, path: ws.dir },
        ]);
    });
    (0, vitest_1.it)('always mounts the task folder as a workspace root', async () => {
        const ws = await make();
        const parsed = JSON.parse(await (0, promises_1.readFile)(await ws.writeWorkspaceFile([]), 'utf8'));
        (0, vitest_1.expect)(parsed.folders).toEqual([{ name: ws.taskId, path: ws.dir }]);
    });
    (0, vitest_1.it)('increments the counter for a second task on the same day', async () => {
        const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'root-'));
        const opts = {
            tasksRoot: root,
            epic: 'PLAT-1',
            workflowId: 'research',
            platform: 'p',
            workflowJson: SOURCE,
            now: new Date('2026-08-14T10:00:00Z'),
        };
        await TaskWorkspace_1.TaskWorkspace.create(opts);
        (0, vitest_1.expect)((await TaskWorkspace_1.TaskWorkspace.create(opts)).taskId).toBe('PLAT-1-research-20260814-02');
    });
    (0, vitest_1.it)('reopens an existing task without recreating it', async () => {
        const ws = await make();
        const reopened = await TaskWorkspace_1.TaskWorkspace.open(ws.dir, ws.taskId);
        (0, vitest_1.expect)(await reopened.snapshotJson()).toBe(SOURCE);
    });
});
