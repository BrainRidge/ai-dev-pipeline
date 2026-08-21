"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemCheck = exports.REPORT_BLOCK_ID = void 0;
exports.blockers = blockers;
exports.reportLines = reportLines;
const ToolCatalog_1 = require("../engine/ToolCatalog");
/** The block id the report is shown under. The renderer never knows this name. */
exports.REPORT_BLOCK_ID = 'systemCheck';
/**
 * Checks that the tools a workflow depends on are installed, before the
 * developer has spent any effort on a task that cannot finish.
 *
 * It costs no model call: every answer comes from running the tool's own
 * `--version` and reading what comes back. That is the whole point of it being
 * a primitive of its own rather than something asked of Copilot — the machine
 * is a fact, not a judgement, and paying for a judgement about a fact would be
 * both slower and less trustworthy.
 *
 * The tool list comes from the team's content folder and falls back to a
 * bundled default, per spec Section 17. Which list was used is captioned above
 * the report, for the same reason a prompt template's path is: a silent
 * fallback is only acceptable if it is visible afterwards.
 *
 * Results are cached for the life of the session. `describe` runs for every
 * step on every render, and spawning four processes each time would make the
 * panel sluggish for an answer that changes when somebody installs something.
 * Re-check is how the developer says that has happened.
 */
class SystemCheck {
    loadTools;
    probe;
    sink;
    platform;
    name = 'systemCheck';
    stepType = 'systemCheck';
    title = 'System check';
    cached;
    failure;
    constructor(loadTools, probe, sink, 
    /** Injected so the report reads the same in a test on any machine. */
    platform = process.platform) {
        this.loadTools = loadTools;
        this.probe = probe;
        this.sink = sink;
        this.platform = platform;
    }
    invalidate() {
        this.cached = undefined;
        this.failure = undefined;
    }
    async describe(_step, _ctx, _values) {
        const actions = [
            { id: 'recheck', label: 'Re-check' },
            // Copying the report is how a developer asks somebody else to fix their
            // machine, which is the likeliest thing to happen on a locked-down laptop.
            { id: 'copy', label: 'Copy report' },
            { id: 'submit', label: 'Continue', primary: true },
        ];
        const state = await this.check();
        if (!state) {
            // A broken tool list is reported on the step that owns it rather than
            // thrown, for the reason spec Section 8 gives: the descriptor describes
            // every step, so throwing here would take down the whole panel.
            return { text: `The tool list could not be read: ${this.failure}`, actions };
        }
        const blocked = blockers(state.findings);
        return {
            text: blocked.length
                ? `${count(blocked.length, 'problem')} to fix before this task can continue. ` +
                    'Install what is missing, then Re-check.'
                : 'Everything this workflow needs is installed. Nothing was run against your repositories.',
            commands: [this.reportBlock(state)],
            actions,
        };
    }
    /**
     * A required tool that is absent or too old blocks the step. This is the one
     * gate in the tool that rests on a detected fact rather than the developer's
     * word, which is why it is allowed to be a gate at all.
     */
    validate(_step, _values) {
        if (this.failure) {
            return { ok: false, errors: { tools: `The tool list could not be read: ${this.failure}` } };
        }
        if (!this.cached) {
            return { ok: false, errors: { tools: 'The check has not run yet. Press Re-check.' } };
        }
        const blocked = blockers(this.cached.findings);
        if (blocked.length === 0)
            return { ok: true, errors: {} };
        return {
            ok: false,
            errors: {
                tools: `${blocked.map((f) => f.label).join(', ')} ` +
                    `${blocked.length === 1 ? 'is' : 'are'} still missing or too old. ` +
                    'Install what the report names, then press Re-check.',
            },
        };
    }
    async execute(_step, _ctx, _values) {
        const state = this.cached;
        return {
            toolsSource: state?.resolved.source ?? null,
            toolsPath: state?.resolved.path ?? null,
            findings: state?.findings ?? [],
            checkedAt: new Date().toISOString(),
        };
    }
    async copyReport(_step, _ctx) {
        const state = await this.check();
        if (!state)
            throw new Error(this.failure ?? 'the check has not run');
        await this.sink.copy(this.reportBlock(state).lines.join('\n'));
        return { label: 'the system check report' };
    }
    /** Probes every tool once and remembers the answer. */
    async check() {
        if (this.cached)
            return this.cached;
        if (this.failure)
            return undefined;
        let resolved;
        try {
            resolved = await this.loadTools();
        }
        catch (err) {
            this.failure = err instanceof Error ? err.message : String(err);
            return undefined;
        }
        const findings = await Promise.all(resolved.tools.map((tool) => this.examine(tool)));
        this.cached = { resolved, findings };
        return this.cached;
    }
    async examine(tool) {
        const base = {
            id: tool.id,
            label: tool.label,
            required: tool.required,
            minVersion: tool.minVersion,
            why: tool.why,
            install: tool.install[this.platform],
        };
        const result = await this.probe.run(tool.command, tool.args);
        if (!result.found)
            return { ...base, status: 'missing' };
        const version = (0, ToolCatalog_1.versionIn)(result.output);
        // An unreadable version is reported as found. The alternative is failing a
        // developer whose tool is installed because we could not parse its banner.
        const outdated = tool.minVersion !== undefined && version !== undefined && !(0, ToolCatalog_1.meetsMinimum)(version, tool.minVersion);
        return { ...base, version, status: outdated ? 'outdated' : 'ok' };
    }
    reportBlock(state) {
        return {
            id: exports.REPORT_BLOCK_ID,
            label: 'System check report',
            note: state.resolved.source === 'external'
                ? `Tool list: ${state.resolved.path} (external)`
                : 'Tool list: bundled default',
            lines: reportLines(state.findings),
            // No Copy or Terminal on the block: this is a report, not commands to
            // run. The step offers Copy beside Re-check instead.
            actions: [],
        };
    }
}
exports.SystemCheck = SystemCheck;
const MARK = { ok: '✓', missing: '✗', outdated: '⚠' };
/** Required tools that are absent or too old — the only things that block. */
function blockers(findings) {
    return findings.filter((f) => f.required && f.status !== 'ok');
}
function count(n, noun) {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
/**
 * The report, as the developer reads it: every tool on one line, then a
 * paragraph for each problem saying why the tool is needed and how to install
 * it on this machine. Pre-formatted here so the renderer stays a view.
 */
function reportLines(findings) {
    if (findings.length === 0)
        return ['The tool list is empty, so nothing was checked.'];
    const width = Math.max(...findings.map((f) => f.label.length));
    const lines = findings.map((f) => {
        const mark = f.status === 'missing' && !f.required ? '–' : MARK[f.status];
        return `${f.label.padEnd(width)}  ${mark}  ${describeFinding(f)}`;
    });
    for (const f of findings.filter((f) => f.status !== 'ok')) {
        lines.push('', `${f.label} — ${f.required ? 'required' : 'optional'}`);
        if (f.why)
            lines.push(`  Why      ${f.why}`);
        if (f.install)
            lines.push(`  Install  ${f.install}`);
    }
    return lines;
}
function describeFinding(f) {
    switch (f.status) {
        case 'ok':
            return f.version ?? 'installed';
        case 'outdated':
            return `${f.version ?? 'unknown'} — needs ${f.minVersion} or newer`;
        default:
            return f.required ? 'not found' : 'not found (optional)';
    }
}
