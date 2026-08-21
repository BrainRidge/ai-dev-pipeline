"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const ToolProbe_1 = require("../../src/tasks/ToolProbe");
const ToolCatalog_1 = require("../../src/engine/ToolCatalog");
(0, vitest_1.describe)('which executable names are tried', () => {
    (0, vitest_1.it)('tries the command alone on a POSIX machine', () => {
        (0, vitest_1.expect)((0, ToolProbe_1.candidatesFor)('mvn', 'darwin')).toEqual(['mvn']);
    });
    // Maven ships mvn.cmd and Gradle ships gradle.bat, and Node will not find
    // either without a shell. See spec Section 17.
    (0, vitest_1.it)('tries the batch-shim extensions on Windows', () => {
        (0, vitest_1.expect)((0, ToolProbe_1.candidatesFor)('mvn', 'win32')).toEqual(['mvn', 'mvn.cmd', 'mvn.bat', 'mvn.exe']);
    });
});
/**
 * The real probe against the real machine. Node is what runs this test, so
 * `node --version` is a tool that is certainly installed — which is the point:
 * every other test in the suite fakes the probe, and this one proves the thing
 * being faked works.
 */
(0, vitest_1.describe)('probing this machine', () => {
    (0, vitest_1.it)('finds a tool that is certainly installed, and reads its version', async () => {
        const result = await ToolProbe_1.nodeToolProbe.run('node', ['--version']);
        (0, vitest_1.expect)(result.found).toBe(true);
        (0, vitest_1.expect)((0, ToolCatalog_1.versionIn)(result.output)).toMatch(/^\d+\.\d+/);
    });
    (0, vitest_1.it)('reports a command that does not exist as missing', async () => {
        (0, vitest_1.expect)(await ToolProbe_1.nodeToolProbe.run('definitely-not-a-real-tool-xyz', ['--version'])).toEqual({
            found: false,
            output: '',
        });
    });
    // Some tools print their version and exit non-zero. The question is whether
    // the tool is on the machine, not whether it liked its arguments.
    (0, vitest_1.it)('counts a tool that ran and complained as found', async () => {
        const result = await ToolProbe_1.nodeToolProbe.run('node', ['--definitely-not-a-flag']);
        (0, vitest_1.expect)(result.found).toBe(true);
    });
    (0, vitest_1.it)('captures stderr, which is where a JDK writes its version', async () => {
        const result = await ToolProbe_1.nodeToolProbe.run('node', [
            '-e',
            'process.stderr.write("tool version 9.9.9")',
        ]);
        (0, vitest_1.expect)((0, ToolCatalog_1.versionIn)(result.output)).toBe('9.9.9');
    });
});
