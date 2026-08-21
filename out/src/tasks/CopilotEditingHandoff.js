"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotEditingHandoff = void 0;
const history_1 = require("./history");
const promptBlock_1 = require("./promptBlock");
/**
 * A handoff whose product is edits to the repositories, not a document.
 *
 * This is where spec D9 has to give. A step that writes a file can require two
 * independent signals — the file appears AND the developer confirms — and the
 * file is the honest one. Here there is no file, so completion rests on the
 * developer's word alone. The prompt is still composed deterministically and
 * logged in full before it leaves, so the audit trail still answers what was
 * asked; it no longer independently corroborates that anything was done.
 *
 * Subclasses differ only in the name a workflow references and the title the
 * developer reads, which is why they are three lines each.
 */
class CopilotEditingHandoff {
    composer;
    handoff;
    audit;
    sink;
    stepType = 'aiHandoff';
    constructor(composer, handoff, audit, sink) {
        this.composer = composer;
        this.handoff = handoff;
        this.audit = audit;
        this.sink = sink;
    }
    async describe(step, ctx, values) {
        const { block, failure } = await (0, promptBlock_1.composePreview)(this.composer, step, ctx, (0, promptBlock_1.editedPrompt)(values));
        return {
            text: failure
                ? `The prompt could not be composed: ${failure}`
                : `${this.instruction} Mark this step done once Copilot has finished and you have looked at what it changed.`,
            commands: block ? [block] : undefined,
            actions: [
                { id: 'send', label: 'Send to Copilot' },
                { id: 'done', label: 'Done', primary: true },
            ],
        };
    }
    async copyPrompt(step, ctx, override) {
        const text = override ?? (await this.composer.compose(step, ctx, (0, history_1.reposBefore)(ctx, step.id))).prompt;
        await this.sink.copy(text);
        return { label: override ? 'your edited prompt' : 'the composed prompt', text };
    }
    validate(_step, values) {
        if (values.confirmed)
            return { ok: true, errors: {} };
        return {
            ok: false,
            errors: { confirmed: 'Mark the step done once Copilot has finished.' },
        };
    }
    async deliver(step, ctx, override) {
        const composed = await this.composer.compose(step, ctx, (0, history_1.reposBefore)(ctx, step.id));
        const prompt = override ?? composed.prompt;
        // Written BEFORE delivery so a crash still leaves the record.
        await this.audit.append({
            kind: 'prompt-composed',
            stepId: step.id,
            data: {
                prompt,
                chars: prompt.length,
                templatePath: composed.templatePath,
                templateSource: composed.templateSource,
            },
        });
        const mechanism = await this.handoff.deliver(prompt, ctx.taskDir);
        return { mechanism, promptChars: prompt.length };
    }
    async execute(_step, _ctx, values) {
        return { mechanism: values.mechanism ?? null, confirmedByDeveloper: true };
    }
}
exports.CopilotEditingHandoff = CopilotEditingHandoff;
