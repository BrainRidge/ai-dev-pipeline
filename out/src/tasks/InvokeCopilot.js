"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvokeCopilot = void 0;
const node_path_1 = require("node:path");
const history_1 = require("./history");
const promptBlock_1 = require("./promptBlock");
/**
 * Composes the prompt and hands it to Copilot. The extension orchestrates; the
 * chat executes (spec D1), so nothing past the handoff boundary is auditable —
 * which is exactly why the composed prompt is logged in full before it leaves.
 */
class InvokeCopilot {
    composer;
    handoff;
    audit;
    fileExists;
    sink;
    name = 'invokeCopilot';
    stepType = 'aiHandoff';
    title = 'Hand off to Copilot';
    constructor(composer, handoff, audit, fileExists, sink) {
        this.composer = composer;
        this.handoff = handoff;
        this.audit = audit;
        this.fileExists = fileExists;
        this.sink = sink;
    }
    async describe(step, ctx, values) {
        const { block, failure } = await (0, promptBlock_1.composePreview)(this.composer, step, ctx, (0, promptBlock_1.editedPrompt)(values));
        return {
            text: failure
                ? `The prompt could not be composed: ${failure}`
                : 'Read the prompt below — edit it if you want to — send it to Copilot, then ' +
                    'mark this step done once the output file has been written.',
            commands: block ? [block] : undefined,
            actions: [
                { id: 'send', label: 'Send to Copilot' },
                { id: 'done', label: 'Done', primary: true },
            ],
        };
    }
    /** The same prompt the panel shows — including the developer's edits to it. */
    async copyPrompt(step, ctx, override) {
        const text = override ?? (await this.composer.compose(step, ctx, (0, history_1.reposBefore)(ctx, step.id))).prompt;
        await this.sink.copy(text);
        return { label: override ? 'your edited prompt' : 'the composed prompt', text };
    }
    /**
     * Both conditions are required (spec D9). The watcher alone is not enough —
     * Copilot may write the file and keep working. The click alone is not enough
     * — developers click things.
     */
    validate(_step, values) {
        const errors = {};
        if (!values.confirmed) {
            errors.confirmed = 'Mark the step done once Copilot has finished.';
        }
        if (!values.outputPresent) {
            const name = typeof values.outputFile === 'string' ? values.outputFile : 'The output file';
            errors.output = `${name} has not been written yet. Reopen the chat and try again.`;
        }
        return { ok: Object.keys(errors).length === 0, errors };
    }
    /** Where this step's artifact will land. Needed by the watcher and the review step. */
    async outputPath(step, ctx) {
        return (0, node_path_1.join)(ctx.taskDir, await this.composer.outputFor(step, ctx));
    }
    async deliver(step, ctx, override) {
        const composed = await this.composer.compose(step, ctx, (0, history_1.reposBefore)(ctx, step.id));
        const { outputFile, templatePath, templateSource } = composed;
        // The developer's text wins, but the artifact contract does not: which file
        // this step waits for is the template's decision, not the prompt's wording.
        const prompt = override ?? composed.prompt;
        if (!outputFile) {
            const { path } = await this.composer.resolved(step, ctx);
            throw new Error(`prompt template "${path}" must declare "output:" — ` +
                `step "${step.id}" completes only when that file appears`);
        }
        // Written BEFORE delivery so a crash still leaves the record. `includes`
        // are already inside `prompt` verbatim; recording their paths says whose
        // wording it was. `references` are the one thing the log names without
        // holding — see spec Section 8.
        await this.audit.append({
            kind: 'prompt-composed',
            stepId: step.id,
            data: {
                prompt,
                chars: prompt.length,
                outputFile,
                templatePath,
                templateSource,
                includes: composed.includes,
                references: composed.references,
            },
        });
        const mechanism = await this.handoff.deliver(prompt, ctx.taskDir);
        return { mechanism, promptChars: prompt.length, outputPath: (0, node_path_1.join)(ctx.taskDir, outputFile) };
    }
    async execute(step, ctx, values) {
        const outputPath = await this.outputPath(step, ctx);
        return {
            outputPath,
            outputFile: (0, node_path_1.basename)(outputPath),
            outputPresent: await this.fileExists(outputPath),
            mechanism: values.mechanism ?? null,
        };
    }
}
exports.InvokeCopilot = InvokeCopilot;
