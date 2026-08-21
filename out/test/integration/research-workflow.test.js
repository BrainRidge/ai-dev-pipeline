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
const assert = __importStar(require("node:assert"));
const node_path_1 = require("node:path");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const vscode = __importStar(require("vscode"));
const TaskWorkspace_1 = require("../../src/workspace/TaskWorkspace");
const TaskStateStore_1 = require("../../src/state/TaskStateStore");
const SOURCE = JSON.stringify({ schemaVersion: 1, label: 'R', initialStep: 'a', steps: {} });
/**
 * Polls a condition rather than sleeping for a guessed interval.
 * `onDidChangeConfiguration` is asynchronous and the write it triggers touches
 * several settings in sequence, so the only safe thing to wait on is the state
 * the assertions actually need.
 */
async function waitFor(done, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!done() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
    }
}
suite('research workflow', () => {
    test('the extension activates and registers its commands', async () => {
        // Activation is onStartupFinished, which can land after this suite starts.
        await vscode.extensions.getExtension('internal.ai-dev-workflow')?.activate();
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('aiDevWorkflow.startTask'));
        assert.ok(commands.includes('aiDevWorkflow.resumeTask'));
    });
    test('a generated workspace file carries the taskId breadcrumb', async () => {
        const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'e2e-'));
        const ws = await TaskWorkspace_1.TaskWorkspace.create({
            tasksRoot: root,
            epic: 'PLAT-1',
            workflowId: 'research',
            platform: 'canada-assisted',
            workflowJson: SOURCE,
        });
        const file = await ws.writeWorkspaceFile([{ name: 'payments', path: '/code/payments' }]);
        const parsed = JSON.parse(await (0, promises_1.readFile)(file, 'utf8'));
        assert.strictEqual(parsed.settings['aiDevWorkflow.taskId'], ws.taskId);
        assert.strictEqual(parsed.folders.length, 2);
    });
    test('state survives a simulated extension-host restart', async () => {
        const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'e2e-'));
        const ws = await TaskWorkspace_1.TaskWorkspace.create({
            tasksRoot: root,
            epic: 'PLAT-2',
            workflowId: 'research',
            platform: 'canada-assisted',
            workflowJson: SOURCE,
        });
        const store = new TaskStateStore_1.TaskStateStore(ws.dir);
        await store.write({
            schemaVersion: 1,
            taskId: ws.taskId,
            workflowId: 'research',
            workflowVersion: '1.0',
            platform: 'canada-assisted',
            epic: 'PLAT-2',
            currentStepId: 'context',
            workflowHash: await ws.hashOfSnapshot(),
            inputs: { services: ['pis'] },
            steps: { requirement: { status: 'complete', answers: { question: 'why' } } },
        });
        // A fresh store instance stands in for a restarted host.
        const state = await new TaskStateStore_1.TaskStateStore(ws.dir).read();
        assert.strictEqual(state.currentStepId, 'context');
        assert.strictEqual(state.steps.requirement?.answers?.question, 'why');
    });
    test('snapshot tampering is detected', async () => {
        const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'e2e-'));
        const ws = await TaskWorkspace_1.TaskWorkspace.create({
            tasksRoot: root,
            epic: 'PLAT-3',
            workflowId: 'research',
            platform: 'canada-assisted',
            workflowJson: SOURCE,
        });
        const original = await ws.hashOfSnapshot();
        await (0, promises_1.writeFile)((0, node_path_1.join)(ws.dir, '.engine', 'workflow.json'), '{"tampered":true}');
        assert.strictEqual(await ws.verifySnapshot(original), false);
    });
    test('the bundled workflow and the content template ship inside the extension', async () => {
        const ext = vscode.extensions.getExtension('internal.ai-dev-workflow');
        assert.ok(ext, 'extension not found');
        const workflow = JSON.parse(await (0, promises_1.readFile)((0, node_path_1.join)(ext.extensionPath, 'workflows', 'researchTaskWorkflow_1_0.json'), 'utf8'));
        // Every workflow opens on the machine check. See spec Section 17.
        assert.strictEqual(workflow.initialStep, 'systemCheck');
        // Prompts still ship: they are the per-file fallback for any template a
        // team has not supplied. See spec Section 16.
        const prompt = await (0, promises_1.readFile)((0, node_path_1.join)(ext.extensionPath, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'), 'utf8');
        assert.ok(prompt.includes('output:'), 'the bundled template declares its artifact');
        // Config does not ship. The template a team copies does.
        const services = JSON.parse(await (0, promises_1.readFile)((0, node_path_1.join)(ext.extensionPath, 'examples', 'content-template', 'config', 'microservices.json'), 'utf8'));
        assert.ok(Array.isArray(services) && services.length > 0);
        // The tool list a team copies to decide what System Check looks for. The
        // extension's own default is a constant, not this file. See Section 17.
        const tools = JSON.parse(await (0, promises_1.readFile)((0, node_path_1.join)(ext.extensionPath, 'examples', 'content-template', 'config', 'tools.json'), 'utf8'));
        assert.ok(Array.isArray(tools) && tools.some((t) => t.id === 'git'));
        await assert.rejects((0, promises_1.readFile)((0, node_path_1.join)(ext.extensionPath, 'config', 'microservices.json'), 'utf8'), 'config/ must not exist — nothing reads it, and it would name another team\u2019s repos');
    });
    test('the content root setting is contributed and defaults to unset', () => {
        const ext = vscode.extensions.getExtension('internal.ai-dev-workflow');
        assert.ok(ext);
        const props = ext.packageJSON.contributes.configuration.properties;
        assert.ok('aiDevWorkflow.contentRoot' in props);
        // An empty default is what puts a fresh install into the unconfigured state
        // rather than silently reading somebody else's catalogue.
        assert.strictEqual(props['aiDevWorkflow.contentRoot'].default, '');
    });
    /**
     * The one behaviour that cannot be unit tested: writing into settings needs a
     * real configuration service. See spec Section 16.
     */
    test('setting the content root fills in the four specific paths', async () => {
        await vscode.extensions.getExtension('internal.ai-dev-workflow')?.activate();
        const root = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'root-'));
        const cfg = () => vscode.workspace.getConfiguration('aiDevWorkflow');
        const G = vscode.ConfigurationTarget.Global;
        for (const key of ['microserviceConfig', 'platformConfig', 'customPrompts', 'toolsConfig']) {
            await cfg().update(key, undefined, G);
        }
        await cfg().update('contentRoot', root, G);
        // Wait for the whole write, not for its first field. writeDerivedSettings
        // updates the pieces one await at a time, so polling on microserviceConfig
        // — the first one — can return before the last has landed. That raced for
        // as long as there were three pieces and started failing at four.
        await waitFor(() => cfg().get('toolsConfig') === (0, node_path_1.join)(root, 'config', 'tools.json'));
        assert.strictEqual(cfg().get('microserviceConfig'), (0, node_path_1.join)(root, 'config', 'microservices.json'));
        assert.strictEqual(cfg().get('platformConfig'), (0, node_path_1.join)(root, 'config', 'platforms.json'));
        assert.strictEqual(cfg().get('customPrompts'), (0, node_path_1.join)(root, 'prompts'));
        assert.strictEqual(cfg().get('toolsConfig'), (0, node_path_1.join)(root, 'config', 'tools.json'));
        // A value the developer chose themselves survives a later root change.
        await cfg().update('customPrompts', '/shared/prompts', G);
        const second = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'root2-'));
        await cfg().update('contentRoot', second, G);
        // Same again: toolsConfig is the last piece written, so it is the one that
        // says the whole update is done. customPrompts is deliberately skipped this
        // time round, which is what the final assertion is about.
        await waitFor(() => cfg().get('toolsConfig') === (0, node_path_1.join)(second, 'config', 'tools.json'));
        assert.strictEqual(cfg().get('microserviceConfig'), (0, node_path_1.join)(second, 'config', 'microservices.json'));
        assert.strictEqual(cfg().get('customPrompts'), '/shared/prompts', 'a hand-picked prompts folder must not silently revert');
        for (const key of [
            'contentRoot',
            'microserviceConfig',
            'platformConfig',
            'customPrompts',
            'toolsConfig',
        ]) {
            await cfg().update(key, undefined, G);
        }
    });
});
