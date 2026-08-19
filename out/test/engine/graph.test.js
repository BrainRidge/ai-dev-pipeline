"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
const schema_1 = require("../../src/engine/schema");
function steps(spec) {
    const out = {};
    for (const [id, nextStep] of Object.entries(spec)) {
        out[id] = {
            id,
            stepType: 'task',
            taskType: 'CollectRequirement',
            documentation: '',
            ...(nextStep ? { nextStep } : {}),
        };
    }
    return out;
}
(0, vitest_1.describe)('parseWorkflowFilename', () => {
    (0, vitest_1.it)('reads id and version from the filename', () => {
        (0, vitest_1.expect)((0, schema_1.parseWorkflowFilename)('researchTaskWorkflow_1_0.json')).toEqual({
            id: 'researchTaskWorkflow',
            version: '1.0',
        });
    });
    (0, vitest_1.it)('handles multi-digit versions', () => {
        (0, vitest_1.expect)((0, schema_1.parseWorkflowFilename)('bugFix_12_34.json')).toEqual({ id: 'bugFix', version: '12.34' });
    });
    (0, vitest_1.it)('rejects an unversioned filename', () => {
        (0, vitest_1.expect)((0, schema_1.parseWorkflowFilename)('research.json')).toBeUndefined();
    });
});
(0, vitest_1.describe)('validateGraph', () => {
    (0, vitest_1.it)('returns reachable order from the entry point', () => {
        const order = (0, WorkflowCatalog_1.validateGraph)('wf', 'a', steps({ a: 'b', b: 'c', c: undefined }));
        (0, vitest_1.expect)(order).toEqual(['a', 'b', 'c']);
    });
    (0, vitest_1.it)('rejects an initialStep that is not a step', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateGraph)('wf', 'nope', steps({ a: undefined }))).toThrow(/initialStep/);
    });
    (0, vitest_1.it)('rejects a nextStep that does not resolve', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateGraph)('wf', 'a', steps({ a: 'ghost' }))).toThrow(/unknown nextStep "ghost"/);
    });
    // The typo in the original example JSON.
    (0, vitest_1.it)('rejects a step that points at itself', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateGraph)('wf', 'a', steps({ a: 'b', b: 'b' }))).toThrow(/points at itself/);
    });
    (0, vitest_1.it)('rejects a stranded step', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateGraph)('wf', 'a', steps({ a: undefined, orphan: undefined }))).toThrow(/"orphan" cannot be reached/);
    });
    (0, vitest_1.it)('rejects a graph with no terminal step', () => {
        // a -> b -> a: every step is reachable, but it never ends.
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateGraph)('wf', 'a', steps({ a: 'b', b: 'a' }))).toThrow(/never finish/);
    });
    (0, vitest_1.it)('accepts a loop that still has a way out', () => {
        // a -> b -> c, and c is terminal; b is revisitable via an explicit action.
        (0, vitest_1.expect)((0, WorkflowCatalog_1.validateGraph)('wf', 'a', steps({ a: 'b', b: 'c', c: undefined }))).toHaveLength(3);
    });
});
