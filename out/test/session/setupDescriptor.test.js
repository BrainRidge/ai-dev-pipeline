"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const setupDescriptor_1 = require("../../src/session/setupDescriptor");
const StepDescriptor_1 = require("../../src/engine/StepDescriptor");
/**
 * Nothing configured now loads the bundled sample, so the wall below is only
 * reached by a path configured wrongly. The banner is what keeps the fallback
 * from being silent. See spec Section 16.
 */
(0, vitest_1.describe)('the sample-catalogue banner', () => {
    (0, vitest_1.it)('says the services are placeholders that cannot be cloned', () => {
        (0, vitest_1.expect)(setupDescriptor_1.SAMPLE_NOTICE).toMatch(/placeholder/i);
        (0, vitest_1.expect)(setupDescriptor_1.SAMPLE_NOTICE).toMatch(/cannot be cloned/i);
    });
    (0, vitest_1.it)('names the setting that replaces it, not just the problem', () => {
        (0, vitest_1.expect)(setupDescriptor_1.SAMPLE_NOTICE).toMatch(/Content Root/);
    });
    (0, vitest_1.it)('reads as a warning rather than an error, because the form still works', () => {
        (0, vitest_1.expect)(setupDescriptor_1.SAMPLE_NOTICE.startsWith('\u26a0')).toBe(true);
    });
});
(0, vitest_1.describe)('the sidebar with a badly configured content path', () => {
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
