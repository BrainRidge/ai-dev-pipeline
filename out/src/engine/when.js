"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateWhen = evaluateWhen;
/**
 * One reference, one operator, one literal. Nothing more.
 *
 * This grammar must NOT be extended. If a workflow needs more logic than a
 * single comparison, that is a signal the workflow should be split, not that
 * the grammar should grow. Expression grammars expand quietly unless something
 * forbids it. See spec Section 6.
 */
const GRAMMAR = /^\s*([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*(==|!=)\s*(".*"|'.*'|true|false|-?\d+)\s*$/;
function evaluateWhen(expr, lookup) {
    const m = GRAMMAR.exec(expr);
    if (!m) {
        throw new Error(`"${expr}" is outside the when grammar. Only one comparison is allowed: ` +
            `<step>.<field> == <literal>. Split the workflow instead of extending the grammar.`);
    }
    const [, ns, field, op, rawLiteral] = m;
    const literal = parseLiteral(rawLiteral);
    const actual = lookup(ns, field);
    return op === '==' ? actual === literal : actual !== literal;
}
function parseLiteral(raw) {
    if (raw === 'true')
        return true;
    if (raw === 'false')
        return false;
    if (/^-?\d+$/.test(raw))
        return Number(raw);
    return raw.slice(1, -1);
}
