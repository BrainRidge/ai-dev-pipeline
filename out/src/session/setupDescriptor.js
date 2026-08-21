"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAMPLE_NOTICE = void 0;
exports.unconfiguredDescriptor = unconfiguredDescriptor;
const StepDescriptor_1 = require("../engine/StepDescriptor");
/**
 * The banner shown while the bundled sample catalogue is in play.
 *
 * Falling back is only acceptable if it is visible afterwards — the rule
 * [Section 16](16-external-content.md) applies to prompt templates and
 * [Section 17](17-system-check.md) applies to the tool list. This is the same
 * rule for the catalogue, and it has to be louder than a caption because the
 * consequence is more surprising: a developer who does not notice will select a
 * service that cannot be cloned.
 */
exports.SAMPLE_NOTICE = '⚠ Using the bundled sample catalogue — placeholder services that cannot be ' +
    "cloned. Set Content Root to your team's folder to work on real repositories.";
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
