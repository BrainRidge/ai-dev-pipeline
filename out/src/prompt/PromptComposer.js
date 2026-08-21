"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptComposer = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const yaml_1 = require("yaml");
const placeholders_1 = require("../engine/placeholders");
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
/** Keys only a step's own template may declare. See spec Section 8. */
const OWNER_KEYS = ['output', 'include', 'reference'];
/**
 * Assembles the prompt deterministically in five parts (spec Section 8):
 *   1. template body, then any included templates
 *   2. workspace path map
 *   3. scope constraint
 *   4. further reading, when the template names any
 *   5. output contract
 *
 * Parts 2-5 are generated here, so prompt authors write only the thinking and
 * never have to remember the boilerplate that makes it work.
 *
 * Determinism is the point: the same workflow, answers and extension version
 * must produce a byte-identical prompt. That is what makes the process
 * standardised rather than merely documented.
 *
 * A template is found by convention at `<workflowId>/<stepId>.md`, which is why
 * adding a workflow needs a JSON file and a markdown file but no TypeScript.
 * Which directory that convention is applied to — the team's content folder or
 * the extension's own — is the resolver's decision, not this class's.
 * See spec Section 16.
 */
class PromptComposer {
    resolve;
    constructor(resolve) {
        this.resolve = resolve;
    }
    /**
     * Which template this step will use, and whether it is the team's or the
     * bundled default — without reading or composing it. The panel needs this to
     * caption the prompt, and `InvokeCopilot` needs it to name the file in an
     * error. See spec Section 16.
     */
    async resolved(step, ctx) {
        return this.resolve((0, node_path_1.join)(ctx.workflowId, `${step.id}.md`));
    }
    /**
     * The artifact name is frontmatter rather than code, because which file a
     * handoff produces is the prompt author's decision — the same decision as
     * what the prompt asks for, and it belongs in the same file.
     *
     * Throws for a template that declares none: a step whose completion depends
     * on a file appearing (spec D9) cannot proceed without knowing its name.
     */
    async outputFor(step, ctx) {
        const { outputFile, path } = await this.template(step, ctx);
        if (!outputFile) {
            throw new Error(`prompt template "${path}" must declare "output:" in its frontmatter`);
        }
        return outputFile;
    }
    async compose(step, ctx, repos) {
        const main = await this.template(step, ctx);
        const included = await this.readIncludes(main);
        const references = await this.resolveReferences(main, ctx);
        // Part 1: the step's own thinking first, then whatever it leans on. Most
        // specific at the top, which is what this part is for — the shared files
        // are constraints on the work, and read naturally after it is described.
        const part1 = [
            (0, placeholders_1.resolveText)(main.body, ctx).trimEnd(),
            ...included.map((i) => (0, placeholders_1.resolveText)(i.body, ctx).trimEnd()),
        ].join('\n\n');
        const part2 = [
            '',
            '## Repositories in scope',
            '',
            ...repos.map((r) => `- **${r.name}** — \`${r.path}\` #file:${r.path}`),
        ].join('\n');
        const part3 = [
            '',
            '## Scope',
            '',
            'Work only within the repositories listed above. Do not modify files elsewhere.',
        ].join('\n');
        // Part 4 exists only when the template names something. A reference that is
        // not on disk is still emitted: what is sent must be what the panel shows,
        // and the caption is where the developer is told it is missing.
        const part4 = references.length > 0
            ? [
                '',
                '## Further reading',
                '',
                'Read these before you start:',
                ...references.map((r) => `- #file:${r.path}`),
            ].join('\n')
            : '';
        // Part 5 exists only when the template declares an artifact. A handoff that
        // edits code has no file to contract for, and inventing one would put a
        // false promise in the audit log.
        const part5 = main.outputFile
            ? [
                '',
                '## Required output',
                '',
                `Write your result to \`${(0, node_path_1.join)(ctx.taskDir, main.outputFile)}\`.`,
                'Create the file if it does not exist. Do not write your result anywhere else.',
            ].join('\n')
            : ['', '## Required output', '', 'Change the code in place. Do not write a summary file.'].join('\n');
        return {
            prompt: [part1, part2, part3, ...(part4 ? [part4] : []), part5, ''].join('\n'),
            outputFile: main.outputFile,
            templatePath: main.path,
            templateSource: main.source,
            includes: included.map(({ path, source }) => ({ path, source })),
            references,
        };
    }
    /**
     * The templates a prompt quotes, in declared order.
     *
     * A missing include is fatal, unlike a missing reference: its text is part of
     * what is being asked, and dropping it would silently change the prompt while
     * the panel still showed a caption saying it was there.
     */
    async readIncludes(main) {
        const out = [];
        for (const name of main.include) {
            const resolved = await this.resolve(promptsRelative(name, main.path, 'include'));
            let raw;
            try {
                raw = await (0, promises_1.readFile)(resolved.path, 'utf8');
            }
            catch {
                throw new Error(`prompt template "${main.path}" includes "${name}", which was not found at ` +
                    `${resolved.path}`);
            }
            // One level only. An included file that pulled in more would need cycle
            // detection to be safe, and no bundled prompt has ever wanted it.
            const meta = frontmatterOf(raw);
            const owner = OWNER_KEYS.find((key) => meta?.[key] !== undefined);
            if (owner) {
                throw new Error(`included template "${resolved.path}" declares "${owner}:", which only a step's ` +
                    `own template may do`);
            }
            out.push({ body: stripFrontmatter(raw), path: resolved.path, source: resolved.source });
        }
        return out;
    }
    /**
     * The files the prompt points Copilot at.
     *
     * Placeholders are resolved first, so a template can name a document inside a
     * repository the task has just cloned — `{{task.workDir}}/party-service/…`.
     * An absolute result is used as it stands; anything else is a name under the
     * prompts root, resolved with the same fallback as a template.
     */
    async resolveReferences(main, ctx) {
        const out = [];
        for (const entry of main.reference) {
            const resolvedText = (0, placeholders_1.resolveText)(entry, ctx).trim();
            if (resolvedText === '')
                continue;
            const path = (0, node_path_1.isAbsolute)(resolvedText)
                ? resolvedText
                : (await this.resolve(promptsRelative(resolvedText, main.path, 'reference'))).path;
            out.push({ path, found: await exists(path) });
        }
        return out;
    }
    async template(step, ctx) {
        const { path, source } = await this.resolved(step, ctx);
        const raw = await (0, promises_1.readFile)(path, 'utf8');
        const match = FRONTMATTER.exec(raw);
        if (!match) {
            return { body: raw, include: [], reference: [], path, source };
        }
        const meta = (0, yaml_1.parse)(match[1]);
        const declared = meta?.output;
        if (declared !== undefined && (typeof declared !== 'string' || declared.trim() === '')) {
            throw new Error(`prompt template "${path}" declares an unusable "output:" value`);
        }
        return {
            body: raw.slice(match[0].length),
            outputFile: typeof declared === 'string' ? declared.trim() : undefined,
            include: stringList(meta?.include, path, 'include'),
            reference: stringList(meta?.reference, path, 'reference'),
            path,
            source,
        };
    }
}
exports.PromptComposer = PromptComposer;
function frontmatterOf(raw) {
    const match = FRONTMATTER.exec(raw);
    if (!match)
        return null;
    return (0, yaml_1.parse)(match[1]) ?? null;
}
function stripFrontmatter(raw) {
    const match = FRONTMATTER.exec(raw);
    return match ? raw.slice(match[0].length) : raw;
}
/** A frontmatter list, or a precise complaint about what was written instead. */
function stringList(value, path, key) {
    if (value === undefined || value === null)
        return [];
    // A single string is accepted: one file is the common case and writing it as
    // a list is the kind of ceremony that makes a format feel unfriendly.
    const items = Array.isArray(value) ? value : [value];
    return items.map((item) => {
        if (typeof item !== 'string' || item.trim() === '') {
            throw new Error(`prompt template "${path}" has an unusable entry under "${key}:"`);
        }
        return item.trim();
    });
}
/**
 * A name under the prompts root. Absolute paths and `..` are refused so that
 * every quoted file is either the team's or the bundled default — which is what
 * makes the caption above the prompt and the audit entry mean anything.
 */
function promptsRelative(name, declaredIn, key) {
    if ((0, node_path_1.isAbsolute)(name) || name.split(/[\\/]/).includes('..')) {
        throw new Error(`prompt template "${declaredIn}" names "${name}" under "${key}:". Use a path relative ` +
            `to the prompts folder, such as "_shared/house-rules.md".`);
    }
    return name;
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
