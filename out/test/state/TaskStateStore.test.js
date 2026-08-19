"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const TaskStateStore_1 = require("../../src/state/TaskStateStore");
const sample = {
    schemaVersion: 1,
    taskId: 'PLAT-1-research-20260814-01',
    workflowId: 'research',
    workflowVersion: '1.0',
    platform: 'canada-assisted',
    epic: 'PLAT-1',
    currentStepId: 'scope',
    workflowHash: 'abc',
    inputs: { services: ['payments'] },
    steps: { scope: { status: 'in_progress' } },
};
(0, vitest_1.describe)('TaskStateStore', () => {
    (0, vitest_1.it)('round-trips state', async () => {
        const store = new TaskStateStore_1.TaskStateStore(await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'st-')));
        await store.write(sample);
        (0, vitest_1.expect)(await store.read()).toEqual(sample);
    });
    (0, vitest_1.it)('reports absence before any write', async () => {
        const store = new TaskStateStore_1.TaskStateStore(await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'st-')));
        (0, vitest_1.expect)(await store.exists()).toBe(false);
    });
    (0, vitest_1.it)('reports presence after a write', async () => {
        const store = new TaskStateStore_1.TaskStateStore(await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'st-')));
        await store.write(sample);
        (0, vitest_1.expect)(await store.exists()).toBe(true);
    });
    (0, vitest_1.it)('leaves no temp file behind', async () => {
        const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'st-'));
        const store = new TaskStateStore_1.TaskStateStore(dir);
        await store.write(sample);
        (0, vitest_1.expect)(await (0, promises_1.readdir)((0, node_path_1.join)(dir, '.engine'))).toEqual(['_state.json']);
    });
    (0, vitest_1.it)('keeps engine files out of the task folder root', async () => {
        const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'st-'));
        await new TaskStateStore_1.TaskStateStore(dir).write(sample);
        (0, vitest_1.expect)(await (0, promises_1.readdir)(dir)).toEqual(['.engine']);
    });
    (0, vitest_1.it)('overwrites cleanly on a second write', async () => {
        const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'st-'));
        const store = new TaskStateStore_1.TaskStateStore(dir);
        await store.write(sample);
        await store.write({ ...sample, currentStepId: 'analyse' });
        (0, vitest_1.expect)((await store.read()).currentStepId).toBe('analyse');
        (0, vitest_1.expect)(await (0, promises_1.readdir)((0, node_path_1.join)(dir, '.engine'))).toEqual(['_state.json']);
    });
});
