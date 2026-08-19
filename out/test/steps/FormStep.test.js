"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const FormStep_1 = require("../../src/steps/FormStep");
const platform = {
    id: 'canada-assisted',
    label: 'CA',
    services: [
        { id: 'payments', label: 'Payments', gitUrl: 'git@x:payments.git' },
        { id: 'orders', label: 'Orders', gitUrl: 'git@x:orders.git' },
    ],
};
const ctx = {
    platform,
    taskDir: '/tmp/t',
    epic: 'PLAT-1',
    taskId: 'PLAT-1-research-20260814-01',
    inputs: {},
    answersOf: () => ({}),
};
const step = {
    id: 'scope',
    kind: 'form',
    title: 'Scope',
    fields: [
        {
            id: 'services',
            type: 'multiselect',
            label: 'Services',
            source: 'platform.services',
            required: true,
        },
        { id: 'question', type: 'textarea', label: 'Question', required: true },
    ],
};
(0, vitest_1.describe)('FormStep', () => {
    const handler = new FormStep_1.FormStep();
    (0, vitest_1.it)('expands platform.services into options', () => {
        const view = handler.describe(step, ctx, {});
        (0, vitest_1.expect)(view.fields[0].options).toEqual([
            { value: 'payments', label: 'Payments' },
            { value: 'orders', label: 'Orders' },
        ]);
    });
    (0, vitest_1.it)('leaves fields without a source untouched', () => {
        const view = handler.describe(step, ctx, {});
        (0, vitest_1.expect)(view.fields[1].options).toBeUndefined();
    });
    (0, vitest_1.it)('offers Back and Continue actions', () => {
        (0, vitest_1.expect)(handler.describe(step, ctx, {}).actions.map((a) => a.id)).toEqual(['back', 'submit']);
    });
    (0, vitest_1.it)('fails validation when a required field is empty', () => {
        const r = handler.validate(step, { services: [], question: '' });
        (0, vitest_1.expect)(r.ok).toBe(false);
        (0, vitest_1.expect)(r.errors.question).toMatch(/required/i);
        (0, vitest_1.expect)(r.errors.services).toMatch(/required/i);
    });
    (0, vitest_1.it)('treats whitespace as empty', () => {
        (0, vitest_1.expect)(handler.validate(step, { services: ['payments'], question: '   ' }).ok).toBe(false);
    });
    (0, vitest_1.it)('passes validation when required fields are filled', () => {
        (0, vitest_1.expect)(handler.validate(step, { services: ['payments'], question: 'why' }).ok).toBe(true);
    });
    (0, vitest_1.it)('returns the submitted values from execute', async () => {
        const values = { services: ['payments'], question: 'why' };
        (0, vitest_1.expect)(await handler.execute(step, ctx, values)).toEqual(values);
    });
});
