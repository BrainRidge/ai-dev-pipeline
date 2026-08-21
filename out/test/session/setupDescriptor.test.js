"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const setupDescriptor_1 = require("../../src/session/setupDescriptor");
const StepDescriptor_1 = require("../../src/engine/StepDescriptor");
(0, vitest_1.describe)('the sidebar with no usable content root', () => {
    (0, vitest_1.it)('shows the message it was given rather than one of its own', () => {
        const message = 'No microservice config configured. Set aiDevWorkflow.microserviceConfig in ' +
            'Settings → Extensions → AI Dev Workflow, or set Content Root to fill it in.';
        (0, vitest_1.expect)((0, setupDescriptor_1.unconfiguredDescriptor)(message).step.text).toBe(message);
    });
    (0, vitest_1.it)('passes a load failure through verbatim, so a typo reads as a typo', () => {
        const message = 'microservices.json not found at /team/config/microservices.json';
        (0, vitest_1.expect)((0, setupDescriptor_1.unconfiguredDescriptor)(message).step.text).toBe(message);
    });
    // Every field would be empty or wrong, and an empty microservice list can
    // never satisfy validateSetup. Offering the form would only mislead.
    (0, vitest_1.it)('offers no fields', () => {
        (0, vitest_1.expect)((0, setupDescriptor_1.unconfiguredDescriptor)('x').step.fields).toEqual([]);
    });
    (0, vitest_1.it)('offers exactly one action, and it is the fix', () => {
        (0, vitest_1.expect)((0, setupDescriptor_1.unconfiguredDescriptor)('x').step.actions).toEqual([
            { id: 'openSettings', label: 'Open Settings', primary: true },
        ]);
    });
    // Resuming needs the config directory too, so there is no half-working mode
    // to fall back to.
    (0, vitest_1.it)('offers no way into the existing-task mode', () => {
        const ids = (0, setupDescriptor_1.unconfiguredDescriptor)('x').step.fields.map((f) => f.id);
        (0, vitest_1.expect)(ids).not.toContain('mode');
    });
    (0, vitest_1.it)('carries the protocol version, so the renderer does not reject it', () => {
        (0, vitest_1.expect)((0, setupDescriptor_1.unconfiguredDescriptor)('x').protocolVersion).toBe(StepDescriptor_1.PROTOCOL_VERSION);
    });
    (0, vitest_1.it)('has no footer, because the work directory is not the problem to solve', () => {
        (0, vitest_1.expect)((0, setupDescriptor_1.unconfiguredDescriptor)('x').footer).toBeUndefined();
    });
});
