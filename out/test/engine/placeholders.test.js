"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const placeholders_1 = require("../../src/engine/placeholders");
const fixtures_1 = require("../support/fixtures");
const ctx = (0, fixtures_1.context)({
    inputs: { services: ['payments', 'orders'], taskType: 'research' },
    answersOf: (id) => (id === 'scope' ? { question: 'why slow' } : {}),
});
(0, vitest_1.describe)('resolveValue', () => {
    (0, vitest_1.it)('resolves built-in task fields', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveValue)('task', 'platform', ctx)).toBe('canada-assisted');
        (0, vitest_1.expect)((0, placeholders_1.resolveValue)('task', 'epic', ctx)).toBe('PLAT-1234');
        (0, vitest_1.expect)((0, placeholders_1.resolveValue)('task', 'dir', ctx)).toBe('/tasks/T-1');
        (0, vitest_1.expect)((0, placeholders_1.resolveValue)('task', 'id', ctx)).toBe('T-1');
    });
    (0, vitest_1.it)('resolves sidebar-collected task inputs', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveValue)('task', 'services', ctx)).toEqual(['payments', 'orders']);
    });
    (0, vitest_1.it)('resolves step answers', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveValue)('scope', 'question', ctx)).toBe('why slow');
    });
    (0, vitest_1.it)('returns undefined for an unknown input', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveValue)('task', 'nope', ctx)).toBeUndefined();
    });
});
(0, vitest_1.describe)('resolveText', () => {
    (0, vitest_1.it)('substitutes into surrounding text', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveText)('Branch {{task.epic}}-research', ctx)).toBe('Branch PLAT-1234-research');
    });
    (0, vitest_1.it)('renders an array as a readable list', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveText)('Services: {{task.services}}', ctx)).toBe('Services: payments, orders');
    });
    (0, vitest_1.it)('renders a missing value as empty, never "undefined"', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveText)('X={{task.nope}}', ctx)).toBe('X=');
    });
});
(0, vitest_1.describe)('resolveList', () => {
    (0, vitest_1.it)('returns the raw array for a lone placeholder', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveList)('{{task.services}}', ctx)).toEqual(['payments', 'orders']);
    });
    (0, vitest_1.it)('returns empty for a non-array value', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveList)('{{task.epic}}', ctx)).toEqual([]);
    });
    (0, vitest_1.it)('returns empty for text that is not a lone placeholder', () => {
        (0, vitest_1.expect)((0, placeholders_1.resolveList)('a {{task.services}} b', ctx)).toEqual([]);
    });
});
