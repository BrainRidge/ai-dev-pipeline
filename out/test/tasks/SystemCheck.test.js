"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const SystemCheck_1 = require("../../src/tasks/SystemCheck");
const StepDescriptor_1 = require("../../src/engine/StepDescriptor");
const fixtures_1 = require("../support/fixtures");
const STEP = (0, fixtures_1.step)('systemCheck', { stepType: 'systemCheck', taskType: 'systemCheck' });
const CTX = (0, fixtures_1.context)({ order: ['systemCheck'] });
/** A probe that answers per command, so a mixed machine can be described. */
function probeOf(answers) {
    return {
        async run(command) {
            const answer = answers[command];
            return answer === false || answer === undefined
                ? { found: false, output: '' }
                : { found: true, output: answer };
        },
    };
}
const JAVA = {
    id: 'java',
    label: 'Java (JDK)',
    command: 'java',
    args: ['-version'],
    required: true,
    minVersion: '17',
    why: 'Copilot builds what it changes.',
    install: { darwin: 'brew install openjdk@21', win32: 'winget install Temurin' },
};
const MAVEN = { ...JAVA, id: 'maven', label: 'Maven', command: 'mvn', required: false, minVersion: undefined };
function block(view) {
    return view.commands[0];
}
(0, vitest_1.describe)('the System Check step', () => {
    (0, vitest_1.it)('is a step type of its own, so the panel badges it without being told', () => {
        (0, vitest_1.expect)((0, StepDescriptor_1.badgeFor)(STEP, undefined)).toBe('SYSTEM');
    });
    (0, vitest_1.it)('spends no model call: every answer comes from the tool itself', async () => {
        const asked = [];
        const task = (0, fixtures_1.systemCheck)({
            tools: [JAVA],
            probe: {
                async run(command, args) {
                    asked.push([command, ...args].join(' '));
                    return { found: true, output: 'openjdk version "21.0.8" 2025-07-15' };
                },
            },
        });
        await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(asked).toEqual(['java -version']);
    });
    (0, vitest_1.it)('reports a tool it found, with the version it read back', async () => {
        const task = (0, fixtures_1.systemCheck)({ probe: probeOf({ git: 'git version 2.50.1' }) });
        const view = await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(block(view).lines[0]).toBe('Git  ✓  2.50.1');
        (0, vitest_1.expect)(view.text).toMatch(/Everything this workflow needs is installed/);
    });
    (0, vitest_1.it)('says what is missing, why it is wanted and how to install it here', async () => {
        const task = (0, fixtures_1.systemCheck)({ tools: [JAVA], probe: probeOf({ java: false }) });
        const report = block(await task.describe(STEP, CTX, {})).lines.join('\n');
        (0, vitest_1.expect)(report).toContain('Java (JDK)  ✗  not found');
        (0, vitest_1.expect)(report).toContain('Java (JDK) — required');
        (0, vitest_1.expect)(report).toContain('Why      Copilot builds what it changes.');
        // The platform is pinned in the fixture, so the hint is the macOS one.
        (0, vitest_1.expect)(report).toContain('Install  brew install openjdk@21');
    });
    (0, vitest_1.it)('marks a tool that is present but below the floor, and names the floor', async () => {
        const task = (0, fixtures_1.systemCheck)({ tools: [JAVA], probe: probeOf({ java: 'java version "1.8.0_392"' }) });
        const report = block(await task.describe(STEP, CTX, {})).lines.join('\n');
        (0, vitest_1.expect)(report).toContain('⚠  1.8.0 — needs 17 or newer');
    });
    (0, vitest_1.it)('accepts a tool whose version it cannot parse, rather than failing a working machine', async () => {
        const task = (0, fixtures_1.systemCheck)({ tools: [JAVA], probe: probeOf({ java: 'a bespoke wrapper' }) });
        const view = await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(block(view).lines[0]).toBe('Java (JDK)  ✓  installed');
        (0, vitest_1.expect)(task.validate(STEP, {}).ok).toBe(true);
    });
    (0, vitest_1.it)('distinguishes an optional tool that is absent from a required one', async () => {
        const task = (0, fixtures_1.systemCheck)({ tools: [MAVEN], probe: probeOf({ mvn: false }) });
        const report = block(await task.describe(STEP, CTX, {})).lines.join('\n');
        (0, vitest_1.expect)(report).toContain('Maven  –  not found (optional)');
        (0, vitest_1.expect)(report).toContain('Maven — optional');
    });
});
(0, vitest_1.describe)('what blocks the step', () => {
    (0, vitest_1.it)('lets the task continue when every required tool is there', async () => {
        const task = (0, fixtures_1.systemCheck)({ tools: [JAVA, MAVEN], probe: probeOf({ java: 'openjdk version "21"', mvn: false }) });
        await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(task.validate(STEP, {})).toEqual({ ok: true, errors: {} });
    });
    (0, vitest_1.it)('refuses to continue while a required tool is missing', async () => {
        const task = (0, fixtures_1.systemCheck)({ tools: [JAVA], probe: probeOf({ java: false }) });
        await task.describe(STEP, CTX, {});
        const result = task.validate(STEP, {});
        (0, vitest_1.expect)(result.ok).toBe(false);
        (0, vitest_1.expect)(result.errors.tools).toMatch(/Java \(JDK\) is still missing or too old/);
    });
    (0, vitest_1.it)('refuses to continue while a required tool is too old', async () => {
        const task = (0, fixtures_1.systemCheck)({ tools: [JAVA], probe: probeOf({ java: 'java version "11.0.1"' }) });
        await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(task.validate(STEP, {}).ok).toBe(false);
    });
    (0, vitest_1.it)('never blocks on an optional tool, however many are missing', async () => {
        const task = (0, fixtures_1.systemCheck)({ tools: [MAVEN, { ...MAVEN, id: 'g', command: 'gradle' }], probe: probeOf({}) });
        await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(task.validate(STEP, {}).ok).toBe(true);
    });
    // Fails closed. In the panel `describe` always runs before a button can be
    // pressed, so this is the state nobody should reach — and if it is reached,
    // saying so is safer than waving the task through unchecked.
    (0, vitest_1.it)('refuses to continue when the check has not run at all', () => {
        (0, vitest_1.expect)((0, fixtures_1.systemCheck)().validate(STEP, {}).errors.tools).toMatch(/has not run yet/);
    });
});
(0, vitest_1.describe)('a tool list that cannot be read', () => {
    function broken() {
        return new SystemCheck_1.SystemCheck(async () => {
            throw new Error('Tool config at /team/config/tools.json is not valid JSON: bad');
        }, { async run() { return { found: true, output: '' }; } }, { async copy() { }, async toTerminal() { } }, 'darwin');
    }
    // Returned rather than thrown, for the reason spec Section 8 gives: the
    // descriptor describes every step, so throwing would blank the whole panel.
    (0, vitest_1.it)('shows the loader’s own words on the step that owns the list', async () => {
        const view = await broken().describe(STEP, CTX, {});
        (0, vitest_1.expect)(view.text).toContain('is not valid JSON: bad');
        (0, vitest_1.expect)(view.commands).toBeUndefined();
    });
    (0, vitest_1.it)('still offers Re-check, which is how a corrected path is picked up', async () => {
        const view = await broken().describe(STEP, CTX, {});
        (0, vitest_1.expect)(view.actions.map((a) => a.id)).toContain('recheck');
    });
    (0, vitest_1.it)('blocks the step', async () => {
        const task = broken();
        await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(task.validate(STEP, {}).ok).toBe(false);
    });
});
(0, vitest_1.describe)('provenance, so a silent fallback is visible afterwards', () => {
    (0, vitest_1.it)('captions the report with the team’s file when there is one', async () => {
        const task = (0, fixtures_1.systemCheck)({ source: 'external', path: '/team/config/tools.json' });
        (0, vitest_1.expect)(block(await task.describe(STEP, CTX, {})).note).toBe('Tool list: /team/config/tools.json (external)');
    });
    (0, vitest_1.it)('says so plainly when the bundled default was used', async () => {
        (0, vitest_1.expect)(block(await (0, fixtures_1.systemCheck)().describe(STEP, CTX, {})).note).toBe('Tool list: bundled default');
    });
    (0, vitest_1.it)('records the list and the findings on the step, for the audit trail', async () => {
        const task = (0, fixtures_1.systemCheck)({ source: 'external', path: '/team/config/tools.json' });
        await task.describe(STEP, CTX, {});
        const result = await task.execute(STEP, CTX, {});
        (0, vitest_1.expect)(result.toolsSource).toBe('external');
        (0, vitest_1.expect)(result.toolsPath).toBe('/team/config/tools.json');
        (0, vitest_1.expect)(result.findings).toEqual([
            vitest_1.expect.objectContaining({ id: 'git', status: 'ok', version: '2.50.1' }),
        ]);
    });
});
(0, vitest_1.describe)('asking the machine again', () => {
    (0, vitest_1.it)('probes once and remembers, since a render describes every step', async () => {
        let calls = 0;
        const task = (0, fixtures_1.systemCheck)({
            probe: {
                async run() {
                    calls += 1;
                    return { found: true, output: 'git version 2.50.1' };
                },
            },
        });
        await task.describe(STEP, CTX, {});
        await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(calls).toBe(1);
    });
    (0, vitest_1.it)('asks again once the developer says they have installed something', async () => {
        let found = false;
        const task = (0, fixtures_1.systemCheck)({
            probe: {
                async run() {
                    return found ? { found: true, output: 'git version 2.50.1' } : { found: false, output: '' };
                },
            },
        });
        await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(task.validate(STEP, {}).ok).toBe(false);
        found = true;
        task.invalidate();
        await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(task.validate(STEP, {}).ok).toBe(true);
    });
});
(0, vitest_1.describe)('the report as a block the renderer already knows how to draw', () => {
    (0, vitest_1.it)('carries no buttons of its own: it is a report, not commands to run', async () => {
        (0, vitest_1.expect)(block(await (0, fixtures_1.systemCheck)().describe(STEP, CTX, {})).actions).toEqual([]);
    });
    (0, vitest_1.it)('is not editable, unlike a composed prompt', async () => {
        (0, vitest_1.expect)(block(await (0, fixtures_1.systemCheck)().describe(STEP, CTX, {})).editable).toBeFalsy();
    });
    (0, vitest_1.it)('offers Copy on the step, for a machine somebody else has to fix', async () => {
        const copied = [];
        const task = (0, fixtures_1.systemCheck)({ sink: { async copy(t) { copied.push(t); }, async toTerminal() { } } });
        const view = await task.describe(STEP, CTX, {});
        (0, vitest_1.expect)(view.actions.map((a) => a.id)).toEqual(['recheck', 'copy', 'submit']);
        await task.copyReport(STEP, CTX);
        (0, vitest_1.expect)(copied[0]).toContain('Git');
    });
});
(0, vitest_1.describe)('the report text itself', () => {
    const finding = (over) => ({
        id: 'x',
        label: 'X',
        required: true,
        status: 'ok',
        why: '',
        ...over,
    });
    (0, vitest_1.it)('aligns the marks under each other, however long the names are', () => {
        const lines = (0, SystemCheck_1.reportLines)([
            finding({ label: 'Git', version: '2.50.1' }),
            finding({ label: 'Java (JDK)', version: '21' }),
        ]);
        (0, vitest_1.expect)(lines[0]).toBe('Git         ✓  2.50.1');
        (0, vitest_1.expect)(lines[1]).toBe('Java (JDK)  ✓  21');
    });
    (0, vitest_1.it)('says something rather than nothing for an empty list', () => {
        (0, vitest_1.expect)((0, SystemCheck_1.reportLines)([])).toEqual(['The tool list is empty, so nothing was checked.']);
    });
    (0, vitest_1.it)('counts only required problems as blockers', () => {
        const findings = [
            finding({ id: 'a', status: 'missing', required: true }),
            finding({ id: 'b', status: 'missing', required: false }),
            finding({ id: 'c', status: 'outdated', required: true }),
            finding({ id: 'd', status: 'ok', required: true }),
        ];
        (0, vitest_1.expect)((0, SystemCheck_1.blockers)(findings).map((f) => f.id)).toEqual(['a', 'c']);
    });
});
(0, vitest_1.describe)('what the panel shows for a step already passed', () => {
    (0, vitest_1.it)('summarises how much of the list was found', () => {
        const record = {
            status: 'complete',
            result: { findings: [{ status: 'ok' }, { status: 'missing' }, { status: 'ok' }] },
        };
        (0, vitest_1.expect)((0, StepDescriptor_1.summarise)(STEP, record, undefined)).toBe('2 of 3 tools found');
    });
    (0, vitest_1.it)('says only that it was checked when the list was empty', () => {
        (0, vitest_1.expect)((0, StepDescriptor_1.summarise)(STEP, { status: 'complete', result: { findings: [] } }, undefined)).toBe('Checked');
    });
});
(0, vitest_1.describe)('the fixture tool list', () => {
    (0, vitest_1.it)('is one required tool, which is what the workflow tests lean on', () => {
        (0, vitest_1.expect)(fixtures_1.TOOLS.map((t) => t.id)).toEqual(['git']);
        (0, vitest_1.expect)(fixtures_1.TOOLS[0].required).toBe(true);
    });
});
