"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowCatalog = void 0;
exports.validateMicroservices = validateMicroservices;
exports.buildWorkflow = buildWorkflow;
exports.validateGraph = validateGraph;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const schema_1 = require("./schema");
/**
 * A config file now comes from a folder a team maintains rather than from the
 * extension bundle, so "which file, and where did we look" is the first thing
 * the reader needs. Errors from the schema and from validateMicroservices keep
 * their own wording — they are the most useful thing this loader says.
 * See spec Section 16.
 */
async function readConfig(path, label) {
    let raw;
    try {
        raw = await (0, promises_1.readFile)(path, 'utf8');
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`${label} not found at ${path}`);
        }
        throw err;
    }
    try {
        return JSON.parse(raw);
    }
    catch (err) {
        throw new Error(`${label} at ${path} is not valid JSON: ${err.message}`);
    }
}
/** Names the file a schema failure came from; zod's own message does not. */
function attribute(label, path, parse) {
    try {
        return parse();
    }
    catch (err) {
        throw new Error(`${label} at ${path} is not valid: ${err instanceof Error ? err.message : String(err)}`);
    }
}
class WorkflowCatalog {
    workflows;
    platformDefs;
    services;
    constructor(workflows, platformDefs, services) {
        this.workflows = workflows;
        this.platformDefs = platformDefs;
        this.services = services;
    }
    /**
     * @param workflowsDir directory of `<name>_<major>_<minor>.json` workflow files
     * @param config       absolute paths to the two config files. They are given
     *                     separately rather than as a directory because each has
     *                     its own setting and may live anywhere. See spec Section 16.
     */
    static async load(workflowsDir, config) {
        const platformsRaw = await readConfig(config.platformConfig, 'Platform config');
        const platforms = attribute('Platform config', config.platformConfig, () => schema_1.platformsFileSchema.parse(platformsRaw)).platforms;
        const servicesRaw = await readConfig(config.microserviceConfig, 'Microservice config');
        const services = attribute('Microservice config', config.microserviceConfig, () => schema_1.microservicesFileSchema.parse(servicesRaw));
        validateMicroservices(services);
        const workflows = new Map();
        for (const filename of await (0, promises_1.readdir)(workflowsDir)) {
            if (!filename.endsWith('.json'))
                continue;
            const parsed = (0, schema_1.parseWorkflowFilename)(filename);
            if (!parsed) {
                throw new Error(`workflow filename "${filename}" is not versioned. ` +
                    `Expected <name>_<major>_<minor>.json, e.g. researchTaskWorkflow_1_0.json`);
            }
            const file = schema_1.workflowFileSchema.parse(JSON.parse(await (0, promises_1.readFile)((0, node_path_1.join)(workflowsDir, filename), 'utf8')));
            const workflow = buildWorkflow(parsed.id, parsed.version, file);
            // Keep only the highest version of each workflow id.
            const existing = workflows.get(parsed.id);
            if (existing && compareVersions(existing.version, parsed.version) >= 0)
                continue;
            workflows.set(parsed.id, workflow);
        }
        return new WorkflowCatalog(workflows, platforms, services);
    }
    get(id) {
        const wf = this.workflows.get(id);
        if (!wf)
            throw new Error(`unknown workflow: ${id}`);
        return wf;
    }
    all() {
        return [...this.workflows.values()];
    }
    platforms() {
        return this.platformDefs;
    }
    microservices() {
        return this.services;
    }
    /** Type-ahead over name and shortCode. Empty query returns everything. */
    searchMicroservices(query) {
        const q = query.trim().toLowerCase();
        if (!q)
            return this.services;
        return this.services.filter((s) => s.microserviceName.toLowerCase().includes(q) ||
            s.shortCode.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q));
    }
    microserviceByCode(shortCode) {
        return this.services.find((s) => s.shortCode === shortCode);
    }
}
exports.WorkflowCatalog = WorkflowCatalog;
/**
 * Two services must never collide, on either key. The shortCode is what the
 * sidebar selects by; the repository name is the folder both would be cloned
 * into, and a clash there would have them quietly overwrite each other on a
 * developer's disk. Both are load-time errors so they surface on a tool
 * developer's machine instead.
 */
function validateMicroservices(services) {
    const seenCodes = new Map();
    const seenRepos = new Map();
    for (const service of services) {
        const clashingCode = seenCodes.get(service.shortCode);
        if (clashingCode) {
            throw new Error(`microservices: "${service.microserviceName}" and "${clashingCode}" ` +
                `share the shortCode "${service.shortCode}"`);
        }
        seenCodes.set(service.shortCode, service.microserviceName);
        const repo = (0, schema_1.repoNameOf)(service.gitLocation);
        if (!repo) {
            throw new Error(`microservices: "${service.microserviceName}" has a gitLocation with no ` +
                `repository name: "${service.gitLocation}"`);
        }
        const clashingRepo = seenRepos.get(repo);
        if (clashingRepo) {
            throw new Error(`microservices: "${service.microserviceName}" and "${clashingRepo}" both clone ` +
                `into "${repo}", so they would overwrite each other`);
        }
        seenRepos.set(repo, service.microserviceName);
    }
}
/**
 * Folds the step ids in and walks the graph. Shared by the catalogue and by
 * resume, which rebuilds the workflow from the task's own snapshot (spec D8)
 * rather than from whatever the installed extension ships today.
 */
function buildWorkflow(id, version, file) {
    const steps = {};
    for (const [stepId, step] of Object.entries(file.steps))
        steps[stepId] = { ...step, id: stepId };
    return {
        id,
        version,
        label: file.label,
        initialStep: file.initialStep,
        steps,
        order: validateGraph(id, file.initialStep, steps),
    };
}
/**
 * A workflow is a directed graph, so it must be checked as one: the entry point
 * exists, every nextStep resolves, and no step is stranded. These are load-time
 * errors so a broken workflow fails on a tool developer's machine rather than a
 * developer's. See spec Section 6.
 */
function validateGraph(workflowId, initialStep, steps) {
    if (!steps[initialStep]) {
        throw new Error(`${workflowId}: initialStep "${initialStep}" is not a step`);
    }
    for (const step of Object.values(steps)) {
        if (step.nextStep && !steps[step.nextStep]) {
            throw new Error(`${workflowId}: step "${step.id}" points at unknown nextStep "${step.nextStep}"`);
        }
        if (step.nextStep === step.id) {
            throw new Error(`${workflowId}: step "${step.id}" points at itself, so the workflow can never finish`);
        }
    }
    // Walk from the entry point to establish display order and reachability.
    const order = [];
    const seen = new Set();
    let cursor = initialStep;
    while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        order.push(cursor);
        cursor = steps[cursor]?.nextStep;
    }
    const stranded = Object.keys(steps).filter((id) => !seen.has(id));
    if (stranded.length > 0) {
        throw new Error(`${workflowId}: step(s) ${stranded.map((s) => `"${s}"`).join(', ')} cannot be reached from "${initialStep}"`);
    }
    const terminal = order.some((id) => !steps[id].nextStep);
    if (!terminal) {
        throw new Error(`${workflowId}: no step is terminal, so the workflow can never finish`);
    }
    return order;
}
function compareVersions(a, b) {
    const [aMaj = 0, aMin = 0] = a.split('.').map(Number);
    const [bMaj = 0, bMin = 0] = b.split('.').map(Number);
    return aMaj !== bMaj ? aMaj - bMaj : aMin - bMin;
}
