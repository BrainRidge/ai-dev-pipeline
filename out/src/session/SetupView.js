"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupView = void 0;
const node_path_1 = require("node:path");
const vscode = __importStar(require("vscode"));
const WorkflowCatalog_1 = require("../engine/WorkflowCatalog");
const setupDescriptor_1 = require("./setupDescriptor");
const resume_1 = require("./resume");
const taskIndex_1 = require("./taskIndex");
const TaskSession_1 = require("./TaskSession");
const StepDescriptor_1 = require("../engine/StepDescriptor");
const WebviewBridge_1 = require("../bridge/WebviewBridge");
const SetupSelection_1 = require("./SetupSelection");
/**
 * The left pane. Collects the task-level facts that feed the workflow —
 * platform, epic, task type and microservices — then hands them to the caller,
 * which creates the task and opens the middle pane. It also offers the saved
 * tasks that still have work in them, so continuing one does not mean
 * remembering its id and going through the command palette.
 */
class SetupView {
    context;
    onStart;
    onResume;
    static viewId = 'aiDevWorkflow.setup';
    bridge;
    values = {};
    errors = {};
    constructor(context, onStart, onResume) {
        this.context = context;
        this.onStart = onStart;
        this.onResume = onResume;
    }
    async resolveWebviewView(view) {
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file((0, node_path_1.join)(this.context.extensionPath, 'out'))],
        };
        const script = view.webview.asWebviewUri(vscode.Uri.file((0, node_path_1.join)(this.context.extensionPath, 'out', 'setup.js')));
        view.webview.html = html(script.toString());
        // Same seam as the workflow panel — one place that talks to a webview.
        this.bridge = new WebviewBridge_1.WebviewBridge(view.webview);
        this.bridge.onAction(({ actionId, values }) => {
            void this.onAction(actionId, values);
        });
        view.onDidChangeVisibility(() => {
            if (!view.visible)
                this.bridge?.resetReady();
        });
        await this.render();
    }
    /** Redraw, for when a setting changes underneath the pane. */
    async refresh() {
        await this.render();
    }
    async onAction(actionId, values) {
        // Merged, not replaced: the form only reports the fields it is currently
        // showing, and switching modes must not throw away what has been typed.
        this.values = { ...this.values, ...values };
        // Changing the task type can change which fields the form offers, so the
        // host redraws it. The renderer never decides which workflow needs what.
        if (actionId === 'refresh') {
            // A different choice is a fresh attempt; errors from the last one would
            // otherwise sit under fields the developer has since moved away from.
            this.errors = {};
            await this.render();
            return;
        }
        if (actionId === 'browse') {
            await this.browse();
            return;
        }
        if (actionId === 'open') {
            await this.open();
            return;
        }
        if (actionId === 'openSettings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiDevWorkflow.contentRoot');
            return;
        }
        if (actionId === 'start')
            await this.start();
    }
    mode() {
        return this.values.mode === 'existing' ? 'existing' : 'new';
    }
    /** Reopen a saved task at the step it stopped on. */
    async open() {
        const taskId = String(this.values.existingTask ?? '').trim();
        if (!taskId) {
            this.errors.existingTask = 'Select a task to continue';
            await this.render();
            return;
        }
        this.errors = {};
        try {
            await this.onResume(taskId);
        }
        catch (err) {
            this.errors.existingTask = `Could not open ${taskId}: ${String(err)}`;
            await this.render();
        }
    }
    /** The native folder picker: paths are long and a typo clones somewhere silently wrong. */
    async browse() {
        const current = String(this.values.workDir ?? '').trim();
        const chosen = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Use as work directory',
            defaultUri: current ? vscode.Uri.file(current) : undefined,
        });
        if (!chosen?.[0])
            return;
        this.values.workDir = chosen[0].fsPath;
        delete this.errors.workDir;
        await this.render();
    }
    async start() {
        const selection = (0, SetupSelection_1.normaliseSetup)(this.selection());
        this.errors = (0, SetupSelection_1.validateSetup)(selection);
        if (Object.keys(this.errors).length > 0) {
            await this.render();
            return;
        }
        // Remembered for next time. The task keeps the value it started with, so
        // changing this later never moves a running task's repositories.
        await vscode.workspace
            .getConfiguration('aiDevWorkflow')
            .update('codeRoot', selection.workDir, vscode.ConfigurationTarget.Global);
        try {
            await this.onStart(selection);
        }
        catch (err) {
            this.errors.platform = `Could not start task: ${String(err)}`;
            await this.render();
        }
    }
    selection() {
        return {
            platform: String(this.values.platform ?? ''),
            epic: String(this.values.epic ?? ''),
            workflowId: String(this.values.workflowId ?? ''),
            featureStory: String(this.values.featureStory ?? ''),
            baseBranch: String(this.values.baseBranch ?? ''),
            workDir: String(this.values.workDir ?? ''),
            services: Array.isArray(this.values.services) ? this.values.services.map(String) : [],
        };
    }
    async render() {
        if (!this.bridge)
            return;
        const resolved = (0, TaskSession_1.resolvedContent)();
        if (!resolved.ok) {
            this.bridge.render((0, setupDescriptor_1.unconfiguredDescriptor)(resolved.message));
            return;
        }
        let catalog;
        try {
            catalog = await WorkflowCatalog_1.WorkflowCatalog.load((0, node_path_1.join)(this.context.extensionPath, 'workflows'), {
                platformConfig: resolved.platformConfig,
                microserviceConfig: resolved.microserviceConfig,
            });
        }
        catch (err) {
            // A missing file, malformed JSON, a duplicate shortCode. The loader's own
            // wording is the most useful thing here, so it is shown as it comes.
            this.bridge.render((0, setupDescriptor_1.unconfiguredDescriptor)(err instanceof Error ? err.message : String(err)));
            return;
        }
        const modeField = {
            id: 'mode',
            type: 'select',
            label: 'Task',
            options: [
                { value: 'new', label: 'New task' },
                { value: 'existing', label: 'Continue an existing task' },
            ],
        };
        this.bridge.render(this.mode() === 'existing'
            ? await this.existingDescriptor(catalog, modeField)
            : this.newDescriptor(catalog, modeField));
    }
    /**
     * The saved tasks that still have work in them. Finished tasks are left out:
     * this list exists to answer "where was I", and a folder of everything ever
     * started answers nothing. They remain reachable through the Resume Task
     * command.
     */
    async existingDescriptor(catalog, modeField) {
        const tasks = await (0, taskIndex_1.listUnfinishedTasks)((0, TaskSession_1.tasksRoot)());
        const labelOf = (id) => catalog.all().find((w) => w.id === id)?.label;
        const chosen = String(this.values.existingTask ?? '');
        const selected = tasks.some((t) => t.taskId === chosen) ? chosen : (tasks[0]?.taskId ?? '');
        const fields = [modeField];
        if (tasks.length > 0) {
            fields.push({
                id: 'existingTask',
                type: 'select',
                label: 'Task to continue',
                options: tasks.map((t) => ({
                    value: t.taskId,
                    label: (0, taskIndex_1.taskLabel)(t, labelOf(t.workflowId)),
                })),
            });
        }
        return {
            protocolVersion: StepDescriptor_1.PROTOCOL_VERSION,
            task: { id: '', platform: '', epic: '', workflowLabel: 'Task setup' },
            progress: { index: 0, total: 0, steps: [] },
            step: {
                id: 'setup',
                kind: 'form',
                title: 'Continue a task',
                fields,
                text: tasks.length > 0
                    ? 'Unfinished tasks, most recent first. Opening one picks it up at the step it stopped on.'
                    : 'No unfinished tasks saved yet. Switch to New task to start one.',
                values: { ...this.values, mode: 'existing', existingTask: selected },
                errors: Object.keys(this.errors).length > 0 ? this.errors : undefined,
                actions: tasks.length > 0 ? [{ id: 'open', label: 'Open task', primary: true }] : [],
            },
        };
    }
    newDescriptor(catalog, modeField) {
        const platforms = catalog.platforms();
        const workflows = catalog.all();
        const selectedPlatform = String(this.values.platform ?? platforms[0]?.id ?? '');
        const selectedWorkflow = String(this.values.workflowId ?? workflows[0]?.id ?? '');
        const fields = [
            modeField,
            {
                id: 'platform',
                type: 'select',
                label: 'Platform',
                options: platforms.map((p) => ({ value: p.id, label: p.label })),
            },
            { id: 'epic', type: 'text', label: 'Epic', required: true },
            {
                id: 'workflowId',
                type: 'select',
                label: 'Task type',
                options: workflows.map((w) => ({ value: w.id, label: w.label })),
            },
        ];
        if ((0, SetupSelection_1.needsFeatureStory)(selectedWorkflow)) {
            fields.push({
                id: 'featureStory',
                type: 'text',
                label: 'Feature story',
                required: true,
            });
        }
        fields.push({ id: 'baseBranch', type: 'text', label: 'Base branch', required: true }, 
        // Platform is recorded context, not a filter: the catalogue is one list.
        // The renderer grows a type-to-filter box over it past five options.
        {
            id: 'services',
            type: 'multiselect',
            label: 'Microservices',
            required: true,
            options: catalog
                .microservices()
                .map((s) => ({ value: s.shortCode, label: `${s.microserviceName} (${s.shortCode})` })),
        });
        // Prefilled from the setting, so it is set once and remembered.
        const workDir = String(this.values.workDir ?? (0, resume_1.resolveCodeRoot)(configuredCodeRoot()));
        return {
            protocolVersion: StepDescriptor_1.PROTOCOL_VERSION,
            task: { id: '', platform: selectedPlatform, epic: '', workflowLabel: 'Task setup' },
            progress: { index: 0, total: 0, steps: [] },
            step: {
                id: 'setup',
                kind: 'form',
                title: 'Task setup',
                fields,
                values: {
                    ...this.values,
                    mode: 'new',
                    platform: selectedPlatform,
                    workflowId: selectedWorkflow,
                    workDir,
                },
                errors: Object.keys(this.errors).length > 0 ? this.errors : undefined,
                actions: [{ id: 'start', label: 'Start task', primary: true }],
            },
            footer: {
                title: 'Work directory',
                fields: [
                    { id: 'workDir', type: 'text', label: 'Where repositories are cloned', required: true },
                ],
                actions: [{ id: 'browse', label: 'Browse\u2026' }],
            },
        };
    }
}
exports.SetupView = SetupView;
function configuredCodeRoot() {
    return vscode.workspace.getConfiguration('aiDevWorkflow').get('codeRoot');
}
function html(scriptUri) {
    const nonce = Math.random().toString(36).slice(2);
    return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:.75rem;font-size:var(--vscode-font-size)}
