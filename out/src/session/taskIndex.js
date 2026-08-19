"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFinished = isFinished;
exports.listUnfinishedTasks = listUnfinishedTasks;
exports.taskLabel = taskLabel;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
/**
 * Whether a task is done is not recorded anywhere, and does not need to be.
 * The engine moves currentStepId to `nextStep` on every transition, so the step
 * it is parked on is marked complete in exactly one case: that step was
 * terminal. Anything else is a task with work left in it.
 */
function isFinished(state) {
    return state.steps?.[state.currentStepId]?.status === 'complete';
}
/**
 * The unfinished tasks under `tasksRoot`, most recently touched first.
 *
 * A folder that cannot be read as a task is skipped rather than reported. These
 * directories accumulate abandoned experiments, and one unparseable file must
 * not cost the developer the whole list.
 */
async function listUnfinishedTasks(tasksRoot) {
    const entries = await (0, promises_1.readdir)(tasksRoot, { withFileTypes: true }).catch(() => []);
    const found = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.'))
            continue;
        const file = (0, node_path_1.join)(tasksRoot, entry.name, '.engine', '_state.json');
        const summary = await summarise(entry.name, file);
        if (summary)
            found.push(summary);
    }
    return found.sort((a, b) => b.updatedAt - a.updatedAt);
}
/** Epic, task type and date — enough to tell two of your own tasks apart. */
function taskLabel(summary, workflowLabel) {
    const day = new Date(summary.updatedAt).toISOString().slice(0, 10);
    return `${summary.epic} · ${workflowLabel ?? summary.workflowId} · ${day}`;
}
async function summarise(taskId, file) {
    try {
        const state = JSON.parse(await (0, promises_1.readFile)(file, 'utf8'));
        if (!state.currentStepId || isFinished(state))
            return undefined;
        return {
            taskId,
            epic: state.epic ?? '',
            workflowId: state.workflowId ?? '',
            currentStepId: state.currentStepId,
            updatedAt: (await (0, promises_1.stat)(file)).mtimeMs,
        };
    }
    catch {
        return undefined;
    }
}
