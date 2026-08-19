"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecGitRunner = void 0;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
class ExecGitRunner {
    async run(args, cwd) {
        try {
            const { stdout, stderr } = await run('git', args, { cwd });
            return { code: 0, stdout, stderr };
        }
        catch (err) {
            const e = err;
            return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) };
        }
    }
}
exports.ExecGitRunner = ExecGitRunner;
