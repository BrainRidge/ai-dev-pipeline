"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeProbe = exports.PIECES = void 0;
exports.derivedFrom = derivedFrom;
exports.resolveContentRootSetting = resolveContentRootSetting;
exports.resolveConfigFile = resolveConfigFile;
exports.resolvePromptsDir = resolvePromptsDir;
exports.resolveToolsFile = resolveToolsFile;
exports.resolveAll = resolveAll;
exports.fieldsToWrite = fieldsToWrite;
exports.templateResolver = templateResolver;
exports.externalWorkflowsPresent = externalWorkflowsPresent;
exports.templateNote = templateNote;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const SetupSelection_1 = require("../session/SetupSelection");
exports.PIECES = [
    'microserviceConfig',
    'platformConfig',
    'customPrompts',
    'toolsConfig',
];
const LABEL = {
    microserviceConfig: { noun: 'microservice config', setting: 'aiDevWorkflow.microserviceConfig' },
    platformConfig: { noun: 'platform config', setting: 'aiDevWorkflow.platformConfig' },
    customPrompts: { noun: 'custom prompts folder', setting: 'aiDevWorkflow.customPrompts' },
    toolsConfig: { noun: 'tool config', setting: 'aiDevWorkflow.toolsConfig' },
};
/** Where each piece sits under a content root. The layout a team copies. */
function derivedFrom(root) {
    return {
        microserviceConfig: (0, node_path_1.join)(root, 'config', 'microservices.json'),
        platformConfig: (0, node_path_1.join)(root, 'config', 'platforms.json'),
        customPrompts: (0, node_path_1.join)(root, 'prompts'),
        toolsConfig: (0, node_path_1.join)(root, 'config', 'tools.json'),
    };
}
/** The content root itself, when it is set and usable. Only the workflows warning needs it. */
function resolveContentRootSetting(configured) {
    const value = configured.trim();
    return value !== '' && (0, SetupSelection_1.isAbsolutePath)(value) ? value : undefined;
}
function absoluteOrMessage(setting, value) {
    return (0, SetupSelection_1.isAbsolutePath)(value)
        ? { ok: true, path: value }
        : { ok: false, message: `${setting} must be an absolute path. Got "${value}".` };
}
/**
 * A piece's path: its own setting if it has one, otherwise derived from the
 * content root. Reading never depends on the derived values having been written
 * into settings, so hand-editing settings.json works and a failed write costs
 * nothing. See spec Section 16.
 */
function pathOf(piece, s) {
    const own = s[piece].trim();
    if (own !== '')
        return absoluteOrMessage(LABEL[piece].setting, own);
    const root = s.contentRoot.trim();
    if (root === '')
        return undefined;
    if (!(0, SetupSelection_1.isAbsolutePath)(root)) {
        return {
            ok: false,
            message: `aiDevWorkflow.contentRoot must be an absolute path. Got "${root}".`,
        };
    }
    return { ok: true, path: derivedFrom(root)[piece] };
}
/**
 * The two config files are required and do not fall back. The bundled catalogue
 * would name repositories belonging to another team, and gitClone would put
 * them on this developer's disk. See spec Section 16.
 */
function resolveConfigFile(piece, s) {
    const result = pathOf(piece, s);
    if (result)
        return result;
    return {
        ok: false,
        message: `No ${LABEL[piece].noun} configured. Set ${LABEL[piece].setting} in ` +
            'Settings → Extensions → AI Dev Workflow, or set Content Root to fill it in.',
    };
}
/**
 * Prompts are optional: every template a team has not supplied falls back to
 * the bundled one, per file. So "not configured" is an ordinary outcome here
 * rather than an error — but "configured badly" still is.
 */
function resolvePromptsDir(s) {
    const result = pathOf('customPrompts', s);
    if (!result)
        return { kind: 'none' };
    return result.ok ? { kind: 'dir', path: result.path } : { kind: 'error', message: result.message };
}
/**
 * The tool list is optional in the same way prompts are: a team that supplies
 * none gets the bundled default, and the report says which it used. So "not
 * configured" is an ordinary outcome — but a path that cannot be a path is not.
 * See spec Section 17.
 */
