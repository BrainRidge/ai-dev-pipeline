"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const AuditLog_1 = require("../../src/audit/AuditLog");
(0, vitest_1.describe)('AuditLog', () => {
    (0, vitest_1.it)('appends one JSON object per line', async () => {
        const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'au-'));
        const log = new AuditLog_1.AuditLog(dir);
        await log.append({ kind: 'step-entered', stepId: 'scope' });
        await log.append({ kind: 'prompt-composed', stepId: 'analyse', data: { chars: 42 } });
        const raw = await (0, promises_1.readFile)((0, node_path_1.join)(dir, '.engine', 'audit.jsonl'), 'utf8');
        const lines = raw.trim().split('\n');
        (0, vitest_1.expect)(lines).toHaveLength(2);
        (0, vitest_1.expect)(JSON.parse(lines[1]).data.chars).toBe(42);
    });
    (0, vitest_1.it)('stamps every entry with an ISO timestamp', async () => {
        const log = new AuditLog_1.AuditLog(await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'au-')));
        await log.append({ kind: 'x' });
        (0, vitest_1.expect)((await log.entries())[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
    (0, vitest_1.it)('preserves append order', async () => {
        const log = new AuditLog_1.AuditLog(await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'au-')));
        for (const k of ['a', 'b', 'c'])
            await log.append({ kind: k });
        (0, vitest_1.expect)((await log.entries()).map((e) => e.kind)).toEqual(['a', 'b', 'c']);
    });
    (0, vitest_1.it)('writes under .engine, not the task folder root', async () => {
        const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'au-'));
        await new AuditLog_1.AuditLog(dir).append({ kind: 'x' });
        (0, vitest_1.expect)(await (0, promises_1.readdir)(dir)).toEqual(['.engine']);
    });
});