h1{font-size:1rem;margin:0 0 .5rem}
.step-text{margin:0 0 .75rem;color:var(--vscode-descriptionForeground);font-size:.9em}
.task-meta,.progress{display:none}
.field{margin:.75rem 0;display:flex;flex-direction:column;gap:.25rem}
.field-label{font-weight:600;font-size:.9em}
.options{display:flex;flex-direction:column;gap:.15rem;max-height:14rem;overflow-y:auto}
.option{display:flex;align-items:center;gap:.4rem;font-weight:400}
input[type=text],select,.option-filter{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);padding:.3rem;font:inherit;width:100%;box-sizing:border-box}
.option-filter{margin-bottom:.25rem}
.field-error{color:var(--vscode-inputValidation-errorForeground,#f88);font-size:.85em}
.error-box{padding:.4rem;margin-bottom:.5rem;background:var(--vscode-inputValidation-errorBackground,#522)}
.actions{margin-top:1rem;display:flex;gap:.4rem}
.step-footer{margin-top:1.5rem;padding-top:.75rem;border-top:1px solid var(--vscode-panel-border,#333)}
.step-footer-title{font-size:.9rem;margin:0;font-weight:600}
.step-footer .actions{margin-top:.5rem}
.step-footer button{width:auto;padding:.3rem .75rem;background:var(--vscode-button-secondaryBackground,rgba(127,127,127,.2));color:var(--vscode-button-secondaryForeground,inherit)}
button{font:inherit;padding:.4rem 1rem;cursor:pointer;border:none;width:100%;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
</style></head><body><div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
