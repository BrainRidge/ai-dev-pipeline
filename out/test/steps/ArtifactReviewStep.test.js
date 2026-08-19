"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const ArtifactReviewStep_1 = require("../../src/steps/ArtifactReviewStep");
const ConfirmStep_1 = require("../../src/steps/ConfirmStep");
const step = {
    id: 'review',
    kind: 'artifact-review',
    title: 'Review',
    artifact: '02-analysis.md',
    onRevise: 'analyse',
};
const ctx = {
    platform: { id: 'p', label: 'P', services: [] },
    taskDir: '/tasks/T',
    epic: 'E',
    taskId: 'T',
    inputs: {},
    answersOf: () => ({}),
};
(0, vitest_1.describe)('ArtifactReviewStep', () => {
    (0, vitest_1.it)('offers Revise and Approve, in that order', () => {
        const s = new ArtifactReviewStep_1.ArtifactReviewStep(async () => { }, async () => 'h');
        (0, vitest_1.expect)(s.describe(step, ctx, {}).actions.map((a) => a.id)).toEqual(['revise', 'approve']);
    });
    (0, vitest_1.it)('opens the artifact in an editor', async () => {
        const opened = [];
        const s = new ArtifactReviewStep_1.ArtifactReviewStep(async (p) => { opened.push(p); }, async () => 'h');
        await s.open(step, ctx);
        (0, vitest_1.expect)(opened).toEqual(['/tasks/T/02-analysis.md']);
    });
    (0, vitest_1.it)('records the artifact hash on approval', async () => {
        const s = new ArtifactReviewStep_1.ArtifactReviewStep(async () => { }, async () => 'deadbeef');
        (0, vitest_1.expect)(await s.execute(step, ctx, {})).toMatchObject({
            artifactPath: '/tasks/T/02-analysis.md',
            artifactHash: 'deadbeef',
            approved: true,
        });
    });
    (0, vitest_1.it)('mentions the artifact by name so the developer knows which tab to read', () => {
        const s = new ArtifactReviewStep_1.ArtifactReviewStep(async () => { }, async () => 'h');
        (0, vitest_1.expect)(s.describe(step, ctx, {}).text).toContain('02-analysis.md');
    });
});
(0, vitest_1.describe)('ConfirmStep', () => {
    const confirm = { id: 'c', kind: 'confirm', title: 'Sure?', text: 'Really?' };
    (0, vitest_1.it)('offers No and Yes', () => {
        const view = new ConfirmStep_1.ConfirmStep().describe(confirm, ctx, {});
        (0, vitest_1.expect)(view.actions.map((a) => a.id)).toEqual(['no', 'yes']);
        (0, vitest_1.expect)(view.text).toBe('Really?');
    });
    (0, vitest_1.it)('records the answer', async () => {
        const s = new ConfirmStep_1.ConfirmStep();
        (0, vitest_1.expect)(await s.execute(confirm, ctx, { actionId: 'yes' })).toEqual({ confirmed: true });
        (0, vitest_1.expect)(await s.execute(confirm, ctx, { actionId: 'no' })).toEqual({ confirmed: false });
    });
});
