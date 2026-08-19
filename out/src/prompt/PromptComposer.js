"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptComposer = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const yaml_1 = require("yaml");
const placeholders_1 = require("../engine/placeholders");
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
/**
 * Assembles the prompt deterministically in four parts (spec Section 8):
 *   1. template body   2. workspace path map
 *   3. scope constraint  4. output contract
 *
 * Parts 2-4 are generated here, so prompt authors write only the thinking and
 * never have to remember the boilerplate that makes it work.
 *
 * Determinism is the point: the same workflow, answers and extension version
 * must produce a byte-identical prompt. That is what makes the process
 * standardised rather than merely documented.
 *
 * A template is found by convention at `<workflowId>/<stepId>.md`, which is why
 * adding a workflow needs a JSON file and a markdown file but no TypeScript.
 */
class PromptComposer {
    templateDir;
    constructor(templateDir) {
        this.templateDir = templateDir;
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
        const { outputFile } = await this.template(step, ctx);
        if (!outputFile) {
            throw new Error(`prompt template "${this.path(step, ctx)}" must declare "output:" in its frontmatter`);
        }
        return outputFile;
    }
    async compose(step, ctx, repos) {
        const { body, outputFile } = await this.template(step, ctx);
        const part1 = (0, placeholders_1.resolveText)(body, ctx);
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
        // Part 4 exists only when the template declares an artifact. A handoff that
        // edits code has no file to contract for, and inventing one would put a
        // false promise in the audit log.
        const part4 = outputFile
            ? [
                '',
                '## Required output',
                '',
                `Write your result to \`${(0, node_path_1.join)(ctx.taskDir, outputFile)}\`.`,
                'Create the file if it does not exist. Do not write your result anywhere else.',
            ].join('\n')
            : ['', '## Required output', '', 'Change the code in place. Do not write a summary file.'].join('\n');
        return {
            prompt: [part1.trimEnd(), part2, part3, part4, ''].join('\n'),
            outputFile,
        };
    }
    path(step, ctx) {
        return (0, node_path_1.join)(this.templateDir, ctx.workflowId, `${step.id}.md`);
    }
    async template(step, ctx) {
        const path = this.path(step, ctx);
        const raw = await (0, promises_1.readFile)(path, 'utf8');
        const match = FRONTMATTER.exec(raw);
        if (!match)
            return { body: raw };
        const meta = (0, yaml_1.parse)(match[1]);
        const declared = meta?.output;
        if (declared !== undefined && (typeof declared !== 'string' || declared.trim() === '')) {
            throw new Error(`prompt template "${path}" declares an unusable "output:" value`);
        }
        return {
            body: raw.slice(match[0].length),
            outputFile: typeof declared === 'string' ? declared.trim() : undefined,
        };
    }
}
exports.PromptComposer = PromptComposer;
