"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reposBefore = reposBefore;
/**
 * The repositories a step behind this one reported cloning.
 *
 * A handoff needs these for the prompt's path map, and finding them here keeps
 * TaskSession from having to know which step produces what — the same reason
 * ManualReview looks backwards for its artifact.
 */
function reposBefore(ctx, stepId) {
    const index = ctx.order.indexOf(stepId);
    const behind = index < 0 ? ctx.order : ctx.order.slice(0, index);
    for (const id of [...behind].reverse()) {
        const repos = ctx.resultOf(id).repos;
        if (Array.isArray(repos))
            return repos;
    }
    return [];
}
