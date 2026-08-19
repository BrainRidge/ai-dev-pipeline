"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const SetupSelection_1 = require("../../src/session/SetupSelection");
const complete = {
    platform: 'canada-assisted',
    epic: 'PLAT-1234',
    workflowId: 'researchTaskWorkflow',
    featureStory: '',
    baseBranch: 'develop',
    workDir: '/Users/you/work',
    services: ['pis'],
};
(0, vitest_1.describe)('needsFeatureStory', () => {
    (0, vitest_1.it)('is true for the new feature workflow', () => {
        (0, vitest_1.expect)((0, SetupSelection_1.needsFeatureStory)(SetupSelection_1.NEW_FEATURE_WORKFLOW_ID)).toBe(true);
    });
    (0, vitest_1.it)('is false for every other workflow', () => {
        (0, vitest_1.expect)((0, SetupSelection_1.needsFeatureStory)('researchTaskWorkflow')).toBe(false);
        (0, vitest_1.expect)((0, SetupSelection_1.needsFeatureStory)('')).toBe(false);
    });
});
(0, vitest_1.describe)('validateSetup', () => {
    (0, vitest_1.it)('accepts a complete selection', () => {
        (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)(complete)).toEqual({});
    });
    (0, vitest_1.it)('requires a platform', () => {
        (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, platform: '' }).platform).toMatch(/platform/i);
    });
    (0, vitest_1.it)('requires an epic', () => {
        (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, epic: '  ' }).epic).toMatch(/epic/i);
    });
    (0, vitest_1.it)('requires a task type', () => {
        (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, workflowId: '' }).workflowId).toMatch(/task type/i);
    });
    (0, vitest_1.it)('requires a base branch, because there is no safe default to guess', () => {
        (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, baseBranch: '' }).baseBranch).toMatch(/base branch/i);
    });
    (0, vitest_1.it)('requires at least one microservice', () => {
        (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, services: [] }).services).toMatch(/microservice/i);
    });
    (0, vitest_1.describe)('work directory', () => {
        (0, vitest_1.it)('is required', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, workDir: '  ' }).workDir).toMatch(/required/i);
        });
        (0, vitest_1.it)('rejects a relative path, which would resolve against an unknown cwd', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, workDir: 'work/repos' }).workDir).toMatch(/full path/i);
        });
        (0, vitest_1.it)('rejects a bare home shorthand, which a shell expands but git clone does not', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, workDir: '~/work' }).workDir).toBeDefined();
        });
        (0, vitest_1.it)('accepts a POSIX path', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, workDir: '/Users/you/work' })).toEqual({});
        });
        (0, vitest_1.it)('accepts a Windows path, since the commands are pasted into a shell', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, workDir: 'C:\\work' })).toEqual({});
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, workDir: '\\\\server\\share' })).toEqual({});
        });
        (0, vitest_1.it)('trims it on the way to the task state', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.normaliseSetup)({ ...complete, workDir: '  /Users/you/work ' }).workDir).toBe('/Users/you/work');
        });
    });
    (0, vitest_1.describe)('feature story', () => {
        const newFeature = { ...complete, workflowId: SetupSelection_1.NEW_FEATURE_WORKFLOW_ID };
        (0, vitest_1.it)('is required for the new feature workflow', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...newFeature, featureStory: '' }).featureStory).toMatch(/required/i);
        });
        (0, vitest_1.it)('accepts a JIRA key', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...newFeature, featureStory: 'PLAT-4821' })).toEqual({});
        });
        (0, vitest_1.it)('rejects a bare number, which is the likely mistake', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...newFeature, featureStory: '4821' }).featureStory).toMatch(/PLAT-1234/);
        });
        (0, vitest_1.it)('rejects a key with no number', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...newFeature, featureStory: 'PLAT-' }).featureStory).toBeDefined();
        });
        (0, vitest_1.it)('tolerates surrounding whitespace', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...newFeature, featureStory: '  PLAT-4821 ' })).toEqual({});
        });
        (0, vitest_1.it)('is ignored entirely by other workflows', () => {
            (0, vitest_1.expect)((0, SetupSelection_1.validateSetup)({ ...complete, featureStory: 'nonsense' })).toEqual({});
        });
    });
});