function resolveToolsFile(s) {
    const result = pathOf('toolsConfig', s);
    if (!result)
        return { kind: 'none' };
    return result.ok ? { kind: 'dir', path: result.path } : { kind: 'error', message: result.message };
}
/**
 * Every content path a task needs, or the first reason one is unusable.
 *
 * A broken prompts setting stops the task like a broken config file does. The
 * alternative — carrying on with the bundled prompts — is the silent fallback
 * this design exists to avoid. See spec Section 16.
 */
function resolveAll(s) {
    const micro = resolveConfigFile('microserviceConfig', s);
    if (!micro.ok)
        return micro;
    const platform = resolveConfigFile('platformConfig', s);
    if (!platform.ok)
        return platform;
    const prompts = resolvePromptsDir(s);
    if (prompts.kind === 'error')
        return { ok: false, message: prompts.message };
    const tools = resolveToolsFile(s);
    if (tools.kind === 'error')
        return { ok: false, message: tools.message };
    return {
        ok: true,
        microserviceConfig: micro.path,
        platformConfig: platform.path,
        promptsDir: prompts.kind === 'dir' ? prompts.path : undefined,
        toolsConfig: tools.kind === 'dir' ? tools.path : undefined,
    };
}
/**
 * Which derived values may be written into settings.
 *
 * A field is ours to update if it is empty, or if it still holds exactly what
 * we last wrote there. Anything else the developer put there deliberately, and
 * overwriting it would make a hand-picked prompts folder silently revert the
 * next time the content root changed. See spec Section 16.
 */
function fieldsToWrite(current, derived, lastWritten) {
    const out = {};
    for (const piece of exports.PIECES) {
        const value = current[piece].trim();
        const ours = value === '' || value === lastWritten[piece];
        if (ours && value !== derived[piece])
            out[piece] = derived[piece];
    }
    return out;
}
exports.nodeProbe = {
    async list(dir) {
        try {
            return await (0, promises_1.readdir)(dir);
        }
        catch {
            return undefined;
        }
    },
};
/**
 * Resolves `<promptsDir>/<workflowId>/<stepId>.md`, falling back to the bundled
 * template of the same name when the team has not supplied one.
 *
 * Fallback is per file on purpose: a team overriding one prompt keeps receiving
 * every other prompt a release adds. The cost is that a misnamed override would
 * be indistinguishable from no override, so the one likely misnaming — a case
 * difference — is refused rather than fallen back from. See spec Section 16.
 *
 * The check is made against a directory listing rather than by trying to open
 * the file, because opening `aiHandoff.md` succeeds on a case-insensitive
 * filesystem even when the file on disk is `aiHandoff.MD`.
 */
function templateResolver(opts, probe) {
    return async (workflowId, stepId) => {
        const expected = `${stepId}.md`;
        const bundled = {
            path: (0, node_path_1.join)(opts.bundledPromptsDir, workflowId, expected),
            source: 'bundled',
        };
        if (!opts.promptsDir)
            return bundled;
        const dir = (0, node_path_1.join)(opts.promptsDir, workflowId);
        const names = await probe.list(dir);
        if (!names)
            return bundled;
        if (names.includes(expected))
            return { path: (0, node_path_1.join)(dir, expected), source: 'external' };
        const variant = names.find((n) => n.toLowerCase() === expected.toLowerCase());
        if (variant) {
            throw new Error(`found "${variant}" in ${dir}, expected "${expected}"`);
        }
        return bundled;
    };
}
/** Workflows are not configurable; a folder of them is a misunderstanding worth reporting. */
async function externalWorkflowsPresent(root, probe) {
    return (await probe.list((0, node_path_1.join)(root, 'workflows'))) !== undefined;
}
/** The caption above a composed prompt, so silent fallback is visible on screen. */
function templateNote(t) {
    return `Template: ${t.path} (${t.source === 'external' ? 'external' : 'bundled default'})`;
}
