"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @vitest-environment jsdom
const vitest_1 = require("vitest");
const fields_1 = require("../../webview/render/fields");
(0, vitest_1.describe)('renderField', () => {
    (0, vitest_1.it)('renders a textarea for type textarea', () => {
        const el = (0, fields_1.renderField)({ id: 'q', type: 'textarea', label: 'Question' }, 'why');
        (0, vitest_1.expect)(el.querySelector('textarea').value).toBe('why');
    });
    (0, vitest_1.it)('renders one checkbox per option for multiselect', () => {
        const el = (0, fields_1.renderField)({
            id: 's',
            type: 'multiselect',
            label: 'Services',
            options: [
                { value: 'a', label: 'A' },
                { value: 'b', label: 'B' },
            ],
        }, ['a']);
        const boxes = el.querySelectorAll('input[type=checkbox]');
        (0, vitest_1.expect)(boxes).toHaveLength(2);
        (0, vitest_1.expect)(boxes[0].checked).toBe(true);
        (0, vitest_1.expect)(boxes[1].checked).toBe(false);
    });
    (0, vitest_1.it)('marks a required field', () => {
        const el = (0, fields_1.renderField)({ id: 'q', type: 'text', label: 'Q', required: true }, '');
        (0, vitest_1.expect)(el.querySelector('input').required).toBe(true);
    });
    (0, vitest_1.it)('shows an error message when present', () => {
        const el = (0, fields_1.renderField)({ id: 'q', type: 'text', label: 'Q' }, '', 'Q is required');
        (0, vitest_1.expect)(el.textContent).toContain('Q is required');
    });
    (0, vitest_1.it)('renders unknown-but-declared field types as text inputs', () => {
        const el = (0, fields_1.renderField)({ id: 'r', type: 'repo-picker', label: 'Repo' }, 'payments');
        (0, vitest_1.expect)(el.querySelector('input').value).toBe('payments');
    });
});
(0, vitest_1.describe)('collectValues', () => {
    (0, vitest_1.it)('round-trips a form through render and collect', () => {
        const root = document.createElement('div');
        const fields = [
            { id: 'q', type: 'text', label: 'Q' },
            {
                id: 's',
                type: 'multiselect',
                label: 'S',
                options: [
                    { value: 'a', label: 'A' },
                    { value: 'b', label: 'B' },
                ],
            },
            { id: 'ok', type: 'boolean', label: 'OK' },
        ];
        for (const f of fields) {
            root.append((0, fields_1.renderField)(f, f.id === 'q' ? 'why' : f.id === 's' ? ['b'] : true));
        }
        (0, vitest_1.expect)((0, fields_1.collectValues)(root, fields)).toEqual({ q: 'why', s: ['b'], ok: true });
    });
});
const descriptor = {
    protocolVersion: 1,
    task: { id: 'T', platform: 'p', epic: 'E', workflowLabel: 'Research Task' },
    progress: {
        index: 1,
        total: 2,
        steps: [
            { id: 'a', title: 'A', status: 'current' },
            { id: 'b', title: 'B', status: 'pending' },
        ],
    },
    step: {
        id: 'a',
        kind: 'form',
        title: 'A',
        values: {},
        fields: [{ id: 'q', type: 'text', label: 'Q' }],
        actions: [{ id: 'submit', label: 'Continue', primary: true }],
    },
};
(0, vitest_1.describe)('renderStep', () => {
    (0, vitest_1.it)('renders exactly the actions it is given', () => {
        const root = document.createElement('div');
        (0, fields_1.renderStep)(descriptor, root);
        (0, vitest_1.expect)([...root.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Continue']);
    });
    (0, vitest_1.it)('renders the progress list', () => {
        const root = document.createElement('div');
        (0, fields_1.renderStep)(descriptor, root);
        (0, vitest_1.expect)(root.querySelectorAll('[data-step-id]')).toHaveLength(2);
    });
    (0, vitest_1.it)('reports the action id and collected values on click', () => {
        const root = document.createElement('div');
        const seen = [];
        (0, fields_1.renderStep)(descriptor, root, (id, values) => seen.push({ id, values }));
        root.querySelector('input[name=q]').value = 'typed';
        root.querySelector('button').click();
        (0, vitest_1.expect)(seen).toEqual([{ id: 'submit', values: { q: 'typed' } }]);
    });
    (0, vitest_1.it)('clears previous content on re-render', () => {
        const root = document.createElement('div');
        (0, fields_1.renderStep)(descriptor, root);
        (0, fields_1.renderStep)(descriptor, root);
        (0, vitest_1.expect)(root.querySelectorAll('button')).toHaveLength(1);
    });
    (0, vitest_1.it)('renders step text when the handler supplies it', () => {
        const root = document.createElement('div');
        (0, fields_1.renderStep)({ ...descriptor, step: { ...descriptor.step, text: 'Explanatory copy' } }, root);
        (0, vitest_1.expect)(root.textContent).toContain('Explanatory copy');
    });
});
(0, vitest_1.describe)('the footer section', () => {
    const withFooter = {
        ...descriptor,
        step: { ...descriptor.step, values: { q: 'why', workDir: '/Users/you/work' } },
        footer: {
            title: 'Work directory',
            fields: [{ id: 'workDir', type: 'text', label: 'Where repositories are cloned' }],
            actions: [{ id: 'browse', label: 'Browse…' }],
        },
    };
    function render(onAction) {
        const root = document.createElement('div');
        (0, fields_1.renderStep)(withFooter, root, onAction);
        return root;
    }
    (0, vitest_1.it)('renders below the primary action, not among the fields', () => {
        const root = render();
        const order = [...root.children].map((n) => n.className);
        (0, vitest_1.expect)(order.indexOf('actions')).toBeLessThan(order.indexOf('step-footer'));
    });
    (0, vitest_1.it)('shows its title', () => {
        (0, vitest_1.expect)(render().querySelector('.step-footer-title').textContent).toBe('Work directory');
    });
    (0, vitest_1.it)('prefills its fields from the descriptor values', () => {
        const box = render().querySelector('.step-footer input[name=workDir]');
        (0, vitest_1.expect)(box.value).toBe('/Users/you/work');
    });
    (0, vitest_1.it)('renders its own actions', () => {
        const buttons = [...render().querySelectorAll('.step-footer button')].map((b) => b.textContent);
        (0, vitest_1.expect)(buttons).toEqual(['Browse…']);
    });
    (0, vitest_1.it)('sends footer values with a footer action', () => {
        const seen = [];
        const root = render((id, values) => seen.push({ id, values }));
        root.querySelector('.step-footer button').click();
        (0, vitest_1.expect)(seen).toEqual([{ id: 'browse', values: { q: 'why', workDir: '/Users/you/work' } }]);
    });
    (0, vitest_1.it)('sends footer values with the primary action too, so nothing is lost', () => {
        const seen = [];
        const root = render((_id, values) => seen.push(values));
        root.querySelector('.step-footer input[name=workDir]').value = '/srv/repos';
        root.querySelector('.actions button').click();
        (0, vitest_1.expect)(seen).toEqual([{ q: 'why', workDir: '/srv/repos' }]);
    });
    (0, vitest_1.it)('renders nothing extra when there is no footer', () => {
        const root = document.createElement('div');
        (0, fields_1.renderStep)(descriptor, root);
        (0, vitest_1.expect)(root.querySelector('.step-footer')).toBeNull();
    });
});
