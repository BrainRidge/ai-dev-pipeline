"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const resume_1 = require("../../src/session/resume");
(0, vitest_1.describe)('taskIdFromWorkspaceSettings', () => {
    (0, vitest_1.it)('reads the breadcrumb', () => {
        (0, vitest_1.expect)((0, resume_1.taskIdFromWorkspaceSettings)({ 'aiDevWorkflow.taskId': 'T-1' })).toBe('T-1');
    });
    (0, vitest_1.it)('returns undefined when absent', () => {
        (0, vitest_1.expect)((0, resume_1.taskIdFromWorkspaceSettings)({})).toBeUndefined();
    });
    (0, vitest_1.it)('treats an empty string as absent', () => {
        (0, vitest_1.expect)((0, resume_1.taskIdFromWorkspaceSettings)({ 'aiDevWorkflow.taskId': '' })).toBeUndefined();
    });
    (0, vitest_1.it)('ignores a non-string value', () => {
        (0, vitest_1.expect)((0, resume_1.taskIdFromWorkspaceSettings)({ 'aiDevWorkflow.taskId': 42 })).toBeUndefined();
    });
});
(0, vitest_1.describe)('root resolution', () => {
    (0, vitest_1.it)('defaults tasks root under the home directory', () => {
        (0, vitest_1.expect)((0, resume_1.resolveTasksRoot)(undefined)).toBe((0, node_path_1.join)((0, node_os_1.homedir)(), 'ai-dev-workflow', 'tasks'));
        (0, vitest_1.expect)((0, resume_1.resolveTasksRoot)('')).toBe((0, node_path_1.join)((0, node_os_1.homedir)(), 'ai-dev-workflow', 'tasks'));
    });
    (0, vitest_1.it)('honours a configured tasks root', () => {
        (0, vitest_1.expect)((0, resume_1.resolveTasksRoot)('/custom/tasks')).toBe('/custom/tasks');
    });
    (0, vitest_1.it)('defaults code root under the home directory', () => {
        (0, vitest_1.expect)((0, resume_1.resolveCodeRoot)(undefined)).toBe((0, node_path_1.join)((0, node_os_1.homedir)(), 'ai-dev-workflow', 'code'));
    });
});
