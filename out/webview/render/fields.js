"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderField = renderField;
exports.collectValues = collectValues;
exports.renderWorkflow = renderWorkflow;
exports.renderStep = renderStep;
function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls)
        node.className = cls;
    if (text)
        node.textContent = text;
    return node;
}
function renderField(field, value, error) {
    const wrap = el('div', 'field');
    wrap.append(el('label', 'field-label', field.label));
    switch (field.type) {
        case 'textarea': {
            const t = el('textarea');
            t.name = field.id;
            t.value = String(value ?? '');
            t.required = Boolean(field.required);
            wrap.append(t);
            break;
        }
        case 'multiselect': {
            const selected = new Set(Array.isArray(value) ? value.map(String) : []);
            const options = field.options ?? [];
            // Type-to-filter. Selected options always stay visible, so filtering can
            // never hide a choice the developer has already made.
            const filter = el('input', 'option-filter');
            filter.type = 'text';
            filter.placeholder = 'type to filter…';
            filter.setAttribute('aria-label', `Filter ${field.label}`);
            const group = el('div', 'options');
            const lines = [];
            for (const opt of options) {
                const line = el('label', 'option');
                const box = el('input');
                box.type = 'checkbox';
                box.name = field.id;
                box.value = opt.value;
                box.checked = selected.has(opt.value);
                line.append(box, document.createTextNode(opt.label));
                group.append(line);
                lines.push({ line, label: opt.label.toLowerCase(), value: opt.value });
            }
            filter.addEventListener('input', () => {
                const q = filter.value.trim().toLowerCase();
                for (const { line, label, value: v } of lines) {
                    const box = line.querySelector('input');
                    const keep = q === '' || label.includes(q) || v.includes(q) || Boolean(box?.checked);
                    line.style.display = keep ? '' : 'none';
                }
            });
            if (options.length > 5)
                wrap.append(filter);
            wrap.append(group);
            break;
        }
        case 'select': {
            const s = el('select');
            s.name = field.id;
            for (const opt of field.options ?? []) {
                const o = el('option');
                o.value = opt.value;
                o.textContent = opt.label;
                o.selected = opt.value === value;
                s.append(o);
            }
            wrap.append(s);
            break;
        }
        case 'boolean': {
            const b = el('input');
            b.type = 'checkbox';
            b.name = field.id;
            b.checked = Boolean(value);
            wrap.append(b);
            break;
        }
        default: {
            const i = el('input');
            i.type = 'text';
            i.name = field.id;
            i.value = String(value ?? '');
            i.required = Boolean(field.required);
            wrap.append(i);
        }
    }
    if (error)
        wrap.append(el('div', 'field-error', error));
    return wrap;
}
function collectValues(root, fields) {
    const out = {};
    for (const f of fields) {
        if (f.type === 'multiselect') {
            out[f.id] = [
                ...root.querySelectorAll(`input[name="${f.id}"]:checked`),
            ].map((b) => b.value);
        }
        else if (f.type === 'boolean') {
            out[f.id] = root.querySelector(`input[name="${f.id}"]`)?.checked ?? false;
        }
        else {
            const node = root.querySelector(`[name="${f.id}"]`);
            out[f.id] = node?.value ?? '';
        }
    }
    return out;
}
/**
 * What the developer has typed into the editable blocks under `root`, keyed by
 * block id. The renderer names no block — the host reads back the id it sent.
 */
