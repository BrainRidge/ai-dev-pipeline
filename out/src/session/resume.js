"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskIdFromWorkspaceSettings = taskIdFromWorkspaceSettings;
exports.resolveTasksRoot = resolveTasksRoot;
exports.resolveCodeRoot = resolveCodeRoot;
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
/**
 * The breadcrumb that makes resumption work. The generated .code-workspace
 * declares which task it belongs to, so resuming needs no global registry and
 * nothing that can drift out of sync. See spec Section 7.
 */
function taskIdFromWorkspaceSettings(settings) {
    const v = settings['aiDevWorkflow.taskId'];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function resolveTasksRoot(configured) {
    return configured && configured.length > 0
        ? configured
        : (0, node_path_1.join)((0, node_os_1.homedir)(), 'ai-dev-workflow', 'tasks');
}
function resolveCodeRoot(configured) {
    return configured && configured.length > 0
        ? configured
        : (0, node_path_1.join)((0, node_os_1.homedir)(), 'ai-dev-workflow', 'code');
}
