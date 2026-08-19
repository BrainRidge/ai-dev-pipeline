"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
/**
 * Append-only. Entries are written BEFORE the action they describe, so a
 * crashed step still leaves a record. See spec Section 5.
 */
class AuditLog {
    engineDir;
    file;
    constructor(taskDir) {
        this.engineDir = (0, node_path_1.join)(taskDir, '.engine');
        this.file = (0, node_path_1.join)(this.engineDir, 'audit.jsonl');
    }
    async append(entry) {
        await (0, promises_1.mkdir)(this.engineDir, { recursive: true });
        const stamped = { at: new Date().toISOString(), ...entry };
        await (0, promises_1.appendFile)(this.file, `${JSON.stringify(stamped)}\n`, 'utf8');
    }
    async entries() {
        const raw = await (0, promises_1.readFile)(this.file, 'utf8');
        return raw
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l));
    }
}
exports.AuditLog = AuditLog;
