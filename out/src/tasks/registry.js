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
exports.buildTaskTypes = buildTaskTypes;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const vscode = __importStar(require("vscode"));
const AuditLog_1 = require("../audit/AuditLog");
const ChatHandoff_1 = require("../handoff/ChatHandoff");
const PromptComposer_1 = require("../prompt/PromptComposer");
const CollectRequirement_1 = require("./CollectRequirement");
const GitClone_1 = require("./GitClone");
const InvokeCopilot_1 = require("./InvokeCopilot");
const InvokeCopilotCoding_1 = require("./InvokeCopilotCoding");
const InvokeCopilotCodeReview_1 = require("./InvokeCopilotCodeReview");
const ManualReview_1 = require("./ManualReview");
const TaskType_1 = require("./TaskType");
async function fileExists(p) {
    try {
        await (0, promises_1.access)(p);
        return true;
    }
    catch {
        return false;
    }
}
async function hashFile(p) {
    return (0, node_crypto_1.createHash)('sha256').update(await (0, promises_1.readFile)(p, 'utf8')).digest('hex');
}
const TERMINAL = 'AI Dev Workflow';
async function openInEditor(p) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
    await vscode.window.showTextDocument(doc, { preview: false });
}
/**
 * The vocabulary a workflow may compose. Adding a step to a workflow is
 * configuration; adding a new kind of primitive is a class registered here.
 * See spec Section 5.
 */
function buildTaskTypes(opts) {
    const sink = {
        async copy(text) {
            await vscode.env.clipboard.writeText(text);
        },
        // sendText with addNewLine false pastes at the prompt and stops. The
        // developer presses Enter; nothing runs because a panel button was clicked.
        async toTerminal(text) {
            const terminal = vscode.window.terminals.find((t) => t.name === TERMINAL) ??
                vscode.window.createTerminal({ name: TERMINAL });
            terminal.show();
            terminal.sendText(text, false);
        },
    };
    return new TaskType_1.TaskTypeRegistry([
        new CollectRequirement_1.CollectRequirement(),
        new GitClone_1.GitClone(opts.codeRoot, node_fs_1.existsSync, sink),
        new InvokeCopilot_1.InvokeCopilot(new PromptComposer_1.PromptComposer(opts.promptDir), new ChatHandoff_1.ChatHandoff(), new AuditLog_1.AuditLog(opts.taskDir), fileExists, sink),
        new InvokeCopilotCoding_1.InvokeCopilotCoding(new PromptComposer_1.PromptComposer(opts.promptDir), new ChatHandoff_1.ChatHandoff(), new AuditLog_1.AuditLog(opts.taskDir), sink),
        new InvokeCopilotCodeReview_1.InvokeCopilotCodeReview(new PromptComposer_1.PromptComposer(opts.promptDir), new ChatHandoff_1.ChatHandoff(), new AuditLog_1.AuditLog(opts.taskDir), sink),
        new ManualReview_1.ManualReview(openInEditor, hashFile),
    ]);
}
