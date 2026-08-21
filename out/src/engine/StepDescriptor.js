"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROTOCOL_VERSION = void 0;
exports.badgeFor = badgeFor;
exports.summarise = summarise;
exports.detailAnswers = detailAnswers;
exports.buildWorkflowDescriptor = buildWorkflowDescriptor;
const node_path_1 = require("node:path");
/** v2: the descriptor carries the whole workflow, not just the active step. */
exports.PROTOCOL_VERSION = 2;
/**
 * Badges are derived from the step's shape, so workflow authors never declare
 * them. "Input" and "Selection" are the same stepType underneath — what
 * separates them is whether the fields offer a fixed set of choices.
 */
function badgeFor(step, fields) {
    switch (step.stepType) {
        case 'commandExecution':
            return 'COMMAND';
        case 'aiHandoff':
            return 'COPILOT';
        case 'manual':
            return 'REVIEW';
        case 'systemCheck':
            return 'SYSTEM';
        default: {
            const offered = fields ?? [];
            const choosy = offered.filter((f) => f.type === 'select' || f.type === 'multiselect');
            return choosy.length > 0 && choosy.length >= offered.length / 2 ? 'SELECT' : 'INPUT';
        }
    }
}
function summarise(step, record, fields) {
    if (!record || record.status !== 'complete')
        return undefined;
    switch (step.stepType) {
        case 'commandExecution': {
            const repos = (record.result?.repos ?? []);
            const branch = String(record.result?.branch ?? '');
            return `${repos.length} ${repos.length === 1 ? 'repo' : 'repos'}${branch ? ` on ${branch}` : ''}`;
        }
        case 'aiHandoff': {
            const file = artifactName(record.result?.outputPath) ?? 'The output file';
            return record.result?.outputPresent ? `${file} written` : `${file} missing`;
        }
        case 'manual': {
            const file = artifactName(record.result?.artifactPath);
            return file ? `${file} approved` : 'Approved';
        }
        case 'systemCheck': {
            const findings = (record.result?.findings ?? []);
            if (findings.length === 0)
                return 'Checked';
            const ok = findings.filter((f) => f.status === 'ok').length;
            return `${ok} of ${findings.length} tools found`;
        }
        default: {
            const answers = record.answers ?? {};
            const parts = (fields ?? [])
                .map((f) => answers[f.id])
                .filter((v) => v !== undefined && v !== null && v !== '')
                .map((v) => (Array.isArray(v) ? v.join(', ') : String(v)));
            const joined = parts.join(' · ');
            if (!joined)
                return undefined;
            return joined.length > 120 ? `${joined.slice(0, 117)}…` : joined;
        }
    }
}
/** Label/value pairs for the detail pane. Pre-formatted so the renderer stays dumb. */
function detailAnswers(step, record, fields) {
    if (!record || record.status !== 'complete')
        return undefined;
    if (step.stepType === 'commandExecution') {
        const repos = (record.result?.repos ?? []);
        const out = repos.map((r) => ({ label: r.name, value: r.path }));
        const branch = String(record.result?.branch ?? '');
        if (branch)
            out.unshift({ label: 'Base branch', value: branch });
        return out.length > 0 ? out : undefined;
    }
    const answers = record.answers ?? {};
    const pairs = (fields ?? [])
        .map((f) => ({
        label: f.label,
        value: Array.isArray(answers[f.id])
            ? answers[f.id].join(', ')
            : String(answers[f.id] ?? ''),
    }))
        .filter((p) => p.value !== '');
    return pairs.length > 0 ? pairs : undefined;
}
async function buildWorkflowDescriptor(args) {
    const { workflow, state, registry, ctx, values, errors } = args;
    const activeId = state.currentStepId;
    // Every step describes itself, not just the active one: completed steps need
    // their fields to summarise their answers. Order is preserved by Promise.all.
    const steps = await Promise.all(workflow.order.map(async (stepId, i) => {
        const step = workflow.steps[stepId];
        const task = registry.get(step.taskType);
        const record = state.steps[step.id];
        const status = step.id === activeId ? 'current' : record?.status === 'complete' ? 'complete' : 'pending';
        // The active step prefills from what the developer has typed; every other
        // step describes itself against what it already answered.
        const prefill = status === 'current' && Object.keys(values).length > 0 ? values : (record?.answers ?? {});
        const view = await task.describe(step, ctx, prefill);
        const base = {
            id: step.id,
            index: i + 1,
            title: task.title,
            stepType: step.stepType,
            badge: badgeFor(step, view.fields),
            status,
            documentation: step.documentation || undefined,
            summary: summarise(step, record, view.fields),
            answers: detailAnswers(step, record, view.fields),
        };
        if (status !== 'current') {
            // A completed step offers Edit — which reactivates it and marks
            // everything after it pending. See spec Section 9.
            if (status === 'complete')
                base.actions = [{ id: 'edit', label: 'Edit' }];
            return base;
        }
        return {
            ...base,
            fields: view.fields,
            text: view.text,
            commands: view.commands,
            values: prefill,
            errors: Object.keys(errors).length > 0 ? errors : undefined,
            actions: view.actions,
        };
    }));
    return {
        protocolVersion: exports.PROTOCOL_VERSION,
        task: {
            id: state.taskId,
            platform: state.platform,
            epic: state.epic,
            workflowLabel: workflow.label,
        },
        activeStepId: activeId,
        steps,
    };
}
function artifactName(path) {
    return typeof path === 'string' && path.length > 0 ? (0, node_path_1.basename)(path) : undefined;
}