function editedText(root) {
    const edited = {};
    for (const area of root.querySelectorAll('textarea[data-block]')) {
        edited[area.dataset.block] = area.value;
    }
    return Object.keys(edited).length > 0 ? { edited } : {};
}
const MARK = { complete: '✓', current: '●', pending: '' };
function arrow() {
    const wrap = el('div', 'wf-connector');
    wrap.innerHTML =
        '<svg viewBox="0 0 44 12" preserveAspectRatio="none" aria-hidden="true">' +
            '<line x1="0" y1="6" x2="34" y2="6" stroke="currentColor" stroke-width="1.5"/>' +
            '<polygon points="34,1.5 43,6 34,10.5" fill="currentColor"/></svg>';
    return wrap;
}
function nodeEl(s) {
    const node = el('button', `wf-node ${s.status}`);
    node.type = 'button';
    node.setAttribute('data-step-id', s.id);
    node.setAttribute('aria-label', `Step ${s.index}: ${s.title}`);
    const top = el('div', 'wf-node-top');
    top.append(el('span', 'wf-node-index', String(s.index)));
    top.append(el('span', `badge badge-${s.badge.toLowerCase()}`, s.badge));
    if (MARK[s.status])
        top.append(el('span', 'wf-node-mark', MARK[s.status]));
    node.append(top);
    node.append(el('div', 'wf-node-title', s.title));
    if (s.summary)
        node.append(el('div', 'wf-node-summary', s.summary));
    return node;
}
/**
 * The middle pane: the workflow as a horizontal diagram, with a detail pane
 * below for the selected step. Selecting a node is a view concern handled
 * entirely in the webview — it never round-trips to the host.
 */
function renderWorkflow(d, root, onAction) {
    root.textContent = '';
    const header = el('header', 'task-header');
    header.append(el('h1', undefined, d.task.workflowLabel));
    header.append(el('p', 'task-meta', `${d.task.epic} · ${d.task.platform} · ${d.task.id}`));
    root.append(header);
    const canvas = el('div', 'wf-canvas');
    const nodes = new Map();
    d.steps.forEach((s, i) => {
        if (i > 0)
            canvas.append(arrow());
        const node = nodeEl(s);
        node.addEventListener('click', () => select(s.id));
        nodes.set(s.id, node);
        canvas.append(node);
    });
    root.append(canvas);
    const detail = el('section', 'wf-detail');
    root.append(detail);
    let selectedId = d.activeStepId;
    function select(id) {
        selectedId = id;
        for (const [nodeId, node] of nodes)
            node.classList.toggle('selected', nodeId === id);
        paintDetail();
    }
    function paintDetail() {
        detail.textContent = '';
        const s = d.steps.find((x) => x.id === selectedId);
        if (!s)
            return;
        const head = el('div', 'wf-detail-head');
        head.append(el('h2', undefined, `${s.index}. ${s.title}`));
        head.append(el('span', `badge badge-${s.badge.toLowerCase()}`, s.badge));
        detail.append(head);
        if (s.documentation)
            detail.append(el('p', 'wf-detail-doc', s.documentation));
        if (s.status === 'current') {
            const body = el('div', 'wf-detail-body');
            if (s.text)
                body.append(el('p', 'step-text', s.text));
            for (const f of s.fields ?? []) {
                body.append(renderField(f, (s.values ?? {})[f.id], s.errors?.[f.id]));
            }
            if (s.commands?.length)
                body.append(commandList(s, onAction));
            detail.append(body);
            detail.append(actionRow(s, 
            // Edited prompts travel with every action, so pressing Done persists
            // what the developer actually sent rather than what was generated.
            () => ({ ...collectValues(body, s.fields ?? []), ...editedText(body) }), onAction));
            return;
        }
        if (s.status === 'complete') {
            const body = el('div', 'wf-detail-body');
            if (s.answers?.length) {
                for (const a of s.answers) {
                    const row = el('div', 'wf-answer');
                    row.append(el('div', 'wf-answer-label', a.label));
                    row.append(el('div', 'wf-answer-value', a.value));
                    body.append(row);
                }
            }
            else {
                body.append(el('p', 'wf-detail-note', s.summary ?? 'Completed.'));
            }
            detail.append(body);
            detail.append(actionRow(s, () => ({}), onAction));
            return;
        }
        detail.append(el('p', 'wf-detail-note', 'This step is not available yet. Finish the steps before it.'));
    }
    select(selectedId);
    nodes.get(selectedId)?.scrollIntoView({ block: 'nearest', inline: 'center' });
}
/**
 * Commands the developer runs themselves. The renderer knows nothing about git
 * — it draws whatever lines arrive and reports which block was asked for. The
 * host owns the clipboard and the terminal, so this stays a view.
 */
