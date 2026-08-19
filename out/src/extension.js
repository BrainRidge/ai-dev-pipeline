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
exports.activate = activate;
exports.deactivate = deactivate;
const promises_1 = require("node:fs/promises");
const vscode = __importStar(require("vscode"));
const TaskSession_1 = require("./session/TaskSession");
const SetupView_1 = require("./session/SetupView");
const resume_1 = require("./session/resume");
const UpdateCheck_1 = require("./update/UpdateCheck");
async function activate(context) {
    const resume = async (taskId) => {
        const session = await TaskSession_1.TaskSession.resume(context, taskId);
        if (!session) {
            void vscode.window.showErrorMessage(`Task ${taskId} has no saved state.`);
            return;
        }
        session.show();
    };
    // Pane 1: the activity-bar sidebar. Collects the task-level inputs that feed
    // the workflow, then opens the workflow panel in the editor area (pane 2).
    // It also lists unfinished tasks, so continuing one needs no command palette.
    const setup = new SetupView_1.SetupView(context, async (selection) => {
        const session = await TaskSession_1.TaskSession.startWith(context, selection);
        session?.show();
    }, resume);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(SetupView_1.SetupView.viewId, setup));
    context.subscriptions.push(vscode.commands.registerCommand('aiDevWorkflow.startTask', async () => {
        try {
            const session = await TaskSession_1.TaskSession.start(context);
            session?.show();
        }
        catch (err) {
            void vscode.window.showErrorMessage(`Could not start task: ${String(err)}`);
        }
    }), vscode.commands.registerCommand('aiDevWorkflow.resumeTask', async () => {
        const ids = (await (0, promises_1.readdir)((0, TaskSession_1.tasksRoot)()).catch(() => [])).filter((n) => !n.startsWith('.'));
        if (ids.length === 0) {
            void vscode.window.showInformationMessage('No tasks found.');
            return;
        }
        const chosen = await vscode.window.showQuickPick(ids.reverse(), {
            placeHolder: 'Resume which task?',
        });
        if (!chosen)
            return;
        await resume(chosen);
    }));
    void notifyIfOutOfDate(context);
    // Resume automatically when a generated workspace is opened. This is what
    // makes a workflow survive the extension-host restart that opening the
    // multi-root workspace causes. See spec Section 7.
    const taskId = (0, resume_1.taskIdFromWorkspaceSettings)({
        'aiDevWorkflow.taskId': vscode.workspace.getConfiguration('aiDevWorkflow').get('taskId') ?? '',
    });
    if (taskId) {
        try {
            const session = await TaskSession_1.TaskSession.resume(context, taskId);
            session?.show();
        }
        catch (err) {
            void vscode.window.showErrorMessage(`Could not resume task ${taskId}: ${String(err)}`);
        }
    }
}
async function notifyIfOutOfDate(context) {
    const latest = await (0, UpdateCheck_1.checkForUpdate)({
        manifestUrl: vscode.workspace.getConfiguration('aiDevWorkflow').get('updateManifestUrl') ?? '',
        currentVersion: context.extension.packageJSON.version,
        fetchJson: async (url) => (await (await fetch(url)).json()),
    });
    if (latest) {
        void vscode.window.showInformationMessage(`AI Dev Workflow ${latest} is available. Install the new .vsix to update.`);
    }
}
function deactivate() { }
