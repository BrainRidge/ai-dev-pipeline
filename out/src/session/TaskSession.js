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
exports.TaskSession = void 0;
exports.tasksRoot = tasksRoot;
exports.workflowFilename = workflowFilename;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const vscode = __importStar(require("vscode"));
const AuditLog_1 = require("../audit/AuditLog");
const WebviewBridge_1 = require("../bridge/WebviewBridge");
const StepDescriptor_1 = require("../engine/StepDescriptor");
const WorkflowCatalog_1 = require("../engine/WorkflowCatalog");
const WorkflowEngine_1 = require("../engine/WorkflowEngine");
const schema_1 = require("../engine/schema");
const TaskStateStore_1 = require("../state/TaskStateStore");
const TaskWorkspace_1 = require("../workspace/TaskWorkspace");
const registry_1 = require("../tasks/registry");
const openFolders_1 = require("./openFolders");
const resume_1 = require("./resume");
const SetupSelection_1 = require("./SetupSelection");
const history_1 = require("../tasks/history");
const promptBlock_1 = require("../tasks/promptBlock");
function config(key) {
    return vscode.workspace.getConfiguration('aiDevWorkflow').get(key);
}
function tasksRoot() {
    return (0, resume_1.resolveTasksRoot)(config('tasksRoot'));
}
/** Workflows are versioned by filename: researchTaskWorkflow_1_0.json. */
function workflowFilename(id, version) {
    return `${id}_${version.replace('.', '_')}.json`;
}
class TaskSession {
    workflow;
    engine;
    registry;
    ctx;
    bridge;
    panel;
    audit;
    state;
    values = {};
    errors = {};
    outputPresent = false;
    outputFile;
    pendingMechanism;
    constructor(workflow, engine, registry, ctx, bridge, panel, audit, initialState) {
        this.workflow = workflow;
        this.engine = engine;
        this.registry = registry;
        this.ctx = ctx;
        this.bridge = bridge;
        this.panel = panel;
        this.audit = audit;
        this.state = initialState;
        this.bridge.onAction((msg) => {
            void this.handleAction(msg.stepId, msg.actionId, msg.values);
        });
    }
    // ---------------------------------------------------------------- lifecycle
    /** Prompt-driven entry, kept so the command palette still works. */
    static async start(context) {
        const catalog = await loadCatalog(context);
        const platform = await pick(catalog.platforms().map((p) => ({ label: p.label, id: p.id })), 'Select your platform');
        if (!platform)
            return undefined;
        const epic = await vscode.window.showInputBox({
            prompt: 'Epic key',
            placeHolder: 'PLAT-1234',
            validateInput: (v) => (v.trim().length === 0 ? 'An epic key is required' : undefined),
        });
        if (!epic)
            return undefined;
        const workflowId = await pick(catalog.all().map((w) => ({ label: w.label, id: w.id })), 'Select task type');
        if (!workflowId)
            return undefined;
        const featureStory = (0, SetupSelection_1.needsFeatureStory)(workflowId)
            ? await vscode.window.showInputBox({
                prompt: 'Feature story',
                placeHolder: 'PLAT-4821',
            })
            : '';
        if (featureStory === undefined)
            return undefined;
        const baseBranch = await vscode.window.showInputBox({
            prompt: 'Base branch to work from',
            placeHolder: 'develop',
            validateInput: (v) => (v.trim().length === 0 ? 'A base branch is required' : undefined),
        });
        if (!baseBranch)
            return undefined;
        const workDir = await vscode.window.showInputBox({
            prompt: 'Work directory — where repositories are cloned',
            value: (0, resume_1.resolveCodeRoot)(config('codeRoot')),
            validateInput: (v) => (0, SetupSelection_1.isAbsolutePath)(v.trim()) ? undefined : 'Enter a full path, such as /Users/you/work',
        });
        if (!workDir)
            return undefined;
        const services = await vscode.window.showQuickPick(catalog.microservices().map((s) => ({
            label: s.microserviceName,
            description: s.shortCode,
            detail: s.purpose,
            id: s.shortCode,
        })), { placeHolder: 'Select microservices', canPickMany: true });
        if (!services || services.length === 0)
            return undefined;
        const selection = (0, SetupSelection_1.normaliseSetup)({
            platform,
            epic: epic.trim(),
            workflowId,
            featureStory,
            baseBranch,
            workDir,
            services: services.map((s) => s.id),
        });
        const errors = (0, SetupSelection_1.validateSetup)(selection);
        if (Object.keys(errors).length > 0) {
            void vscode.window.showErrorMessage(Object.values(errors).join(' '));
            return undefined;
        }
        return TaskSession.startWith(context, selection);
    }
    /** Sidebar-driven entry: the task-level inputs are already chosen. */
    static async startWith(context, selection) {
        const catalog = await loadCatalog(context);
        const { platform, epic, workflowId } = selection;
        const workflow = catalog.get(workflowId);
        const source = await (0, promises_1.readFile)((0, node_path_1.join)(workflowsDir(context), workflowFilename(workflow.id, workflow.version)), 'utf8');
        const ws = await TaskWorkspace_1.TaskWorkspace.create({
            tasksRoot: tasksRoot(),
            epic,
            workflowId,
            platform,
            workflowJson: source,
        });
        const store = new TaskStateStore_1.TaskStateStore(ws.dir);
        // Task-level facts, readable by every step as {{task.<id>}} and recorded
        // once in the audit log. See spec Section 8.
        const inputs = {
            services: selection.services,
            taskType: workflowId,
            baseBranch: selection.baseBranch,
            workDir: selection.workDir,
        };
        if (selection.featureStory)
            inputs.featureStory = selection.featureStory;
        const state = {
            schemaVersion: 1,
            taskId: ws.taskId,
            workflowId,
            workflowVersion: workflow.version,
            platform,
            epic,
            currentStepId: workflow.initialStep,
            workflowHash: await ws.hashOfSnapshot(),
            inputs,
            steps: {},
        };
        await store.write(state);
        await new AuditLog_1.AuditLog(ws.dir).append({
            kind: 'task-started',
            data: { taskId: ws.taskId, workflowId, version: workflow.version, platform, epic, inputs },
        });
        const session = await TaskSession.open(context, ws, store, workflow, state);
        await openCopilotChatBeside();
        return session;
    }
    static async resume(context, taskId) {
        const dir = (0, node_path_1.join)(tasksRoot(), taskId);
        const store = new TaskStateStore_1.TaskStateStore(dir);
        if (!(await store.exists()))
            return undefined;
        const state = await store.read();
        const ws = await TaskWorkspace_1.TaskWorkspace.open(dir, taskId);
        // The task runs the definition it began with, not whatever ships today.
        const file = schema_1.workflowFileSchema.parse(JSON.parse(await ws.snapshotJson()));
        const workflow = (0, WorkflowCatalog_1.buildWorkflow)(state.workflowId, state.workflowVersion, file);
        // Detection, not prevention — see spec Section 7.
        if (!(await ws.verifySnapshot(state.workflowHash))) {
            await new AuditLog_1.AuditLog(dir).append({ kind: 'snapshot-modified', data: { taskId } });
            void vscode.window.showWarningMessage("This task's workflow definition has been modified since the task started. " +
                'Continuing with the modified version; the change has been recorded in the audit log.');
        }
        return TaskSession.open(context, ws, store, workflow, state);
    }
    static async open(context, ws, store, workflow, state) {
        const catalog = await loadCatalog(context);
        const platform = catalog.platforms().find((p) => p.id === state.platform) ?? {
            id: state.platform,
            label: state.platform,
        };
        const registry = (0, registry_1.buildTaskTypes)({
            promptDir: (0, node_path_1.join)(context.extensionPath, 'prompts'),
            taskDir: ws.dir,
            codeRoot: (0, resume_1.resolveCodeRoot)(config('codeRoot')),
        });
        // A snapshot can name a taskType this version no longer implements. Fail
        // here, with the list of what exists, rather than mid-workflow.
        registry.validateWorkflow(workflow.id, workflow.steps);
        const panel = vscode.window.createWebviewPanel('aiDevWorkflow', workflow.label, vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file((0, node_path_1.join)(context.extensionPath, 'out'))],
        });
        const bridge = new WebviewBridge_1.WebviewBridge(panel.webview);
        panel.onDidChangeViewState(() => {
            if (!panel.visible)
                bridge.resetReady();
        });
        const asset = (name) => panel.webview.asWebviewUri(vscode.Uri.file((0, node_path_1.join)(context.extensionPath, 'out', name)));
        panel.webview.html = bridge.html(asset('webview.js'), asset('style.css'), randomNonce());
        // ctx reads live state, so answersOf always reflects the latest transition.
        const holder = { state };
        const ctx = {
            platform,
            microservices: catalog.microservices(),
            taskDir: ws.dir,
            epic: state.epic,
            taskId: state.taskId,
            workflowId: workflow.id,
            inputs: state.inputs ?? {},
            order: workflow.order,
            answersOf: (id) => holder.state.steps[id]?.answers ?? {},
            resultOf: (id) => holder.state.steps[id]?.result ?? {},
        };
        const engine = new WorkflowEngine_1.WorkflowEngine(workflow, store, registry, ctx);
        const session = new TaskSession(workflow, engine, registry, ctx, bridge, panel, new AuditLog_1.AuditLog(ws.dir), state);
        // Keep the holder pointing at whatever the session last read.
        Object.defineProperty(holder, 'state', { get: () => session.state });
        session.watchOutput(context, ws.dir);
        context.subscriptions.push(panel);
        await session.refresh();
        return session;
    }
    // ------------------------------------------------------------------ actions
    async handleAction(stepId, actionId, values) {
        this.values = values;
        await this.audit.append({ kind: 'action', stepId, data: { actionId, values } });
        const step = this.workflow.steps[stepId];
        if (!step)
            return;
        if (actionId === 'edit') {
            await this.engine.edit(stepId);
            this.values = {};
            this.errors = {};
            await this.refresh();
            return;
        }
        // Throw the developer's rewrite away and show the generated prompt again.
        if (actionId === 'reset' && step.stepType === 'aiHandoff') {
            await this.engine.saveAnswers(stepId, { edited: {} });
            this.values = {};
            this.errors = {};
            await this.refresh();
            return;
        }
        // Copy / send-to-terminal on a step that plans commands. Neither advances
        // the workflow: they are affordances on the current step, not transitions.
        // Copy the prompt the panel is showing — the edited one, if it was edited.
        if (actionId === 'copy' && step.stepType === 'aiHandoff') {
            const task = this.registry.get(step.taskType);
            try {
                await this.rememberEdit(stepId, values);
                const { label } = await task.copyPrompt(step, this.ctx, (0, promptBlock_1.editedPrompt)(values));
                this.bridge.progress(stepId, `Copied ${label}.`);
            }
            catch (err) {
                this.bridge.error(stepId, `Could not compose the prompt: ${String(err)}`, true);
            }
            return;
        }
        if ((actionId === 'copy' || actionId === 'terminal') && step.stepType === 'commandExecution') {
            const task = this.registry.get(step.taskType);
            try {
                const { label } = await task.deliver(String(values.block ?? 'all'), actionId, this.ctx);
                this.bridge.progress(stepId, actionId === 'copy'
                    ? `Copied the commands for ${label}.`
                    : `Staged the commands for ${label} in the terminal — press Enter to run them.`);
            }
            catch (err) {
                this.bridge.error(stepId, `Could not deliver those commands: ${String(err)}`, true);
            }
            return;
        }
        if (actionId === 'send' && step.stepType === 'aiHandoff') {
            const task = this.registry.get(step.taskType);
            try {
                await this.rememberEdit(stepId, values);
                const { mechanism, outputPath } = await task.deliver(step, this.ctx, (0, promptBlock_1.editedPrompt)(values));
                this.pendingMechanism = mechanism;
                this.outputFile = outputPath ? (0, node_path_1.basename)(outputPath) : undefined;
                this.bridge.progress(stepId, this.outputFile
                    ? `Prompt delivered (mechanism ${mechanism}). Waiting for ${this.outputFile}…`
                    : `Prompt delivered (mechanism ${mechanism}).`);
            }
            catch (err) {
                this.bridge.error(stepId, `Could not deliver the prompt: ${String(err)}`, true);
            }
            return;
        }
        const submitted = step.stepType === 'aiHandoff' && actionId === 'done'
            ? {
                ...values,
                confirmed: true,
                outputPresent: this.outputPresent,
                outputFile: this.outputFile,
                mechanism: this.pendingMechanism,
            }
            : values;
        // An editing handoff declares no artifact, so it validates on `confirmed`
        // alone and ignores outputPresent entirely.
        const result = await this.engine.submit(stepId, actionId, submitted);
        this.errors = result.ok ? {} : result.errors;
        if (result.ok) {
            this.values = {};
            this.outputPresent = false;
            this.outputFile = undefined;
            this.pendingMechanism = undefined;
            await this.afterTransition();
        }
        await this.refresh();
    }
    /**
     * Copy and Send are the moments the developer has settled on their wording,
     * so the rewrite is written to the task state there and survives a reload.
     * Typing and then closing the panel without pressing anything still loses it:
     * persisting every keystroke would cost a round trip per character.
     */
    async rememberEdit(stepId, values) {
        if ((0, promptBlock_1.editedPrompt)(values) === undefined)
            return;
        await this.engine.saveAnswers(stepId, { edited: values.edited });
    }
    /** Generate and open the multi-root workspace once repos have been cloned. */
    async afterTransition() {
        this.state = await this.engine.state();
        // No step id: look across the whole workflow for whatever was cloned.
        const repos = (0, history_1.reposBefore)(this.ctx, '');
        if (repos.length === 0)
            return;
        // The generated workspace exists so Copilot can see repositories scattered
        // across unrelated folders. If this window already shows all of them, it
        // would buy nothing and cost a reload of a window already set up correctly.
        const openFolders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
        if ((0, openFolders_1.allInsideOpenFolders)(repos.map((r) => r.path), openFolders)) {
            await this.audit.append({
                kind: 'workspace-not-needed',
                data: { repos: repos.map((r) => r.path), openFolders },
            });
            this.bridge.progress(this.state.currentStepId, 'Your repositories are already open in this window, so no workspace was generated.');
            return;
        }
        const ws = await TaskWorkspace_1.TaskWorkspace.open(this.ctx.taskDir, this.ctx.taskId);
        const target = (0, node_path_1.join)(this.ctx.taskDir, `${this.ctx.taskId}.code-workspace`);
        // Written once. Reopening the panel after the reload must not re-prompt.
        if (await exists(target))
            return;
        const file = await ws.writeWorkspaceFile(repos);
        await this.audit.append({ kind: 'workspace-generated', data: { file } });
        const choice = await vscode.window.showInformationMessage('Repositories are ready. Open the generated workspace? The window will reload and the workflow will resume where it left off.', 'Open workspace', 'Not now');
        if (choice === 'Open workspace') {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(file), false);
        }
    }
    watchOutput(context, taskDir) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(taskDir), '*.md'));
        const onChanged = async (uri) => {
            const step = await this.engine.current();
            if (step.stepType !== 'aiHandoff')
                return;
            // Only a handoff contracted to write a file has something to watch for.
            const task = this.registry.get(step.taskType);
            const expected = await task.outputPath?.(step, this.ctx).catch(() => undefined);
            if (!expected || uri.fsPath !== expected)
                return;
            this.outputPresent = true;
            this.outputFile = (0, node_path_1.basename)(expected);
            await this.audit.append({ kind: 'output-detected', stepId: step.id });
            await this.refresh();
        };
        watcher.onDidCreate((u) => void onChanged(u));
        watcher.onDidChange((u) => void onChanged(u));
        context.subscriptions.push(watcher);
    }
    async refresh() {
        this.state = await this.engine.state();
        const step = await this.engine.current();
        const task = this.registry.get(step.taskType);
        if (step.stepType === 'manual') {
            await task.open(step, this.ctx).catch(() => {
                this.bridge.error(step.id, 'The artifact could not be opened.', true);
            });
        }
        this.bridge.render(await (0, StepDescriptor_1.buildWorkflowDescriptor)({
            workflow: this.workflow,
            state: this.state,
            registry: this.registry,
            ctx: this.ctx,
            values: this.values,
            errors: this.errors,
        }));
    }
    show() {
        this.panel.reveal();
    }
}
exports.TaskSession = TaskSession;
function workflowsDir(context) {
    return (0, node_path_1.join)(context.extensionPath, 'workflows');
}
function loadCatalog(context) {
    return WorkflowCatalog_1.WorkflowCatalog.load(workflowsDir(context), (0, node_path_1.join)(context.extensionPath, 'config'));
}
async function exists(path) {
    try {
        await (0, promises_1.access)(path);
        return true;
    }
    catch {
        return false;
    }
}
async function pick(items, placeHolder) {
    const chosen = await vscode.window.showQuickPick(items, { placeHolder });
    return chosen?.id;
}
/**
 * Pane 3. Copilot Chat is GitHub's own view — it cannot be embedded, only
 * positioned. We ask for it in the secondary side bar; the developer remains
 * free to move or close it, and if Copilot is not installed nothing happens.
 * See spec Section 9.
 */
async function openCopilotChatBeside() {
    const candidates = [
        'workbench.action.chat.openInSidebar',
        'workbench.action.chat.open',
        'workbench.panel.chat.view.copilot.focus',
    ];
    for (const command of candidates) {
        try {
            await vscode.commands.executeCommand(command);
            await vscode.commands.executeCommand('workbench.action.auxiliaryBar.expand').then(() => undefined, () => undefined);
            return;
        }
        catch {
            // try the next one
        }
    }
}
function randomNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 32; i++)
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
}