function commandList(s, onAction) {
    const wrap = el('div', 'cmd-list');
    function button(label, action, block) {
        const b = el('button', 'cmd-button', label);
        b.type = 'button';
        b.addEventListener('click', () => onAction?.(s.id, action, { block, ...editedText(wrap) }));
        return b;
    }
    const blocks = s.commands ?? [];
    // The all-at-once shortcut only makes sense for several blocks sharing the
    // default actions; a single block that declares its own does not need it.
    if (blocks.length > 1 && blocks.every((b) => !b.actions)) {
        const toolbar = el('div', 'cmd-toolbar');
        toolbar.append(button('Copy all', 'copy', 'all'), button('Send all to terminal', 'terminal', 'all'));
        wrap.append(toolbar);
    }
    for (const block of blocks) {
        const box = el('div', 'cmd-block');
        box.setAttribute('data-block', block.id);
        const head = el('div', 'cmd-head');
        head.append(el('span', 'cmd-label', block.label));
        const actions = block.actions ?? [
            { id: 'copy', label: 'Copy' },
            { id: 'terminal', label: '\u2192 Terminal' },
        ];
        for (const a of actions)
            head.append(button(a.label, a.id, block.id));
        box.append(head);
        if (block.editable) {
            const area = el('textarea', 'cmd-lines cmd-editable');
            area.value = block.lines.join('\n');
            area.dataset.block = block.id;
            area.setAttribute('aria-label', block.label);
            area.rows = Math.min(24, Math.max(8, block.lines.length));
            box.append(area);
        }
        else {
            box.append(el('pre', 'cmd-lines', block.lines.join('\n')));
        }
        wrap.append(box);
    }
    return wrap;
}
function actionRow(s, values, onAction) {
    const row = el('div', 'actions');
    for (const a of s.actions ?? []) {
        const b = el('button', a.primary ? 'primary' : undefined, a.label);
        b.addEventListener('click', () => onAction?.(s.id, a.id, values()));
        row.append(b);
    }
    return row;
}
// ───────────────────────────────────────────────── single-step view (sidebar)
function renderStep(d, root, onAction) {
    root.textContent = '';
    const header = el('header', 'task-header');
    header.append(el('h1', undefined, d.step.title));
    header.append(el('p', 'task-meta', `${d.task.workflowLabel} · ${d.task.epic} · step ${d.progress.index} of ${d.progress.total}`));
    root.append(header);
    const nav = el('ol', 'progress');
    for (const s of d.progress.steps) {
        const li = el('li', `progress-item ${s.status}`, s.title);
        li.setAttribute('data-step-id', s.id);
        nav.append(li);
    }
    root.append(nav);
    const body = el('div', 'step-body');
    if (d.step.text)
        body.append(el('p', 'step-text', d.step.text));
    for (const f of d.step.fields ?? []) {
        body.append(renderField(f, d.step.values[f.id], d.step.errors?.[f.id]));
    }
    root.append(body);
    // Built up front so collect() can read it, appended after the actions row.
    const footer = d.footer ? el('section', 'step-footer') : undefined;
    const actions = el('div', 'actions');
    for (const a of d.step.actions) {
        const b = el('button', a.primary ? 'primary' : undefined, a.label);
        b.addEventListener('click', () => onAction?.(a.id, collect()));
        actions.append(b);
    }
    root.append(actions);
    if (!d.footer || !footer)
        return;
    if (d.footer.title)
        footer.append(el('h2', 'step-footer-title', d.footer.title));
    const footerBody = el('div', 'step-footer-body');
    for (const f of d.footer.fields) {
        footerBody.append(renderField(f, d.step.values[f.id], d.step.errors?.[f.id]));
    }
    footer.append(footerBody);
    const footerActions = el('div', 'actions');
    for (const a of d.footer.actions) {
        const b = el('button', a.primary ? 'primary' : undefined, a.label);
        b.addEventListener('click', () => onAction?.(a.id, collect()));
        footerActions.append(b);
    }
    footer.append(footerActions);
    root.append(footer);
    function collect() {
        return {
            ...collectValues(body, d.step.fields ?? []),
            // Footer values travel with every action, so the host always sees the
            // whole form regardless of which button was pressed.
            ...(footer ? collectValues(footer, d.footer?.fields ?? []) : {}),
        };
    }
}
