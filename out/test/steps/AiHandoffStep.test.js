"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const AiHandoffStep_1 = require("../../src/steps/AiHandoffStep");
const step = {
    id: 'analyse',
    kind: 'ai-handoff',
    title: 'Analyse',
    prompt: 'research-analysis.md',
    output: '02-analysis.md',
};
const ctx = {
    platform: { id: 'p', label: 'P', services: [] },
    taskDir: '/tasks/T',
    epic: 'E',
    taskId: 'T',
    inputs: {},
    answersOf: () => ({}),
};
const composer = { async compose() { return 'COMPOSED PROMPT'; } };
function fakeAudit() {
    const entries2 = [];
    return {
        entries2,
        async append(e) { entries2.push(e); },
    };
}
function handoffReturning(m) {
    return { async deliver() { return m; } };
}
(0, vitest_1.describe)('AiHandoffStep', () => {
    (0, vitest_1.it)('blocks completion when the output file is missing', () => {
        const s = new AiHandoffStep_1.AiHandoffStep(composer, handoffReturning('A'), fakeAudit(), async () => false);
        const r = s.validate(step, { confirmed: true, outputPresent: false });
        (0, vitest_1.expect)(r.ok).toBe(false);
        (0, vitest_1.expect)(r.errors.output).toContain('02-analysis.md');
    });
    (0, vitest_1.it)('blocks completion when the developer has not confirmed', () => {
        const s = new AiHandoffStep_1.AiHandoffStep(composer, handoffReturning('A'), fakeAudit(), async () => true);
        (0, vitest_1.expect)(s.validate(step, { confirmed: false, outputPresent: true }).ok).toBe(false);
    });
    (0, vitest_1.it)('completes only when both conditions hold', () => {
        const s = new AiHandoffStep_1.AiHandoffStep(composer, handoffReturning('A'), fakeAudit(), async () => true);
        (0, vitest_1.expect)(s.validate(step, { confirmed: true, outputPresent: true }).ok).toBe(true);
    });
    (0, vitest_1.it)('logs the composed prompt BEFORE delivering it', async () => {
        const order = [];
        const handoff = {
            async deliver() { order.push('deliver'); return 'A'; },
        };
        const audit = {
            async append(e) { order.push(e.kind); },
        };
        const s = new AiHandoffStep_1.AiHandoffStep(composer, handoff, audit, async () => true);
        await s.deliver(step, ctx, []);
        (0, vitest_1.expect)(order).toEqual(['prompt-composed', 'deliver']);
    });
    (0, vitest_1.it)('records the full prompt in the audit entry', async () => {
        const audit = fakeAudit();
        const s = new AiHandoffStep_1.AiHandoffStep(composer, handoffReturning('A'), audit, async () => true);
        await s.deliver(step, ctx, []);
        (0, vitest_1.expect)(audit.entries2[0].data.prompt).toBe('COMPOSED PROMPT');
    });
    (0, vitest_1.it)('records which mechanism was used', async () => {
        const s = new AiHandoffStep_1.AiHandoffStep(composer, handoffReturning('B'), fakeAudit(), async () => true);
        (0, vitest_1.expect)((await s.deliver(step, ctx, [])).mechanism).toBe('B');
    });
    (0, vitest_1.it)('offers Send and Done actions', () => {
        const s = new AiHandoffStep_1.AiHandoffStep(composer, handoffReturning('A'), fakeAudit(), async () => true);
        (0, vitest_1.expect)(s.describe(step, ctx, {}).actions.map((a) => a.id)).toEqual(['send', 'done']);
    });
    (0, vitest_1.it)('reports the resolved output path and its presence from execute', async () => {
        const s = new AiHandoffStep_1.AiHandoffStep(composer, handoffReturning('A'), fakeAudit(), async () => true);
        (0, vitest_1.expect)(await s.execute(step, ctx, { mechanism: 'A' })).toMatchObject({
            outputPath: '/tasks/T/02-analysis.md',
            outputPresent: true,
            mechanism: 'A',
        });
    });
});
