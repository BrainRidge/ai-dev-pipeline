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
exports.ChatHandoff = void 0;
const vscode = __importStar(require("vscode"));
const node_path_1 = require("node:path");
/**
 * The fallback ladder from spec Section 8. Every rung is functional — the value
 * lies in the composed prompt, not in how it reaches the chat box. A degrades
 * to B degrades to C without touching anything outside this class.
 *
 * Which rung succeeds first is settled by the Task 0 spike.
 */
class ChatHandoff {
    async deliver(prompt, taskDir) {
        // A: chat opens with the prompt already filled in.
        try {
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: prompt,
                mode: 'agent',
            });
            return 'A';
        }
        catch {
            // fall through
        }
        // B: prompt on the clipboard, chat opened for one paste.
        try {
            await vscode.env.clipboard.writeText(prompt);
            await vscode.commands.executeCommand('workbench.action.chat.open');
            void vscode.window.showInformationMessage('Prompt copied to the clipboard — paste it into Copilot Chat.');
            return 'B';
        }
        catch {
            // fall through
        }
        // C: prompt written to a file and opened in an editor tab.
        const file = vscode.Uri.file((0, node_path_1.join)(taskDir, '.engine', 'prompt.md'));
        await vscode.workspace.fs.writeFile(file, Buffer.from(prompt, 'utf8'));
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
        void vscode.window.showWarningMessage('Could not open Copilot Chat. The composed prompt is open in an editor tab.');
        return 'C';
    }
}
exports.ChatHandoff = ChatHandoff;
