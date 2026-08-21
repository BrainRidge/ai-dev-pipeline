"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @vitest-environment jsdom
const vitest_1 = require("vitest");
const fields_1 = require("../../webview/render/fields");
(0, vitest_1.beforeAll)(() => {
    Element.prototype.scrollIntoView = () => { };
});
const descriptor = {
    protocolVersion: 2,
    task: { id: 'T', platform: 'canada-assisted', epic: 'PLAT-1234', workflowLabel: 'New Feature' },
    activeStepId: 'gitClone',
    steps: [
        {
            id: 'gitClone',
            index: 1,
            title: 'Get the code',
            stepType: 'commandExecution',
            badge: 'COMMAND',
            status: 'current',
            text: 'Run these in a terminal, then mark the step done.',
            commands: [
                {
                    id: 'pis',
                    label: 'party-service (pis)',
                    note: 'Template: /team/prompts/w/s.md (external)',
                    lines: ['git clone https://x/party-service /code/pis', 'cd /code/pis', 'git pull'],
                },
                { id: 'ris', label: 'reference-data-service (ris)', lines: ['cd /code/ris', 'git pull'] },
            ],
            actions: [
                { id: 'back', label: 'Back' },
                { id: 'submit', label: 'I have run these', primary: true },
            ],
        },
    ],
};
function render(onAction) {
    const root = document.createElement('div');
    (0, fields_1.renderWorkflow)(descriptor, root, onAction);
    return root;
}
(0, vitest_1.describe)('command blocks', () => {
    (0, vitest_1.it)('draws one block per microservice', () => {
        (0, vitest_1.expect)(render().querySelectorAll('.cmd-block')).toHaveLength(2);
    });
    (0, vitest_1.it)('labels each block so you know which repo it is', () => {
        const labels = [...render().querySelectorAll('.cmd-label')].map((n) => n.textContent);
        (0, vitest_1.expect)(labels).toEqual(['party-service (pis)', 'reference-data-service (ris)']);
    });
    (0, vitest_1.it)('shows the commands verbatim, one per line', () => {
        const pre = render().querySelector('.cmd-block[data-block=pis] pre');
        (0, vitest_1.expect)(pre.textContent).toBe('git clone https://x/party-service /code/pis\ncd /code/pis\ngit pull');
    });
    (0, vitest_1.it)('offers Copy and Terminal for each block', () => {
        const buttons = [
            ...render().querySelectorAll('.cmd-block[data-block=pis] button'),
        ].map((b) => b.textContent);
        (0, vitest_1.expect)(buttons).toEqual(['Copy', '→ Terminal']);
    });
    (0, vitest_1.it)('offers an all-repositories shortcut above them', () => {
        const buttons = [...render().querySelectorAll('.cmd-toolbar button')].map((b) => b.textContent);
        (0, vitest_1.expect)(buttons).toEqual(['Copy all', 'Send all to terminal']);
    });
    (0, vitest_1.it)('reports which block was copied', () => {
        const seen = [];
        const root = render((_s, actionId, values) => seen.push({ actionId, values }));
        root.querySelector('.cmd-block[data-block=ris] button').click();
        (0, vitest_1.expect)(seen).toEqual([{ actionId: 'copy', values: { block: 'ris' } }]);
    });
    (0, vitest_1.it)('reports a terminal request separately from a copy', () => {
        const seen = [];
        const root = render((_s, actionId) => seen.push(actionId));
        const buttons = root.querySelectorAll('.cmd-block[data-block=pis] button');
        buttons[1].click();
        (0, vitest_1.expect)(seen).toEqual(['terminal']);
    });
    (0, vitest_1.it)('addresses the whole plan as "all"', () => {
        const seen = [];
        const root = render((_s, actionId, values) => seen.push({ actionId, values }));
        root.querySelector('.cmd-toolbar button').click();
        (0, vitest_1.expect)(seen).toEqual([{ actionId: 'copy', values: { block: 'all' } }]);
    });
    (0, vitest_1.it)('keeps the step actions working alongside the command buttons', () => {
        const seen = [];
        const root = render((_s, actionId) => seen.push(actionId));
        const actions = root.querySelectorAll('.wf-detail .actions button');
        (0, vitest_1.expect)([...actions].map((b) => b.textContent)).toEqual(['Back', 'I have run these']);
        actions[1].click();
        (0, vitest_1.expect)(seen).toEqual(['submit']);
    });
    (0, vitest_1.it)('draws nothing when a step has no commands', () => {
        const bare = {
            ...descriptor,
            steps: [{ ...descriptor.steps[0], commands: undefined }],
        };
        const root = document.createElement('div');
        (0, fields_1.renderWorkflow)(bare, root);
        (0, vitest_1.expect)(root.querySelectorAll('.cmd-block')).toHaveLength(0);
        (0, vitest_1.expect)(root.querySelector('.cmd-toolbar')).toBeNull();
    });
});
(0, vitest_1.describe)('a block that declares its own actions', () => {
    const promptStep = {
        ...descriptor,
        steps: [
            {
                ...descriptor.steps[0],
                stepType: 'aiHandoff',
                badge: 'COPILOT',
                commands: [
                    {
                        id: 'prompt',
                        label: 'Composed prompt',
                        lines: ['You are planning a new feature…', 'Platform: canada-assisted.'],
                        actions: [
                            { id: 'copy', label: 'Copy' },
                            { id: 'send', label: 'Send to Copilot' },
                        ],
                    },
                ],
            },
        ],
    };
    function render(onAction) {
        const root = document.createElement('div');
        (0, fields_1.renderWorkflow)(promptStep, root, onAction);
        return root;
    }
    (0, vitest_1.it)('renders the declared actions instead of the defaults', () => {
        const buttons = [...render().querySelectorAll('.cmd-block button')].map((b) => b.textContent);
        (0, vitest_1.expect)(buttons).toEqual(['Copy', 'Send to Copilot']);
    });
    (0, vitest_1.it)('offers no Terminal button, which makes no sense for a prompt', () => {
        (0, vitest_1.expect)(render().textContent).not.toContain('Terminal');
    });
    (0, vitest_1.it)('drops the all-at-once toolbar, since there is one block with its own actions', () => {
        (0, vitest_1.expect)(render().querySelector('.cmd-toolbar')).toBeNull();
    });
    (0, vitest_1.it)('reports the declared action id', () => {
        const seen = [];
        const root = render((_s, actionId) => seen.push(actionId));
        root.querySelectorAll('.cmd-block button')[1].click();
        (0, vitest_1.expect)(seen).toEqual(['send']);
    });
    (0, vitest_1.it)('shows the prompt text verbatim', () => {
        (0, vitest_1.expect)(render().querySelector('.cmd-block pre').textContent).toBe('You are planning a new feature…\nPlatform: canada-assisted.');
    });
});
(0, vitest_1.describe)('an editable block', () => {
    const editableStep = {
        ...descriptor,
        steps: [
            {
                ...descriptor.steps[0],
                stepType: 'aiHandoff',
                badge: 'COPILOT',
                commands: [
                    {
                        id: 'prompt',
                        label: 'Composed prompt',
                        lines: ['You are planning a new feature…', 'Platform: canada-assisted.'],
                        editable: true,
                        actions: [
                            { id: 'copy', label: 'Copy' },
                            { id: 'send', label: 'Send to Copilot' },
                            { id: 'reset', label: 'Reset' },
                        ],
                    },
                ],
                actions: [{ id: 'done', label: 'Done', primary: true }],
            },
        ],
    };
    function render(onAction) {
        const root = document.createElement('div');
        (0, fields_1.renderWorkflow)(editableStep, root, onAction);
        return root;
    }
    (0, vitest_1.it)('draws a textarea rather than a read-only block', () => {
        const root = render();
        (0, vitest_1.expect)(root.querySelector('.cmd-block pre')).toBeNull();
        const area = root.querySelector('.cmd-block textarea');
        (0, vitest_1.expect)(area.value).toBe('You are planning a new feature…\nPlatform: canada-assisted.');
    });
    (0, vitest_1.it)('sends the edited text with the block action, not the generated text', () => {
        const seen = [];
        const root = render((_s, actionId, values) => seen.push({ actionId, values }));
        root.querySelector('.cmd-block textarea').value = 'MY OWN PROMPT';
        root.querySelectorAll('.cmd-block button')[1].click();
        (0, vitest_1.expect)(seen).toEqual([
            { actionId: 'send', values: { block: 'prompt', edited: { prompt: 'MY OWN PROMPT' } } },
        ]);
    });
    (0, vitest_1.it)('carries the edited text on the step action too, so Done can persist it', () => {
        const seen = [];
        const root = render((_s, _a, values) => seen.push(values));
        root.querySelector('.cmd-block textarea').value = 'EDITED';
        root.querySelector('.wf-detail .actions button').click();
        (0, vitest_1.expect)(seen).toEqual([{ edited: { prompt: 'EDITED' } }]);
    });
    (0, vitest_1.it)('leaves a read-only block alone, so command steps are unaffected', () => {
        const seen = [];
        const root = document.createElement('div');
        (0, fields_1.renderWorkflow)(descriptor, root, (_s, _a, values) => seen.push(values));
        root.querySelector('.wf-detail .actions button').click();
        (0, vitest_1.expect)(seen).toEqual([{}]);
    });
});
(0, vitest_1.describe)('a block with a note', () => {
    (0, vitest_1.it)('draws the note for the block that has one', () => {
        const note = render().querySelector('.cmd-block[data-block=pis] .cmd-note');
        (0, vitest_1.expect)(note?.textContent).toBe('Template: /team/prompts/w/s.md (external)');
    });
    (0, vitest_1.it)('draws no note element for a block without one', () => {
        (0, vitest_1.expect)(render().querySelector('.cmd-block[data-block=ris] .cmd-note')).toBeNull();
    });
});
