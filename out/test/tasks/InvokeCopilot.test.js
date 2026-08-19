"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const InvokeCopilot_1 = require("../../src/tasks/InvokeCopilot");
const fixtures_1 = require("../support/fixtures");
const noSink = { async copy() { }, async toTerminal() { } };
const handoffStep = (0, fixtures_1.step)('aiHandoff', { stepType: 'aiHandoff', taskType: 'invokeCopilot' });
const ctx = (0, fixtures_1.context)();
const composer = {
    async compose() {
        return { prompt: 'COMPOSED PROMPT', outputFile: '02-analysis.md' };
    },
    async outputFor() {
        return '02-analysis.md';
    },
};
function fakeAudit() {
    const logged = [];
    return {
        logged,
        async append(e) {
            logged.push(e);
        },
    };
}
function handoffReturning(m) {
    return { async deliver() { return m; } };
}
function task(mechanism = 'A', present = true) {
    return new InvokeCopilot_1.InvokeCopilot(composer, handoffReturning(mechanism), fakeAudit(), async () => present, noSink);
}
(0, vitest_1.describe)('InvokeCopilot', () => {
    (0, vitest_1.it)('is an aiHandoff step', () => {
        (0, vitest_1.expect)(task().stepType).toBe('aiHandoff');
    });
    (0, vitest_1.it)('blocks completion when the output file is missing', () => {
        const r = task().validate(handoffStep, {
            confirmed: true,
            outputPresent: false,
            outputFile: '02-analysis.md',
        });
        (0, vitest_1.expect)(r.ok).toBe(false);
        (0, vitest_1.expect)(r.errors.output).toContain('02-analysis.md');
    });
    (0, vitest_1.it)('blocks completion when the developer has not confirmed', () => {
        (0, vitest_1.expect)(task().validate(handoffStep, { confirmed: false, outputPresent: true }).ok).toBe(false);
    });
    (0, vitest_1.it)('completes only when both conditions hold', () => {
        (0, vitest_1.expect)(task().validate(handoffStep, { confirmed: true, outputPresent: true }).ok).toBe(true);
    });
    (0, vitest_1.it)('logs the composed prompt BEFORE delivering it', async () => {
        const order = [];
        const handoff = {
            async deliver() {
                order.push('deliver');
                return 'A';
            },
        };
        const audit = {
            async append(e) {
                order.push(e.kind);
            },
        };
        await new InvokeCopilot_1.InvokeCopilot(composer, handoff, audit, async () => true, noSink).deliver(handoffStep, ctx);
        (0, vitest_1.expect)(order).toEqual(['prompt-composed', 'deliver']);
    });
    (0, vitest_1.it)('records the full prompt in the audit entry', async () => {
        const audit = fakeAudit();
        const s = new InvokeCopilot_1.InvokeCopilot(composer, handoffReturning('A'), audit, async () => true, noSink);
        await s.deliver(handoffStep, ctx);
        (0, vitest_1.expect)(audit.logged[0].data.prompt).toBe('COMPOSED PROMPT');
    });
    (0, vitest_1.it)('records which mechanism was used', async () => {
        (0, vitest_1.expect)((await task('B').deliver(handoffStep, ctx)).mechanism).toBe('B');
    });
    (0, vitest_1.it)('reports where the artifact will land, so the review step can find it', async () => {
        (0, vitest_1.expect)(await task().outputPath(handoffStep, ctx)).toBe('/tasks/T-1/02-analysis.md');
    });
    (0, vitest_1.it)('shows the composed prompt, so it can be read before it is sent', async () => {
        const view = await task().describe(handoffStep, ctx, {});
        (0, vitest_1.expect)(view.commands).toHaveLength(1);
        (0, vitest_1.expect)(view.commands[0].label).toBe('Composed prompt');
        (0, vitest_1.expect)(view.commands[0].lines.join('\n')).toBe('COMPOSED PROMPT');
    });
    (0, vitest_1.it)('offers Copy and Send on the prompt block, never Terminal', async () => {
        const block = (await task().describe(handoffStep, ctx, {})).commands[0];
        (0, vitest_1.expect)(block.actions.map((a) => a.id)).toEqual(['copy', 'send']);
    });
    (0, vitest_1.it)('puts that same prompt on the clipboard', async () => {
        const copied = [];
        const s = new InvokeCopilot_1.InvokeCopilot(composer, handoffReturning('A'), fakeAudit(), async () => true, { async copy(t) { copied.push(t); }, async toTerminal() { } });
        const { text, label } = await s.copyPrompt(handoffStep, ctx);
        (0, vitest_1.expect)(copied).toEqual(['COMPOSED PROMPT']);
        (0, vitest_1.expect)(text).toBe('COMPOSED PROMPT');
        (0, vitest_1.expect)(label).toMatch(/prompt/i);
    });
    (0, vitest_1.it)('reports a broken template on the step instead of throwing', async () => {
        const broken = {
            async compose() {
                throw new Error('template "x.md" must declare "output:"');
            },
        };
        const s = new InvokeCopilot_1.InvokeCopilot(broken, handoffReturning('A'), fakeAudit(), async () => true, noSink);
        const view = await s.describe(handoffStep, ctx, {});
        (0, vitest_1.expect)(view.commands).toBeUndefined();
        (0, vitest_1.expect)(view.text).toContain('could not be composed');
        (0, vitest_1.expect)(view.text).toContain('must declare "output:"');
    });
    (0, vitest_1.it)('offers Send and Done actions', async () => {
        (0, vitest_1.expect)((await task().describe(handoffStep, ctx, {})).actions.map((a) => a.id)).toEqual(['send', 'done']);
    });
    (0, vitest_1.it)('reports the resolved output path and its presence from execute', async () => {
        (0, vitest_1.expect)(await task('A', true).execute(handoffStep, ctx, { mechanism: 'A' })).toMatchObject({
            outputPath: '/tasks/T-1/02-analysis.md',
            outputFile: '02-analysis.md',
            outputPresent: true,
            mechanism: 'A',
        });
    });
    (0, vitest_1.it)('reports a missing artifact rather than pretending it arrived', async () => {
        (0, vitest_1.expect)(await task('A', false).execute(handoffStep, ctx, {})).toMatchObject({
            outputPresent: false,
        });
    });
});
(0, vitest_1.describe)('editing the composed prompt', () => {
    const edited = { edited: { prompt: 'MY OWN WORDS' } };
    (0, vitest_1.it)('offers the prompt as an editable block', async () => {
        const view = await task().describe(handoffStep, ctx, {});
        (0, vitest_1.expect)(view.commands[0].editable).toBe(true);
    });
    (0, vitest_1.it)('shows the developer’s text back to them instead of recomposing', async () => {
        const view = await task().describe(handoffStep, ctx, edited);
        (0, vitest_1.expect)(view.commands[0].lines.join('\n')).toBe('MY OWN WORDS');
    });
    (0, vitest_1.it)('offers Reset only once there is an edit to undo', async () => {
        const clean = await task().describe(handoffStep, ctx, {});
        (0, vitest_1.expect)(clean.commands[0].actions.map((a) => a.id)).toEqual(['copy', 'send']);
        const dirty = await task().describe(handoffStep, ctx, edited);
        (0, vitest_1.expect)(dirty.commands[0].actions.map((a) => a.id)).toEqual(['copy', 'send', 'reset']);
    });
    (0, vitest_1.it)('ignores an edit that is only whitespace', async () => {
        const view = await task().describe(handoffStep, ctx, { edited: { prompt: '   ' } });
        (0, vitest_1.expect)(view.commands[0].lines.join('\n')).toBe('COMPOSED PROMPT');
    });
    (0, vitest_1.it)('delivers the edited text, not the generated text', async () => {
        const sent = [];
        const t = new InvokeCopilot_1.InvokeCopilot(composer, { async deliver(p) { sent.push(p); return 'A'; } }, fakeAudit(), async () => true, noSink);
        await t.deliver(handoffStep, ctx, 'MY OWN WORDS');
        (0, vitest_1.expect)(sent).toEqual(['MY OWN WORDS']);
    });
    (0, vitest_1.it)('still contracts for the artifact the template declares', async () => {
        const delivery = await task().deliver(handoffStep, ctx, 'MY OWN WORDS');
        (0, vitest_1.expect)(delivery.outputPath).toContain('02-analysis.md');
    });
    (0, vitest_1.it)('records what was actually sent, which is the point of the log', async () => {
        const audit = fakeAudit();
        const t = new InvokeCopilot_1.InvokeCopilot(composer, handoffReturning('A'), audit, async () => true, noSink);
        await t.deliver(handoffStep, ctx, 'MY OWN WORDS');
        (0, vitest_1.expect)(audit.logged[0].data.prompt).toBe('MY OWN WORDS');
    });
    (0, vitest_1.it)('copies the edited text rather than the generated text', async () => {
        const copied = [];
        const sink = { async copy(t) { copied.push(t); }, async toTerminal() { } };
        const t = new InvokeCopilot_1.InvokeCopilot(composer, handoffReturning('A'), fakeAudit(), async () => true, sink);
        await t.copyPrompt(handoffStep, ctx, 'MY OWN WORDS');
        (0, vitest_1.expect)(copied).toEqual(['MY OWN WORDS']);
    });
});
