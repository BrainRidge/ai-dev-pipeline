"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const InvokeCopilotCoding_1 = require("../../src/tasks/InvokeCopilotCoding");
const InvokeCopilotCodeReview_1 = require("../../src/tasks/InvokeCopilotCodeReview");
const fixtures_1 = require("../support/fixtures");
const noSink = { async copy() { }, async toTerminal() { } };
const coding = (0, fixtures_1.step)('CodeImplementation', {
    stepType: 'aiHandoff',
    taskType: 'invokeCopilotCoding',
});
const ctx = (0, fixtures_1.context)();
/** An editing template declares no output, so compose returns none. */
const composer = {
    async compose() {
        return {
            prompt: 'COMPOSED PROMPT',
            outputFile: undefined,
            templatePath: '/team/prompts/newFeatureWorkflow/CodeImplementation.md',
            templateSource: 'external',
            includes: [],
            references: [],
        };
    },
    async resolved() {
        return {
            path: '/team/prompts/newFeatureWorkflow/CodeImplementation.md',
            source: 'external',
        };
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
const handoffReturning = (m) => ({ async deliver() { return m; } });
const task = (m = 'A') => new InvokeCopilotCoding_1.InvokeCopilotCoding(composer, handoffReturning(m), fakeAudit(), noSink);
(0, vitest_1.describe)('InvokeCopilotCoding', () => {
    (0, vitest_1.it)('is an aiHandoff step named by the workflow JSON', () => {
        (0, vitest_1.expect)(task().name).toBe('invokeCopilotCoding');
        (0, vitest_1.expect)(task().stepType).toBe('aiHandoff');
    });
    (0, vitest_1.it)('completes on the developer’s confirmation alone', () => {
        (0, vitest_1.expect)(task().validate(coding, { confirmed: true }).ok).toBe(true);
    });
    (0, vitest_1.it)('will not complete without it', () => {
        const r = task().validate(coding, { confirmed: false });
        (0, vitest_1.expect)(r.ok).toBe(false);
        (0, vitest_1.expect)(r.errors.confirmed).toMatch(/once Copilot has finished/i);
    });
    (0, vitest_1.it)('ignores outputPresent, because there is no artifact to wait for', () => {
        (0, vitest_1.expect)(task().validate(coding, { confirmed: true, outputPresent: false }).ok).toBe(true);
    });
    (0, vitest_1.it)('shows its prompt too, so an editing handoff is not a black box', async () => {
        const view = await task().describe(coding, ctx, {});
        (0, vitest_1.expect)(view.commands[0].lines.join('\n')).toBe('COMPOSED PROMPT');
        (0, vitest_1.expect)(view.commands[0].actions.map((a) => a.id)).toEqual(['copy', 'send']);
    });
    (0, vitest_1.it)('offers Send and Done actions', async () => {
        (0, vitest_1.expect)((await task().describe(coding, ctx, {})).actions.map((a) => a.id)).toEqual(['send', 'done']);
    });
    (0, vitest_1.it)('tells the developer to look at the diff before marking it done', async () => {
        (0, vitest_1.expect)((await task().describe(coding, ctx, {})).text).toMatch(/what it changed/i);
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
        await new InvokeCopilotCoding_1.InvokeCopilotCoding(composer, handoff, audit, noSink).deliver(coding, ctx);
        (0, vitest_1.expect)(order).toEqual(['prompt-composed', 'deliver']);
    });
    (0, vitest_1.it)('records the full prompt, which is all the audit trail can capture here', async () => {
        const audit = fakeAudit();
        await new InvokeCopilotCoding_1.InvokeCopilotCoding(composer, handoffReturning('A'), audit, noSink).deliver(coding, ctx);
        (0, vitest_1.expect)(audit.logged[0].data.prompt).toBe('COMPOSED PROMPT');
    });
    (0, vitest_1.it)('promises no artifact path, since it produces none', async () => {
        (0, vitest_1.expect)((await task().deliver(coding, ctx)).outputPath).toBeUndefined();
    });
    (0, vitest_1.it)('records the mechanism and that completion rested on the developer', async () => {
        (0, vitest_1.expect)(await task().execute(coding, ctx, { mechanism: 'B' })).toEqual({
            mechanism: 'B',
            confirmedByDeveloper: true,
        });
    });
});
(0, vitest_1.describe)('InvokeCopilotCodeReview', async () => {
    const review = new InvokeCopilotCodeReview_1.InvokeCopilotCodeReview(composer, handoffReturning('A'), fakeAudit(), noSink);
    (0, vitest_1.it)('is registered under its own name so a workflow can name it', () => {
        (0, vitest_1.expect)(review.name).toBe('invokeCopilotCodeReview');
    });
    (0, vitest_1.it)('reads as a review step, not an implementation one', async () => {
        const view = await review.describe((0, fixtures_1.step)('CodeReview', { stepType: 'aiHandoff' }), ctx, {});
        (0, vitest_1.expect)(view.text).toMatch(/review the changes/i);
    });
    (0, vitest_1.it)('shares the confirmation rule with the coding step', () => {
        (0, vitest_1.expect)(review.validate(coding, { confirmed: true }).ok).toBe(true);
        (0, vitest_1.expect)(review.validate(coding, {}).ok).toBe(false);
    });
});
(0, vitest_1.describe)('editing an editing handoff’s prompt', () => {
    (0, vitest_1.it)('offers the prompt as an editable block here too', async () => {
        const view = await task().describe(coding, ctx, {});
        (0, vitest_1.expect)(view.commands[0].editable).toBe(true);
    });
    (0, vitest_1.it)('shows the developer’s text back to them', async () => {
        const view = await task().describe(coding, ctx, { edited: { prompt: 'DO IT MY WAY' } });
        (0, vitest_1.expect)(view.commands[0].lines.join('\n')).toBe('DO IT MY WAY');
        (0, vitest_1.expect)(view.commands[0].actions.map((a) => a.id)).toEqual(['copy', 'send', 'reset']);
    });
    (0, vitest_1.it)('delivers and records the edited text', async () => {
        const sent = [];
        const audit = fakeAudit();
        const t = new InvokeCopilotCoding_1.InvokeCopilotCoding(composer, { async deliver(p) { sent.push(p); return 'A'; } }, audit, noSink);
        await t.deliver(coding, ctx, 'DO IT MY WAY');
        (0, vitest_1.expect)(sent).toEqual(['DO IT MY WAY']);
        (0, vitest_1.expect)(audit.logged[0].data.prompt).toBe('DO IT MY WAY');
    });
    (0, vitest_1.it)('copies the edited text', async () => {
        const copied = [];
        const sink = { async copy(t) { copied.push(t); }, async toTerminal() { } };
        const t = new InvokeCopilotCoding_1.InvokeCopilotCoding(composer, handoffReturning('A'), fakeAudit(), sink);
        await t.copyPrompt(coding, ctx, 'DO IT MY WAY');
        (0, vitest_1.expect)(copied).toEqual(['DO IT MY WAY']);
    });
});
(0, vitest_1.describe)('provenance on an editing handoff', () => {
    (0, vitest_1.it)('records the template path and source, even with no output contract', async () => {
        const audit = fakeAudit();
        const t = new InvokeCopilotCoding_1.InvokeCopilotCoding(composer, handoffReturning('A'), audit, noSink);
        await t.deliver(coding, ctx);
        (0, vitest_1.expect)(audit.logged[0].data).toMatchObject({
            templatePath: '/team/prompts/newFeatureWorkflow/CodeImplementation.md',
            templateSource: 'external',
            includes: [],
            references: [],
        });
    });
    (0, vitest_1.it)('captions the prompt block so a team override is visible on screen', async () => {
        const view = await task().describe(coding, ctx, {});
        (0, vitest_1.expect)(view.commands?.[0]?.note).toBe('Template: /team/prompts/newFeatureWorkflow/CodeImplementation.md (external)');
    });
});
