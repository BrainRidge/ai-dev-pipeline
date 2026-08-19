"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiHandoffStep = void 0;
const node_path_1 = require("node:path");
class AiHandoffStep {
    composer;
    handoff;
    audit;
    fileExists;
    kind = 'ai-handoff';
    constructor(composer, handoff, audit, fileExists) {
        this.composer = composer;
        this.handoff = handoff;
        this.audit = audit;
        this.fileExists = fileExists;
    }
    describe(step, _ctx, _values) {
        return {
            text: `Send the composed prompt to Copilot, then mark this step done once ` +
                `\`${step.output}\` has been written.`,
            actions: [
                { id: 'send', label: 'Send to Copilot' },
                { id: 'done', label: 'Done', primary: true },
            ],
        };
    }
    /**
     * Both conditions are required (spec D9). The watcher alone is not enough —
     * Copilot may write the file and keep working. The click alone is not enough
     * — developers click things.
     */
    validate(step, values) {
        const errors = {};
        if (!values.confirmed) {
            errors.confirmed = 'Mark the step done once Copilot has finished.';
        }
        if (!values.outputPresent) {
            errors.output = `${step.output} has not been written yet. Reopen the chat and try again.`;
        }
        return { ok: Object.keys(errors).length === 0, errors };
    }
    async deliver(step, ctx, repos) {
        const prompt = await this.composer.compose(step, ctx, repos);
        // Written BEFORE delivery so a crash still leaves the record.
        await this.audit.append({
            kind: 'prompt-composed',
            stepId: step.id,
            data: { prompt, chars: prompt.length },
        });
        const mechanism = await this.handoff.deliver(prompt, ctx.taskDir);
        return { mechanism, promptChars: prompt.length };
    }
    async execute(step, ctx, values) {
        const outputPath = (0, node_path_1.join)(ctx.taskDir, step.output ?? '');
        return {
            outputPath,
            outputPresent: await this.fileExists(outputPath),
            mechanism: values.mechanism ?? null,
        };
    }
}
exports.AiHandoffStep = AiHandoffStep;
