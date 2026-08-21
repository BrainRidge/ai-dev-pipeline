"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unconfiguredDescriptor = unconfiguredDescriptor;
const StepDescriptor_1 = require("../engine/StepDescriptor");
/**
 * What the sidebar shows when the content root is unset, missing or invalid.
 *
 * Both modes are replaced, not just New. Continuing a task looks as though it
 * should still work, because workflows are bundled — but resuming loads the
 * config directory too, so the action would fail after the developer took it.
 *
 * The message is passed in rather than chosen here: "you have not configured
 * this" and "you have configured this wrongly" need different words, and only
 * the caller knows which happened. See spec Section 16.
 */
function unconfiguredDescriptor(message) {
    return {
        protocolVersion: StepDescriptor_1.PROTOCOL_VERSION,
        task: { id: '', platform: '', epic: '', workflowLabel: 'Task setup' },
        progress: { index: 0, total: 0, steps: [] },
        step: {
            id: 'setup',
            kind: 'form',
            title: 'Task setup',
            fields: [],
            text: message,
            values: {},
            actions: [{ id: 'openSettings', label: 'Open Settings', primary: true }],
        },
    };
}
