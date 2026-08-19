"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @vitest-environment jsdom
const vitest_1 = require("vitest");
const fields_1 = require("../../webview/render/fields");
(0, vitest_1.beforeAll)(() => {
    // jsdom has no layout engine, so scrollIntoView is absent.
    Element.prototype.scrollIntoView = () => { };
});
const descriptor = {
    protocolVersion: 2,
    task: {
        id: 'PLAT-1234-research-20260815-01',
        platform: 'canada-assisted',
        epic: 'PLAT-1234',
        workflowLabel: 'Research Task',
    },
    activeStepId: 'context',
    steps: [
        {
            id: 'scope',
            index: 1,
            title: 'What are we researching?',
            stepType: 'task',
            badge: 'INPUT',
            status: 'complete',
            summary: 'why is checkout slow',
            answers: [{ label: 'Research question', value: 'why is checkout slow' }],
            actions: [{ id: 'edit', label: 'Edit' }],
        },
        {
            id: 'checkout',
            index: 2,
            title: 'Get the code',
            stepType: 'commandExecution',
            badge: 'COMMAND',
            status: 'complete',
            summary: '2 repos on PLAT-1234-research',
            actions: [{ id: 'edit', label: 'Edit' }],
        },
        {
            id: 'context',
            index: 3,
            title: 'Supporting context',
            stepType: 'task',
            badge: 'INPUT',
            status: 'current',
            values: { story: 'existing story' },
            fields: [{ id: 'story', type: 'textarea', label: 'JIRA story' }],
            actions: [
                { id: 'back', label: 'Back' },
                { id: 'submit', label: 'Continue', primary: true },
            ],
        },
        {
            id: 'analyse',
            index: 4,
            title: 'Run the analysis',
            stepType: 'aiHandoff',
            badge: 'COPILOT',
            status: 'pending',
        },
    ],
};
function render(onAction) {
    const root = document.createElement('div');
    (0, fields_1.renderWorkflow)(descriptor, root, onAction);
    return root;
}
(0, vitest_1.describe)('the diagram', () => {
    (0, vitest_1.it)('draws a node for every step', () => {
        (0, vitest_1.expect)(render().querySelectorAll('.wf-node')).toHaveLength(4);
    });
    (0, vitest_1.it)('draws a connector between each pair of nodes', () => {
        (0, vitest_1.expect)(render().querySelectorAll('.wf-connector')).toHaveLength(3);
    });
    (0, vitest_1.it)('numbers the nodes', () => {
        const indexes = [...render().querySelectorAll('.wf-node-index')].map((n) => n.textContent);
        (0, vitest_1.expect)(indexes).toEqual(['1', '2', '3', '4']);
    });
    (0, vitest_1.it)('badges each node by type', () => {
        const badges = [...render().querySelectorAll('.wf-node .badge')].map((b) => b.textContent);
        (0, vitest_1.expect)(badges).toEqual(['INPUT', 'COMMAND', 'INPUT', 'COPILOT']);
    });
    (0, vitest_1.it)('marks node status as a class', () => {
        const root = render();
        (0, vitest_1.expect)(root.querySelector('[data-step-id=scope]').className).toContain('complete');
        (0, vitest_1.expect)(root.querySelector('[data-step-id=context]').className).toContain('current');
        (0, vitest_1.expect)(root.querySelector('[data-step-id=analyse]').className).toContain('pending');
    });
    (0, vitest_1.it)('shows a summary on completed nodes', () => {
        (0, vitest_1.expect)(render().querySelector('[data-step-id=scope]').textContent).toContain('why is checkout slow');
    });
    (0, vitest_1.it)('selects the active step on load', () => {
        (0, vitest_1.expect)(render().querySelector('.wf-node.selected').getAttribute('data-step-id')).toBe('context');
    });
});
(0, vitest_1.describe)('the detail pane', () => {
    (0, vitest_1.it)('shows the active step with its fields', () => {
        const root = render();
        const detail = root.querySelector('.wf-detail');
        (0, vitest_1.expect)(detail.textContent).toContain('Supporting context');
        (0, vitest_1.expect)(detail.querySelector('textarea')).not.toBeNull();
    });
    (0, vitest_1.it)('prefills the active step from stored values', () => {
        const box = render().querySelector('.wf-detail textarea');
        (0, vitest_1.expect)(box.value).toBe('existing story');
    });
    (0, vitest_1.it)('keeps fields out of the diagram itself', () => {
        (0, vitest_1.expect)(render().querySelector('.wf-canvas textarea')).toBeNull();
    });
    (0, vitest_1.it)('switches to a completed step when its node is clicked', () => {
        const root = render();
        root.querySelector('[data-step-id=scope]').click();
        const detail = root.querySelector('.wf-detail');
        (0, vitest_1.expect)(detail.textContent).toContain('What are we researching?');
        (0, vitest_1.expect)(detail.querySelector('textarea')).toBeNull();
    });
    (0, vitest_1.it)('shows a completed step read-only, with its answers', () => {
        const root = render();
        root.querySelector('[data-step-id=scope]').click();
        const labels = [...root.querySelectorAll('.wf-answer-label')].map((n) => n.textContent);
        const values = [...root.querySelectorAll('.wf-answer-value')].map((n) => n.textContent);
        (0, vitest_1.expect)(labels).toEqual(['Research question']);
        (0, vitest_1.expect)(values).toEqual(['why is checkout slow']);
    });
    (0, vitest_1.it)('offers Edit on a completed step', () => {
        const root = render();
        root.querySelector('[data-step-id=scope]').click();
        const buttons = [...root.querySelectorAll('.wf-detail button')].map((b) => b.textContent);
        (0, vitest_1.expect)(buttons).toEqual(['Edit']);
    });
    (0, vitest_1.it)('explains that a pending step is not reachable yet', () => {
        const root = render();
        root.querySelector('[data-step-id=analyse]').click();
        const detail = root.querySelector('.wf-detail');
        (0, vitest_1.expect)(detail.textContent).toContain('not available yet');
        (0, vitest_1.expect)(detail.querySelectorAll('button')).toHaveLength(0);
    });
    (0, vitest_1.it)('moves the selection highlight when another node is clicked', () => {
        const root = render();
        root.querySelector('[data-step-id=scope]').click();
        (0, vitest_1.expect)(root.querySelectorAll('.wf-node.selected')).toHaveLength(1);
        (0, vitest_1.expect)(root.querySelector('.wf-node.selected').getAttribute('data-step-id')).toBe('scope');
    });
    (0, vitest_1.it)('reports which step an action came from', () => {
        const seen = [];
        const root = render((stepId, actionId) => seen.push({ stepId, actionId }));
        root.querySelector('[data-step-id=scope]').click();
        root.querySelector('.wf-detail button').click();
        (0, vitest_1.expect)(seen).toEqual([{ stepId: 'scope', actionId: 'edit' }]);
    });
    (0, vitest_1.it)('collects the active step values on submit', () => {
        const seen = [];
        const root = render((_s, _a, values) => seen.push(values));
        root.querySelector('.wf-detail textarea').value = 'typed story';
        const buttons = root.querySelectorAll('.wf-detail button');
        buttons[1].click();
        (0, vitest_1.expect)(seen).toEqual([{ story: 'typed story' }]);
    });
});
