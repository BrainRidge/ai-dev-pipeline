"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormStep = void 0;
function isEmpty(v) {
    if (v === undefined || v === null)
        return true;
    if (typeof v === 'string')
        return v.trim() === '';
    if (Array.isArray(v))
        return v.length === 0;
    return false;
}
class FormStep {
    kind = 'form';
    describe(step, ctx, _values) {
        const fields = (step.fields ?? []).map((f) => {
            if (f.source === 'platform.services') {
                return {
                    ...f,
                    options: ctx.platform.services.map((s) => ({ value: s.id, label: s.label })),
                };
            }
            return { ...f };
        });
        return {
            fields,
            actions: [
                { id: 'back', label: 'Back' },
                { id: 'submit', label: 'Continue', primary: true },
            ],
        };
    }
    validate(step, values) {
        const errors = {};
        for (const f of step.fields ?? []) {
            if (f.required && isEmpty(values[f.id])) {
                errors[f.id] = `${f.label} is required`;
            }
        }
        return { ok: Object.keys(errors).length === 0, errors };
    }
    async execute(_step, _ctx, values) {
        return values;
    }
}
exports.FormStep = FormStep;
