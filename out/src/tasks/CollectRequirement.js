"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectRequirement = void 0;
function isEmpty(v) {
    if (v === undefined || v === null)
        return true;
    if (typeof v === 'string')
        return v.trim() === '';
    if (Array.isArray(v))
        return v.length === 0;
    return false;
}
/**
 * Gathers the human context a task needs. Defined once and referenced by the
 * research, story-development and bug-fix workflows alike.
 */
class CollectRequirement {
    name = 'CollectRequirement';
    stepType = 'task';
    title = 'Collect the requirement';
    fields = [
        { id: 'story', type: 'textarea', label: 'JIRA story acceptance criteria as is', provider: 'manual', required: true },
        { id: 'notes', type: 'textarea', label: 'Meeting notes from call or conversation' },
    ];
    async describe(_step, _ctx, _values) {
        return {
            fields: this.fields,
            actions: [
                { id: 'back', label: 'Back' },
                { id: 'submit', label: 'Continue', primary: true },
            ],
        };
    }
    validate(_step, values) {
        const errors = {};
        for (const f of this.fields) {
            if (f.required && isEmpty(values[f.id]))
                errors[f.id] = `${f.label} is required`;
        }
        return { ok: Object.keys(errors).length === 0, errors };
    }
    async execute(_step, _ctx, values) {
        return values;
    }
}
exports.CollectRequirement = CollectRequirement;
