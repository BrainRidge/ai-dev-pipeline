"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskWorkspace = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const taskId_1 = require("../engine/taskId");
class TaskWorkspace {
    dir;
    taskId;
    constructor(dir, taskId) {
        this.dir = dir;
        this.taskId = taskId;
    }
    static async create(opts) {
        const now = opts.now ?? new Date();
        await (0, promises_1.mkdir)(opts.tasksRoot, { recursive: true });
        const existing = await (0, promises_1.readdir)(opts.tasksRoot).catch(() => []);
        let counter = 1;
        let taskId = (0, taskId_1.buildTaskId)(opts.epic, opts.workflowId, now, counter);
        while (existing.includes(taskId)) {
            counter += 1;
            taskId = (0, taskId_1.buildTaskId)(opts.epic, opts.workflowId, now, counter);
        }
        const dir = (0, node_path_1.join)(opts.tasksRoot, taskId);
        await (0, promises_1.mkdir)((0, node_path_1.join)(dir, '.engine'), { recursive: true });
        // Snapshot: this task runs the definition it started with, immune to
        // extension updates mid-flight. See spec D8.
        await (0, promises_1.writeFile)((0, node_path_1.join)(dir, '.engine', 'workflow.json'), opts.workflowJson, 'utf8');
        return new TaskWorkspace(dir, taskId);
    }
    static async open(dir, taskId) {
        return new TaskWorkspace(dir, taskId);
    }
    async snapshotJson() {
        return (0, promises_1.readFile)((0, node_path_1.join)(this.dir, '.engine', 'workflow.json'), 'utf8');
    }
    async hashOfSnapshot() {
        return (0, node_crypto_1.createHash)('sha256').update(await this.snapshotJson()).digest('hex');
    }
    /**
     * Detection, not prevention — every developer has full filesystem access, so
     * prevention is not achievable. The goal is that deviation from the standard
     * process is visible in the audit trail. See spec Section 7.
     */
    async verifySnapshot(expected) {
        return (await this.hashOfSnapshot()) === expected;
    }
    async writeWorkspaceFile(repos) {
        const file = (0, node_path_1.join)(this.dir, `${this.taskId}.code-workspace`);
        const content = {
            folders: [...repos, { name: this.taskId, path: this.dir }],
            settings: { 'aiDevWorkflow.taskId': this.taskId },
        };
        await (0, promises_1.writeFile)(file, JSON.stringify(content, null, 2), 'utf8');
        return file;
    }
}
exports.TaskWorkspace = TaskWorkspace;
