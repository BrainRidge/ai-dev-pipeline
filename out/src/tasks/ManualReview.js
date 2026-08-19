"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualReview = void 0;
const node_path_1 = require("node:path");
/**
 * Review happens in a real editor tab, not in the panel. That is why editing a
 * generated artifact works with no additional implementation, and why we do not
 * reimplement an editor badly. See spec Section 9.
 *
 * Which artifact to review is not declared anywhere: it is whatever the most
 * recent step before this one produced. That keeps the primitive generic and
 * keeps workflow authors from having to repeat a filename in two places.
 */
class ManualReview {
    openFile;
    hashFile;
    name = 'manualReview';
    stepType = 'manual';
    title = 'Review the result';
    constructor(openFile, hashFile) {
        this.openFile = openFile;
        this.hashFile = hashFile;
    }
    async describe(step, ctx, _values) {
        const path = this.artifactPath(step, ctx);
        return {
            text: path
                ? `${(0, node_path_1.basename)(path)} is open in an editor tab. Read it, edit it if you want to, ` +
                    `then approve it or send it back for another pass.`
                : 'No earlier step has produced an artifact to review yet.',
            actions: [
                { id: 'revise', label: 'Revise' },
                { id: 'approve', label: 'Approve', primary: true },
            ],
        };
    }
    validate() {
        return { ok: true, errors: {} };
    }
    async open(step, ctx) {
        const path = this.artifactPath(step, ctx);
        if (path)
            await this.openFile(path);
    }
    async execute(step, ctx, _values) {
        const artifactPath = this.artifactPath(step, ctx);
        if (!artifactPath)
            return { approved: true };
        return { artifactPath, artifactHash: await this.hashFile(artifactPath), approved: true };
    }
    /** The nearest artifact behind this step in the traversal order. */
    artifactPath(step, ctx) {
        const index = ctx.order.indexOf(step.id);
        const behind = index < 0 ? ctx.order : ctx.order.slice(0, index);
        for (const id of [...behind].reverse()) {
            const produced = ctx.resultOf(id).outputPath;
            if (typeof produced === 'string' && produced.length > 0)
                return produced;
        }
        return undefined;
    }
}
exports.ManualReview = ManualReview;
