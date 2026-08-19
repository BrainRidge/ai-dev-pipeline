"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitOpsStep = void 0;
const node_path_1 = require("node:path");
const placeholders_1 = require("../engine/placeholders");
class GitOpsStep {
    git;
    codeRoot;
    kind = 'git-ops';
    constructor(git, codeRoot) {
        this.git = git;
        this.codeRoot = codeRoot;
    }
    describe(step, _ctx, _values) {
        return {
            text: `This will run ${(step.ops ?? []).join(', ')} on the repositories you selected.`,
            actions: [
                { id: 'back', label: 'Back' },
                { id: 'submit', label: 'Run git commands', primary: true },
            ],
        };
    }
    validate() {
        return { ok: true, errors: {} };
    }
    async execute(step, ctx, _values) {
        const selected = (0, placeholders_1.resolveList)(step.repos ?? '', ctx);
        const branch = (0, placeholders_1.resolveText)(step.branch ?? '', ctx);
        const repos = [];
        const failures = [];
        for (const id of selected) {
            const service = ctx.platform.services.find((s) => s.id === id);
            if (!service)
                continue;
            const path = (0, node_path_1.join)(this.codeRoot, service.id);
            for (const op of step.ops ?? []) {
                const args = op === 'clone'
                    ? ['clone', service.gitUrl, path]
                    : op === 'checkout'
                        ? ['checkout', '-B', branch]
                        : op === 'branch'
                            ? ['branch', branch]
                            : ['pull'];
                const cwd = op === 'clone' ? undefined : path;
                const result = await this.git.run(args, cwd);
                if (result.code !== 0)
                    failures.push({ ...result, repo: service.id, op });
            }
            repos.push({ name: service.id, path });
        }
        return { repos, branch, failures };
    }
}
exports.GitOpsStep = GitOpsStep;
