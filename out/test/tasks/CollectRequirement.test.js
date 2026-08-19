"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const CollectRequirement_1 = require("../../src/tasks/CollectRequirement");
const fixtures_1 = require("../support/fixtures");
const requirement = (0, fixtures_1.step)('requirement');
const ctx = (0, fixtures_1.context)();
(0, vitest_1.describe)('CollectRequirement', () => {
    const task = new CollectRequirement_1.CollectRequirement();
    (0, vitest_1.it)('is a task step, matching the workflow it is named by', () => {
        (0, vitest_1.expect)(task.name).toBe('CollectRequirement');
        (0, vitest_1.expect)(task.stepType).toBe('task');
    });
    (0, vitest_1.it)('offers the same fields to every workflow that names it', async () => {
        (0, vitest_1.expect)((await task.describe(requirement, ctx, {})).fields.map((f) => f.id)).toEqual([
            'story',
            'notes',
        ]);
    });
    (0, vitest_1.it)('names the notes field for where the notes actually come from', async () => {
        const notes = (await task.describe(requirement, ctx, {})).fields.find((f) => f.id === 'notes');
        (0, vitest_1.expect)(notes.label).toBe('Meeting notes from call or conversation');
    });
    (0, vitest_1.it)('routes the JIRA story through a provider, which is the MCP seam', async () => {
        const story = (await task.describe(requirement, ctx, {})).fields.find((f) => f.id === 'story');
        (0, vitest_1.expect)(story.provider).toBe('manual');
    });
    (0, vitest_1.it)('offers Back and Continue actions', async () => {
        (0, vitest_1.expect)((await task.describe(requirement, ctx, {})).actions.map((a) => a.id)).toEqual(['back', 'submit']);
    });
    (0, vitest_1.it)('fails validation when the story is empty', () => {
        const r = task.validate(requirement, { story: '' });
        (0, vitest_1.expect)(r.ok).toBe(false);
        (0, vitest_1.expect)(r.errors.story).toMatch(/required/i);
    });
    (0, vitest_1.it)('treats whitespace as empty', () => {
        (0, vitest_1.expect)(task.validate(requirement, { story: '   ' }).ok).toBe(false);
    });
    (0, vitest_1.it)('does not require the notes, which are often not written down anywhere', () => {
        (0, vitest_1.expect)(task.validate(requirement, { story: 'As a customer I can pay' }).ok).toBe(true);
    });
    (0, vitest_1.it)('returns the submitted values from execute', async () => {
        const values = { story: 'PLAT-1 body', notes: 'from refinement' };
        (0, vitest_1.expect)(await task.execute(requirement, ctx, values)).toEqual(values);
    });
});
