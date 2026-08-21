"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MICROSERVICES = exports.foundProbe = exports.TOOLS = void 0;
exports.systemCheck = systemCheck;
exports.step = step;
exports.context = context;
exports.taskState = taskState;
exports.bundledResolver = bundledResolver;
const ContentRoot_1 = require("../../src/content/ContentRoot");
const SystemCheck_1 = require("../../src/tasks/SystemCheck");
/** One required tool with no version floor — enough to exercise the step. */
exports.TOOLS = [
    {
        id: 'git',
        label: 'Git',
        command: 'git',
        args: ['--version'],
        required: true,
        why: 'The Get the code step gives you git commands to run.',
        install: { darwin: 'brew install git', win32: 'winget install Git.Git' },
    },
];
/** A probe that finds everything and reports a plausible version. */
exports.foundProbe = {
    async run() {
        return { found: true, output: 'git version 2.50.1' };
    },
};
/**
 * A System Check wired to a fake machine. The platform is pinned so the install
 * hint in the report reads the same wherever the test runs.
 */
function systemCheck(opts = {}) {
    const sink = opts.sink ?? { async copy() { }, async toTerminal() { } };
    return new SystemCheck_1.SystemCheck(async () => ({
        tools: opts.tools ?? exports.TOOLS,
        source: opts.source ?? 'bundled',
        path: opts.path,
    }), opts.probe ?? exports.foundProbe, sink, 'darwin');
}
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
/**
 * A resolver with no content root, so every template resolves to the given
 * directory. This is what `PromptComposer` did on its own before the content
 * root existed, and it keeps tests that do not care about resolution short.
 */
function bundledResolver(promptsDir) {
    return (0, ContentRoot_1.templateResolver)({ bundledPromptsDir: promptsDir }, ContentRoot_1.nodeProbe);
}
