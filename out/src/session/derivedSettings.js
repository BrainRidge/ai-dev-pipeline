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
exports.writeDerivedSettings = writeDerivedSettings;
const vscode = __importStar(require("vscode"));
const ContentRoot_1 = require("../content/ContentRoot");
/**
 * What we last wrote into the three settings. Kept so that a value the
 * developer has since changed can be told apart from one we put there.
 */
const MEMENTO_KEY = 'aiDevWorkflow.derivedPaths';
/**
 * Fills the three specific settings in from the content root.
 *
 * Writing into a developer's settings.json is unusual, and VS Code offers no
 * undo for it, so the rule is narrow: a field is overwritten only if it is
 * empty or still holds exactly what we last wrote. A prompts folder somebody
 * pointed at a shared repository is theirs, and must not silently revert the
 * next time the content root changes. See spec Section 16.
 *
 * The values are written into the same scope the content root was set in, so a
 * workspace-level root fills workspace-level paths and a team that commits
 * .vscode/settings.json stays consistent.
 */
async function writeDerivedSettings(context) {
    const config = vscode.workspace.getConfiguration('aiDevWorkflow');
    const root = (0, ContentRoot_1.resolveContentRootSetting)(config.get('contentRoot') ?? '');
    if (!root)
        return;
    const workspaceScoped = config.inspect('contentRoot')?.workspaceValue !== undefined;
    const target = workspaceScoped
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    const memento = workspaceScoped ? context.workspaceState : context.globalState;
    const current = Object.fromEntries(ContentRoot_1.PIECES.map((piece) => [piece, config.get(piece) ?? '']));
    const lastWritten = memento.get(MEMENTO_KEY) ?? {};
    const pending = (0, ContentRoot_1.fieldsToWrite)(current, (0, ContentRoot_1.derivedFrom)(root), lastWritten);
    if (Object.keys(pending).length === 0)
        return;
    for (const [piece, value] of Object.entries(pending)) {
        await config.update(piece, value, target);
    }
    await memento.update(MEMENTO_KEY, { ...lastWritten, ...pending });
}
