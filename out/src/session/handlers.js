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
exports.buildHandlers = buildHandlers;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const vscode = __importStar(require("vscode"));
const AuditLog_1 = require("../audit/AuditLog");
const GitRunner_1 = require("../git/GitRunner");
const ChatHandoff_1 = require("../handoff/ChatHandoff");
const PromptComposer_1 = require("../prompt/PromptComposer");
const AiHandoffStep_1 = require("../steps/AiHandoffStep");
const ArtifactReviewStep_1 = require("../steps/ArtifactReviewStep");
const ConfirmStep_1 = require("../steps/ConfirmStep");
const FormStep_1 = require("../steps/FormStep");
const GitOpsStep_1 = require("../steps/GitOpsStep");
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
async function openInEditor(p) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
    await vscode.window.showTextDocument(doc, { preview: false });
}
/**
 * One class per step kind. Adding a kind means adding a class here — never
 * editing a switch statement that everyone touches. See spec Section 5.
 */
function buildHandlers(opts) {
    return [
        new FormStep_1.FormStep(),
        new GitOpsStep_1.GitOpsStep(new GitRunner_1.ExecGitRunner(), opts.codeRoot),
        new AiHandoffStep_1.AiHandoffStep(new PromptComposer_1.PromptComposer(opts.promptDir), new ChatHandoff_1.ChatHandoff(), new AuditLog_1.AuditLog(opts.taskDir), fileExists),
        new ArtifactReviewStep_1.ArtifactReviewStep(openInEditor, hashFile),
        new ConfirmStep_1.ConfirmStep(),
    ];
}
