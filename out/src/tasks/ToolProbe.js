"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeToolProbe = exports.PROBE_TIMEOUT_MS = void 0;
exports.candidatesFor = candidatesFor;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
/** A probe waits this long for a tool to answer before giving up on it. */
exports.PROBE_TIMEOUT_MS = 5000;
/**
 * On Windows a great many development tools are batch shims rather than
 * executables — Maven ships `mvn.cmd`, Gradle ships `gradle.bat` — and Node
 * will not find those without a shell. Rather than turn a shell on for
 * arguments that come from a config file, we try the extensions ourselves.
 * The list is a single empty suffix elsewhere, so POSIX spawns exactly once.
 */
function candidatesFor(command, platform = process.platform) {
    const suffixes = platform === 'win32' ? ['', '.cmd', '.bat', '.exe'] : [''];
    return suffixes.map((suffix) => `${command}${suffix}`);
}
/**
 * The real probe. Lives here rather than in `registry.ts` so that it can be
 * tested against a real machine without an extension host — the same reason
 * `nodeProbe` sits beside `DirectoryProbe` in `ContentRoot.ts`.
 *
 * `shell` is left off, so nothing in a tool list can be interpreted as a shell
 * command. A non-zero exit still counts as found when the process ran: some
 * tools print their version and exit 1, and the question here is whether the
 * tool is on the machine, not whether it approves of its arguments.
 *
 * See spec Section 17.
 */
exports.nodeToolProbe = {
    async run(command, args) {
        for (const candidate of candidatesFor(command)) {
            try {
                const { stdout, stderr } = await run(candidate, args, {
                    timeout: exports.PROBE_TIMEOUT_MS,
                    windowsHide: true,
                });
                return { found: true, output: `${stdout}\n${stderr}`.trim() };
            }
            catch (err) {
                const e = err;
                if (e.code === 'ENOENT')
                    continue;
                // Ran and complained, or timed out. Found, but the version may be
                // unreadable — which Section 17 says must never fail the check alone.
                return { found: true, output: `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim() };
            }
        }
        return { found: false, output: '' };
    },
};
