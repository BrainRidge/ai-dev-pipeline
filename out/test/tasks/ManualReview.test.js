"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const ManualReview_1 = require("../../src/tasks/ManualReview");
const fixtures_1 = require("../support/fixtures");
const review = (0, fixtures_1.step)('reviewAnalysis', { stepType: 'manual', taskType: 'manualReview' });
/** A run where the handoff step has already written its artifact. */
const ctx = (0, fixtures_1.context)({
    order: ['requirement', 'gitClone', 'aiHandoff', 'reviewAnalysis'],
    resultOf: (id) => (id === 'aiHandoff' ? { outputPath: '/tasks/T-1/02-analysis.md' } : {}),
});
(0, vitest_1.describe)('ManualReview', () => {
    (0, vitest_1.it)('is a manual step', () => {
        (0, vitest_1.expect)(new ManualReview_1.ManualReview(async () => { }, async () => 'h').stepType).toBe('manual');
    });
    (0, vitest_1.it)('reviews whatever the nearest earlier step produced', () => {
        const s = new ManualReview_1.ManualReview(async () => { }, async () => 'h');
        (0, vitest_1.expect)(s.artifactPath(review, ctx)).toBe('/tasks/T-1/02-analysis.md');
    });
    (0, vitest_1.it)('opens that artifact in an editor', async () => {
        const opened = [];
        const s = new ManualReview_1.ManualReview(async (p) => { opened.push(p); }, async () => 'h');
        await s.open(review, ctx);
        (0, vitest_1.expect)(opened).toEqual(['/tasks/T-1/02-analysis.md']);
    });
    (0, vitest_1.it)('names the artifact so the developer knows which tab to read', async () => {
        const s = new ManualReview_1.ManualReview(async () => { }, async () => 'h');
        (0, vitest_1.expect)((await s.describe(review, ctx, {})).text).toContain('02-analysis.md');
    });
    (0, vitest_1.it)('offers Revise and Approve, in that order', async () => {
        const s = new ManualReview_1.ManualReview(async () => { }, async () => 'h');
        (0, vitest_1.expect)((await s.describe(review, ctx, {})).actions.map((a) => a.id)).toEqual(['revise', 'approve']);
    });
    (0, vitest_1.it)('records the artifact hash on approval', async () => {
        const s = new ManualReview_1.ManualReview(async () => { }, async () => 'deadbeef');
        (0, vitest_1.expect)(await s.execute(review, ctx, {})).toEqual({
            artifactPath: '/tasks/T-1/02-analysis.md',
            artifactHash: 'deadbeef',
            approved: true,
        });
    });
    (0, vitest_1.it)('ignores results produced after it, so a revise loop reviews the right file', () => {
        const later = (0, fixtures_1.context)({
            order: ['reviewAnalysis', 'aiHandoff'],
            resultOf: (id) => (id === 'aiHandoff' ? { outputPath: '/tasks/T-1/late.md' } : {}),
        });
        (0, vitest_1.expect)(new ManualReview_1.ManualReview(async () => { }, async () => 'h').artifactPath(review, later)).toBeUndefined();
    });
    (0, vitest_1.it)('says so plainly when nothing has been produced yet', async () => {
        const empty = (0, fixtures_1.context)({ order: ['reviewAnalysis'] });
        const s = new ManualReview_1.ManualReview(async () => { throw new Error('should not open'); }, async () => { throw new Error('should not hash'); });
        (0, vitest_1.expect)((await s.describe(review, empty, {})).text).toContain('No earlier step');
        await s.open(review, empty);
        (0, vitest_1.expect)(await s.execute(review, empty, {})).toEqual({ approved: true });
    });
});
