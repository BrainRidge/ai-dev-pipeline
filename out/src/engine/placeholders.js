"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveValue = resolveValue;
exports.renderValue = renderValue;
exports.resolveText = resolveText;
exports.resolveList = resolveList;
/**
 * Task-level facts are collected once in the sidebar at task start and are
 * readable by every workflow, so no step has to ask for them again.
 * See spec Section 6.
 */
function resolveValue(ns, field, ctx) {
    if (ns === 'task') {
        switch (field) {
            case 'platform':
                return ctx.platform.id;
            case 'epic':
                return ctx.epic;
            case 'dir':
                return ctx.taskDir;
            case 'id':
                return ctx.taskId;
            default:
                return ctx.inputs[field];
        }
    }
    return ctx.answersOf(ns)[field];
}
/** Renders a value for inclusion in text. Arrays read as a list, not as JSON. */
function renderValue(v) {
    if (Array.isArray(v))
        return v.join(', ');
    return String(v ?? '');
}
function resolveText(text, ctx) {
    return text.replace(/\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}/g, (_full, ns, field) => renderValue(resolveValue(ns, field, ctx)));
}
/** A placeholder used on its own, where the raw value matters (e.g. a list). */
function resolveList(expr, ctx) {
    const m = /^\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}$/.exec(expr.trim());
    if (!m)
        return [];
    const value = resolveValue(m[1], m[2], ctx);
    return Array.isArray(value) ? value.map(String) : [];
}
