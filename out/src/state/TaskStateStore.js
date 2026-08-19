"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskStateStore = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
/**
 * Disk is the source of truth. Opening the generated multi-root workspace
 * restarts the extension host mid-workflow, so nothing may live only in
 * memory. See spec Section 7.
 */
class TaskStateStore {
    engineDir;
    file;
    constructor(taskDir) {
        this.engineDir = (0, node_path_1.join)(taskDir, '.engine');
        this.file = (0, node_path_1.join)(this.engineDir, '_state.json');
    }
    async exists() {
        try {
            await (0, promises_1.access)(this.file);
            return true;
        }
        catch {
            return false;
        }
    }
    async read() {
        return JSON.parse(await (0, promises_1.readFile)(this.file, 'utf8'));
    }
    /** Atomic: temp file then rename, so an interrupted write cannot corrupt the task. */
    async write(state) {
        await (0, promises_1.mkdir)(this.engineDir, { recursive: true });
        const tmp = `${this.file}.tmp`;
        await (0, promises_1.writeFile)(tmp, JSON.stringify(state, null, 2), 'utf8');
        await (0, promises_1.rename)(tmp, this.file);
    }
}
exports.TaskStateStore = TaskStateStore;
