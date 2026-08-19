"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformsFileSchema = exports.platformSchema = exports.microservicesFileSchema = exports.microserviceSchema = exports.workflowFileSchema = exports.workflowStepSchema = exports.fieldSchema = exports.stepTypeSchema = void 0;
exports.repoNameOf = repoNameOf;
exports.parseWorkflowFilename = parseWorkflowFilename;
const zod_1 = require("zod");
/** How a step behaves. Declared by its taskType and cross-checked in the JSON. */
exports.stepTypeSchema = zod_1.z.enum(['task', 'commandExecution', 'aiHandoff', 'manual']);
exports.fieldSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    type: zod_1.z.enum([
        'text',
        'textarea',
        'select',
        'multiselect',
        'boolean',
        'repo-picker',
        'file-picker',
    ]),
    label: zod_1.z.string().min(1),
    required: zod_1.z.boolean().optional(),
    source: zod_1.z.string().optional(),
    provider: zod_1.z.string().optional(),
    options: zod_1.z.array(zod_1.z.object({ value: zod_1.z.string(), label: zod_1.z.string() })).optional(),
});
exports.workflowStepSchema = zod_1.z.object({
    stepType: exports.stepTypeSchema,
    taskType: zod_1.z.string().min(1),
    documentation: zod_1.z.string().default(''),
    interactive: zod_1.z.boolean().optional(),
    nextStep: zod_1.z.string().optional(),
});
exports.workflowFileSchema = zod_1.z.object({
    schemaVersion: zod_1.z.literal(1),
    label: zod_1.z.string().min(1),
    initialStep: zod_1.z.string().min(1),
    steps: zod_1.z.record(zod_1.z.string(), exports.workflowStepSchema),
});
/** The microservice catalogue. Note: no platform key — platform is context only. */
exports.microserviceSchema = zod_1.z.object({
    microserviceName: zod_1.z.string().min(1),
    shortCode: zod_1.z.string().min(1),
    purpose: zod_1.z.string().default(''),
    gitLocation: zod_1.z.string().min(1),
    category: zod_1.z.string().default(''),
    subcategory: zod_1.z.string().default(''),
});
exports.microservicesFileSchema = zod_1.z.array(exports.microserviceSchema);
exports.platformSchema = zod_1.z.object({ id: zod_1.z.string().min(1), label: zod_1.z.string().min(1) });
exports.platformsFileSchema = zod_1.z.object({
    comment: zod_1.z.string().optional(),
    platforms: zod_1.z.array(exports.platformSchema),
});
/**
 * The folder a repository lands in, derived from its git location the way git
 * itself does: the last path segment, without a trailing `.git`.
 *
 * Only `.git` is stripped — `payment-service.ui` keeps its suffix, because that
 * is part of the repository's name rather than a git convention.
 *
 * Returns undefined for a location with no usable segment, which the catalogue
 * rejects at load time rather than leaving a `cd` pointing nowhere.
 */
function repoNameOf(gitLocation) {
    const trimmed = (gitLocation.split(/[?#]/)[0] ?? '').replace(/\/+$/, '');
    // Drop the scheme and host, or the scp-like `user@host:` prefix, so that a
    // location with no path left cannot pass the host off as a repository.
    const path = trimmed.includes('://')
        ? trimmed.slice(trimmed.indexOf('://') + 3).replace(/^[^/]*/, '')
        : trimmed.slice(trimmed.indexOf(':') + 1);
    const name = (path.split('/').filter(Boolean).pop() ?? '').replace(/\.git$/, '');
    return name === '' ? undefined : name;
}
/**
 * Workflows are versioned by filename: researchTaskWorkflow_1_0.json.
 * Returns { id: 'researchTaskWorkflow', version: '1.0' }.
 */
function parseWorkflowFilename(filename) {
    const m = /^(.+?)_(\d+)_(\d+)\.json$/.exec(filename);
    if (!m)
        return undefined;
    return { id: m[1], version: `${m[2]}.${m[3]}` };
}
