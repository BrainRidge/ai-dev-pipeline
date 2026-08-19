"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskTypeRegistry = void 0;
class TaskTypeRegistry {
    types = new Map();
    constructor(types = []) {
        for (const t of types)
            this.register(t);
    }
    register(t) {
        this.types.set(t.name, t);
    }
    get(name) {
        const t = this.types.get(name);
        if (!t) {
            throw new Error(`unknown taskType "${name}". Known: ${[...this.types.keys()].sort().join(', ')}`);
        }
        return t;
    }
    has(name) {
        return this.types.has(name);
    }
    /** Every taskType named by a workflow must exist and agree on its stepType. */
    validateWorkflow(workflowId, steps) {
        for (const step of Object.values(steps)) {
            const t = this.get(step.taskType);
            if (t.stepType !== step.stepType) {
                throw new Error(`${workflowId}: step "${step.id}" declares stepType "${step.stepType}" ` +
                    `but taskType "${step.taskType}" is a "${t.stepType}" step`);
            }
        }
    }
}
exports.TaskTypeRegistry = TaskTypeRegistry;
