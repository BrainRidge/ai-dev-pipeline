"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtifactReviewStep = void 0;
const node_path_1 = require("node:path");
/**
 * Review happens in a real editor tab, not in the panel. That is why editing a
 * generated artifact works with no additional implementation, and why we do not
 * reimplement an editor badly. See spec Section 9.
 */
class ArtifactReviewStep {
    openFile;
    hashFile;
    kind = 'artifact-review';
    constructor(openFile, hashFile) {
        this.openFile = openFile;
        this.hashFile = hashFile;
    }
    describe(step, _ctx, _values) {
        return {
            text: `${step.artifact} is open in an editor tab. Read it, edit it if you want to, ` +
                `then approve it or send it back for another pass.`,
            actions: [
                { id: 'revise', label: 'Revise' },
                { id: 'approve', label: 'Approve', primary: true },
            ],
        };
    }
    async open(step, ctx) {
        await this.openFile((0, node_path_1.join)(ctx.taskDir, step.artifact ?? ''));
    }
    validate() {
        return { ok: true, errors: {} };
    }
    async execute(step, ctx, _values) {
        const path = (0, node_path_1.join)(ctx.taskDir, step.artifact ?? '');
        return { artifactPath: path, artifactHash: await this.hashFile(path), approved: true };
    }
}
exports.ArtifactReviewStep = ArtifactReviewStep;
