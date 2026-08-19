"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const GitOpsStep_1 = require("../../src/steps/GitOpsStep");
class FakeGit {
    calls = [];
    async run(args, cwd) {
        this.calls.push({ args, cwd });
        return { code: 0, stdout: '', stderr: '' };
    }
}
const platform = {
    id: 'p',
    label: 'P',
    services: [
        { id: 'payments', label: 'Payments', gitUrl: 'git@x:payments.git' },
        { id: 'orders', label: 'Orders', gitUrl: 'git@x:orders.git' },
    ],
};
const step = {
    id: 'checkout',
    kind: 'git-ops',
    title: 'Get the code',
    repos: '{{scope.services}}',
    ops: ['clone', 'checkout'],
    branch: '{{task.epic}}-research',
};
const ctx = {
    platform,
    taskDir: '/tmp/t',
    epic: 'PLAT-1234',
    taskId: 'PLAT-1234-research-20260814-01',
    inputs: { services: ['payments'] },
    answersOf: (id) => (id === 'scope' ? { services: ['payments'] } : {}),
};
(0, vitest_1.describe)('GitOpsStep', () => {
    (0, vitest_1.it)('clones only the selected services', async () => {
        const git = new FakeGit();
        const result = await new GitOpsStep_1.GitOpsStep(git, '/code').execute(step, ctx, {});
        (0, vitest_1.expect)(git.calls[0].args).toEqual(['clone', 'git@x:payments.git', '/code/payments']);
        (0, vitest_1.expect)(result.repos).toEqual([{ name: 'payments', path: '/code/payments' }]);
    });
    (0, vitest_1.it)('resolves the branch placeholder from the task epic', async () => {
        const git = new FakeGit();
        await new GitOpsStep_1.GitOpsStep(git, '/code').execute(step, ctx, {});
        (0, vitest_1.expect)(git.calls[1].args).toEqual(['checkout', '-B', 'PLAT-1234-research']);
    });
    (0, vitest_1.it)('runs non-clone operations inside the repo directory', async () => {
        const git = new FakeGit();
        await new GitOpsStep_1.GitOpsStep(git, '/code').execute(step, ctx, {});
        (0, vitest_1.expect)(git.calls[0].cwd).toBeUndefined();
        (0, vitest_1.expect)(git.calls[1].cwd).toBe('/code/payments');
    });
    (0, vitest_1.it)('handles multiple selected services', async () => {
        const git = new FakeGit();
        const multi = { ...ctx, answersOf: () => ({ services: ['payments', 'orders'] }) };
        const result = await new GitOpsStep_1.GitOpsStep(git, '/code').execute(step, multi, {});
        (0, vitest_1.expect)(result.repos).toHaveLength(2);
    });
    (0, vitest_1.it)('ignores a selected service that is not in the platform', async () => {
        const git = new FakeGit();
        const bogus = { ...ctx, answersOf: () => ({ services: ['nope'] }) };
        const result = await new GitOpsStep_1.GitOpsStep(git, '/code').execute(step, bogus, {});
        (0, vitest_1.expect)(result.repos).toEqual([]);
        (0, vitest_1.expect)(git.calls).toEqual([]);
    });
    (0, vitest_1.it)('reports a failed operation rather than throwing', async () => {
        const failing = {
            async run() {
                return { code: 128, stdout: '', stderr: 'fatal: repository not found' };
            },
        };
        const result = await new GitOpsStep_1.GitOpsStep(failing, '/code').execute(step, ctx, {});
        const failures = result.failures;
        (0, vitest_1.expect)(failures).toHaveLength(2);
        (0, vitest_1.expect)(failures[0].stderr).toContain('repository not found');
        (0, vitest_1.expect)(failures[0].repo).toBe('payments');
    });
    (0, vitest_1.it)('describes what it will do without running anything', () => {
        const git = new FakeGit();
        const view = new GitOpsStep_1.GitOpsStep(git, '/code').describe(step, ctx, {});
        (0, vitest_1.expect)(view.text).toContain('clone, checkout');
        (0, vitest_1.expect)(view.actions.map((a) => a.id)).toEqual(['back', 'submit']);
        (0, vitest_1.expect)(git.calls).toEqual([]);
    });
});
