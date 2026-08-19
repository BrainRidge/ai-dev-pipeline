"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fields_1 = require("./render/fields");
const vscode = acquireVsCodeApi();
const root = document.getElementById('root');
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'render' && msg.descriptor) {
        const fields = msg.descriptor.step.fields ?? [];
        (0, fields_1.renderStep)(msg.descriptor, root, (actionId, values) => vscode.postMessage({ type: 'action', stepId: 'setup', actionId, values }));
        // Any choice can change which fields the form offers next — a task type
        // that wants a story key, a mode that shows saved tasks instead. The
        // renderer does not know which; it just tells the host a choice was made.
        for (const select of root.querySelectorAll('select[name]')) {
            select.addEventListener('change', () => vscode.postMessage({
                type: 'action',
                stepId: 'setup',
                actionId: 'refresh',
                values: (0, fields_1.collectValues)(root, fields),
            }));
        }
        return;
    }
    if (msg.type === 'error') {
        const box = document.createElement('div');
        box.className = 'error-box';
        box.textContent = String(msg.message);
        root.prepend(box);
    }
});
vscode.postMessage({ type: 'ready' });
