"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEW_FEATURE_WORKFLOW_ID = void 0;
exports.isAbsolutePath = isAbsolutePath;
exports.needsFeatureStory = needsFeatureStory;
exports.validateSetup = validateSetup;
exports.normaliseSetup = normaliseSetup;
/**
 * The one workflow that asks for a story key up front.
 *
 * This is a name in TypeScript, which the config-driven design otherwise
 * avoids: a workflow that wants its own sidebar field costs an edit here and a
 * release. That trade was made deliberately — the alternative was letting
 * workflows declare their task inputs in JSON. If a third workflow needs a
 * field of its own, revisit that rather than extending this list.
 */
exports.NEW_FEATURE_WORKFLOW_ID = 'newFeatureWorkflow';
/** PLAT-1234 — the same shape as the epic key beside it. */
const JIRA_KEY = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
/** Accepts POSIX and Windows roots, since the commands are pasted into a shell. */
function isAbsolutePath(value) {
    return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}
function needsFeatureStory(workflowId) {
    return workflowId === exports.NEW_FEATURE_WORKFLOW_ID;
}
/** Field id to message. An empty object means the selection is usable. */
function validateSetup(selection) {
    const errors = {};
    if (!selection.platform)
        errors.platform = 'Select a platform';
    if (!selection.epic.trim())
        errors.epic = 'An epic key is required';
    if (!selection.workflowId)
        errors.workflowId = 'Select a task type';
    if (!selection.baseBranch.trim()) {
        errors.baseBranch = 'A base branch is required';
    }
    if (selection.services.length === 0) {
        errors.services = 'Select at least one microservice';
    }
    const workDir = selection.workDir.trim();
    if (!workDir) {
        errors.workDir = 'A work directory is required';
    }
    else if (!isAbsolutePath(workDir)) {
        // A relative path would resolve against whatever the terminal's working
        // directory happened to be, which is not something we can predict.
        errors.workDir = 'Enter a full path, such as /Users/you/work';
    }
    if (needsFeatureStory(selection.workflowId)) {
        const story = selection.featureStory.trim();
        if (!story) {
            errors.featureStory = 'A feature story is required';
        }
        else if (!JIRA_KEY.test(story)) {
            errors.featureStory = 'Enter a story key such as PLAT-1234';
        }
    }
    return errors;
}
/** Trimmed and normalised, ready to be written to the task state. */
function normaliseSetup(selection) {
    return {
        ...selection,
        epic: selection.epic.trim(),
        baseBranch: selection.baseBranch.trim(),
        workDir: selection.workDir.trim(),
        featureStory: needsFeatureStory(selection.workflowId) ? selection.featureStory.trim() : '',
    };
}
