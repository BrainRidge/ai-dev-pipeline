"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const when_1 = require("../../src/engine/when");
const data = {
    design: { exists: false, owner: 'ana', count: 3 },
};
const lookup = (ns, f) => data[ns]?.[f];
(0, vitest_1.describe)('evaluateWhen', () => {
    (0, vitest_1.it)('compares against a boolean literal', () => {
        (0, vitest_1.expect)((0, when_1.evaluateWhen)('design.exists == false', lookup)).toBe(true);
        (0, vitest_1.expect)((0, when_1.evaluateWhen)('design.exists == true', lookup)).toBe(false);
    });
    (0, vitest_1.it)('compares against a string literal', () => {
        (0, vitest_1.expect)((0, when_1.evaluateWhen)('design.owner == "ana"', lookup)).toBe(true);
        (0, vitest_1.expect)((0, when_1.evaluateWhen)("design.owner == 'ana'", lookup)).toBe(true);
    });
    (0, vitest_1.it)('compares against a number literal', () => {
        (0, vitest_1.expect)((0, when_1.evaluateWhen)('design.count == 3', lookup)).toBe(true);
    });
    (0, vitest_1.it)('supports !=', () => {
        (0, vitest_1.expect)((0, when_1.evaluateWhen)('design.owner != "bob"', lookup)).toBe(true);
        (0, vitest_1.expect)((0, when_1.evaluateWhen)('design.owner != "ana"', lookup)).toBe(false);
    });
    (0, vitest_1.it)('treats a missing field as undefined rather than throwing', () => {
        (0, vitest_1.expect)((0, when_1.evaluateWhen)('design.missing == "x"', lookup)).toBe(false);
    });
    // The grammar must stay tiny. See spec Section 6.
    (0, vitest_1.it)('rejects boolean connectives', () => {
        (0, vitest_1.expect)(() => (0, when_1.evaluateWhen)('a.b == 1 && c.d == 2', lookup)).toThrow(/grammar/i);
    });
    (0, vitest_1.it)('rejects relational operators', () => {
        (0, vitest_1.expect)(() => (0, when_1.evaluateWhen)('a.b > 1', lookup)).toThrow(/grammar/i);
    });
    (0, vitest_1.it)('rejects a bare reference with no comparison', () => {
        (0, vitest_1.expect)(() => (0, when_1.evaluateWhen)('a.b', lookup)).toThrow(/grammar/i);
    });
});
