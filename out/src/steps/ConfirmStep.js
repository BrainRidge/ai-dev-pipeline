"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfirmStep = void 0;
class ConfirmStep {
    kind = 'confirm';
    describe(step, _ctx, _values) {
        return {
            text: step.text ?? '',
            actions: [
                { id: 'no', label: 'No' },
                { id: 'yes', label: 'Yes', primary: true },
            ],
        };
    }
    validate() {
        return { ok: true, errors: {} };
    }
    async execute(_step, _ctx, values) {
        return { confirmed: values.actionId === 'yes' };
    }
}
exports.ConfirmStep = ConfirmStep;
