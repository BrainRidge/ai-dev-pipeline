"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MICROSERVICES = void 0;
exports.step = step;
exports.context = context;
exports.taskState = taskState;
exports.MICROSERVICES = [
    {
        microserviceName: 'Payment Service',
        shortCode: 'pis',
        purpose: 'Takes payments.',
        gitLocation: 'https://abc.github/payment-service.ui',
        category: 'ui',
        subcategory: 'checkout',
    },
    {
        microserviceName: 'Orders Service',
        shortCode: 'ords',
        purpose: 'Order lifecycle.',
        gitLocation: 'https://abc.github/orders-service',
        category: 'backend',
        subcategory: 'fulfilment',
    },
];
function step(id, over = {}) {
    return {
        id,
        stepType: 'task',
        taskType: 'CollectRequirement',
        documentation: '',
        ...over,
    };
}
function context(over = {}) {
    return {
        platform: { id: 'canada-assisted', label: 'Canada Assisted' },
        microservices: exports.MICROSERVICES,
        taskDir: '/tasks/T-1',
        epic: 'PLAT-1234',
        taskId: 'T-1',
        workflowId: 'researchTaskWorkflow',
        inputs: {},
        order: [],
        answersOf: () => ({}),
        resultOf: () => ({}),
        ...over,
    };
}
function taskState(over = {}) {
    return {
        schemaVersion: 1,
        taskId: 'T-1',
        workflowId: 'researchTaskWorkflow',
        workflowVersion: '1.0',
        platform: 'canada-assisted',
        epic: 'PLAT-1234',
        currentStepId: 'requirement',
        workflowHash: 'h',
        inputs: {},
        steps: {},
        ...over,
    };
}
