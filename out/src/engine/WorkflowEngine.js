"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowEngine = void 0;
/**
 * Holds no authoritative state in memory — every transition is written to disk
 * before the caller sees it. Never touches the filesystem or git directly; it
 * works through the store and the task types. See spec Section 5.
 *
 * Traversal is by `nextStep`: the workflow is a graph, and the engine only ever
 * asks a step where it goes next. `order` — the walk from `initialStep`
 * computed at load time — is used for going backwards, which a graph of
 * forward edges cannot answer on its own.
 */
class WorkflowEngine {
    workflow;
    store;
    registry;
    ctx;
    constructor(workflow, store, registry, ctx) {
        this.workflow = workflow;
        this.store = store;
        this.registry = registry;
        this.ctx = ctx;
    }
    async state() {
        return this.store.read();
    }
    async current() {
        return this.stepById((await this.store.read()).currentStepId);
    }
    /**
     * Reopen a step. Everything after it becomes pending, because later steps
     * were answered on the basis of what this one said. Their answers are kept
     * so they prefill on the way back through.
     */
    async edit(stepId) {
        const state = await this.store.read();
        this.reopen(state, stepId);
        await this.store.write(state);
    }
    /**
     * Keep a draft on a step without finishing it — an edited prompt the
     * developer has not yet acted on. Status and position are untouched, so this
     * can never advance or reopen a step by accident.
     */
    async saveAnswers(stepId, answers) {
        const step = this.stepById(stepId);
        const state = await this.store.read();
        const record = state.steps[step.id] ?? { status: 'in_progress' };
        state.steps[step.id] = { ...record, answers: { ...record.answers, ...answers } };
        await this.store.write(state);
    }
    async submit(stepId, actionId, values) {
        const state = await this.store.read();
        const step = this.stepById(stepId);
        const task = this.taskFor(step);
        // Revise sends the work back to whatever produced it — the step before
        // this one — and reopens everything from there.
        if (actionId === 'revise') {
            this.reopen(state, this.previousId(step.id) ?? step.id);
            await this.store.write(state);
            return { ok: true, done: false };
        }
        if (actionId === 'back') {
            const previous = this.previousId(step.id);
            if (previous) {
                state.currentStepId = previous;
                await this.store.write(state);
            }
            return { ok: true, done: false };
        }
        const validation = task.validate(step, values);
        if (!validation.ok)
            return { ok: false, errors: validation.errors };
        const result = await task.execute(step, this.ctx, values);
        state.steps[step.id] = { status: 'complete', answers: values, result };
        state.currentStepId = step.nextStep ?? step.id;
        // Persisted BEFORE the caller sees the transition.
        await this.store.write(state);
        return { ok: true, done: step.nextStep === undefined };
    }
    reopen(state, stepId) {
        const index = this.workflow.order.indexOf(stepId);
        if (index < 0)
            throw new Error(`unknown step: ${stepId}`);
        for (const later of this.workflow.order.slice(index)) {
            const record = state.steps[later];
            if (record)
                state.steps[later] = { ...record, status: 'pending' };
        }
        state.currentStepId = stepId;
    }
    stepById(id) {
        const step = this.workflow.steps[id];
        if (!step)
            throw new Error(`unknown step: ${id}`);
        return step;
    }
    taskFor(step) {
        return this.registry.get(step.taskType);
    }
    previousId(fromId) {
        const index = this.workflow.order.indexOf(fromId);
        return index > 0 ? this.workflow.order[index - 1] : undefined;
    }
}
exports.WorkflowEngine = WorkflowEngine;
