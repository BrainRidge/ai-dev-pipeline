"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const GitClone_1 = require("../../src/tasks/GitClone");
const fixtures_1 = require("../support/fixtures");
const clone = (0, fixtures_1.step)('gitClone', { stepType: 'commandExecution', taskType: 'gitClone' });
function sink() {
    const copied = [];
    const staged = [];
    const impl = {
        async copy(text) { copied.push(text); },
        async toTerminal(text) { staged.push(text); },
    };
    return { impl, copied, staged };
}
/** `cloned` lists the paths that already exist on disk. */
function task(cloned = [], s = sink().impl) {
    return new GitClone_1.GitClone('/code', (p) => cloned.includes(p), s);
}
const WORK = '/Users/you/work';
const ctx = (0, fixtures_1.context)({ inputs: { services: ['pis'], baseBranch: 'develop', workDir: WORK } });
const both = (0, fixtures_1.context)({
    inputs: { services: ['pis', 'ords'], baseBranch: 'develop', workDir: WORK },
});
const lines = (blocks) => blocks.flatMap((b) => b.lines);
(0, vitest_1.describe)('GitClone', () => {
    (0, vitest_1.it)('is a commandExecution step', () => {
        (0, vitest_1.expect)(task().stepType).toBe('commandExecution');
    });
    (0, vitest_1.it)('moves into the work directory, then clones with a short name', () => {
        (0, vitest_1.expect)(lines(task().plan(ctx))).toEqual([
            `mkdir -p ${WORK}`,
            `cd ${WORK}`,
            'git clone https://abc.github/payment-service.ui payment-service.ui',
            'cd payment-service.ui',
            'git checkout develop',
            'git pull',
        ]);
    });
    (0, vitest_1.it)('names the folder after the repository, not the shortCode', () => {
        const lines = task().plan(ctx)[0].lines;
        (0, vitest_1.expect)(lines.join('\n')).not.toMatch(/(^|[ /])pis($|[ /])/);
    });
    (0, vitest_1.it)('makes the work directory first, because cd into a missing one fails', () => {
        (0, vitest_1.expect)(lines(task().plan(ctx))[0]).toBe(`mkdir -p ${WORK}`);
    });
    (0, vitest_1.it)('plans a fetch instead when the repository is already cloned', () => {
        (0, vitest_1.expect)(lines(task([`${WORK}/payment-service.ui`]).plan(ctx))).toEqual([
            `cd ${WORK}/payment-service.ui`,
            'git fetch origin',
            'git checkout develop',
            'git pull',
        ]);
    });
    (0, vitest_1.it)('re-plans per render, so cloning one by hand changes what is shown', () => {
        (0, vitest_1.expect)(task([]).plan(ctx)[0].lines[0]).toMatch(/^mkdir -p/);
        (0, vitest_1.expect)(task([`${WORK}/payment-service.ui`]).plan(ctx)[0].lines[0]).toBe(`cd ${WORK}/payment-service.ui`);
    });
    (0, vitest_1.it)('follows the work directory chosen for this task', () => {
        const elsewhere = (0, fixtures_1.context)({
            inputs: { services: ['pis'], baseBranch: 'develop', workDir: '/srv/repos' },
        });
        (0, vitest_1.expect)(lines(task().plan(elsewhere))).toContain('cd /srv/repos');
    });
    (0, vitest_1.it)('falls back to the configured root for a task started before work dirs existed', () => {
        const old = (0, fixtures_1.context)({ inputs: { services: ['pis'], baseBranch: 'develop' } });
        (0, vitest_1.expect)(lines(task().plan(old))).toContain('cd /code');
    });
    (0, vitest_1.it)('checks out the base branch chosen in the sidebar, not the epic', () => {
        const other = (0, fixtures_1.context)({
            inputs: { services: ['pis'], baseBranch: 'release/2026.08', workDir: WORK },
        });
        (0, vitest_1.expect)(lines(task().plan(other))).toContain('git checkout release/2026.08');
    });
    (0, vitest_1.it)('creates no branch, because the developer said to stop on the base', () => {
        (0, vitest_1.expect)(lines(task().plan(ctx)).join('\n')).not.toContain('checkout -b');
    });
    // The block id stays the shortCode: it is what the Copy buttons address.
    (0, vitest_1.it)('gives one block per microservice, each labelled and addressable', () => {
        const blocks = task().plan(both);
        (0, vitest_1.expect)(blocks.map((b) => b.id)).toEqual(['pis', 'ords']);
        (0, vitest_1.expect)(blocks.map((b) => b.label)).toEqual([
            'Payment Service (pis)',
            'Orders Service (ords)',
        ]);
    });
    (0, vitest_1.it)('ignores a selected shortCode that is not in the catalogue', () => {
        const bogus = (0, fixtures_1.context)({ inputs: { services: ['nope'], baseBranch: 'develop', workDir: WORK } });
        (0, vitest_1.expect)(task().plan(bogus)).toEqual([]);
    });
    (0, vitest_1.it)('omits the checkout when no base branch was collected, rather than guessing one', () => {
        const bare = (0, fixtures_1.context)({ inputs: { services: ['pis'], workDir: WORK } });
        (0, vitest_1.expect)(lines(task().plan(bare))).toEqual([
            `mkdir -p ${WORK}`,
            `cd ${WORK}`,
            'git clone https://abc.github/payment-service.ui payment-service.ui',
            'cd payment-service.ui',
        ]);
    });
    (0, vitest_1.it)('names the work directory in the step text, so it is visible before running', async () => {
        (0, vitest_1.expect)((await task().describe(clone, ctx, {})).text).toContain(WORK);
    });
    (0, vitest_1.it)('offers the commands and a way to say they have been run', async () => {
        const view = await task().describe(clone, ctx, {});
        (0, vitest_1.expect)(view.commands).toHaveLength(1);
        (0, vitest_1.expect)(view.actions.map((a) => a.id)).toEqual(['back', 'submit']);
    });
});
(0, vitest_1.describe)('delivering the commands', () => {
    (0, vitest_1.it)('copies one block as pasteable text', async () => {
        const s = sink();
        const { text, label } = await task([], s.impl).deliver('pis', 'copy', ctx);
        (0, vitest_1.expect)(s.copied).toEqual([text]);
        (0, vitest_1.expect)(label).toBe('Payment Service (pis)');
        (0, vitest_1.expect)(text.split('\n')).toHaveLength(6);
    });
    (0, vitest_1.it)('stages a block at the terminal prompt instead', async () => {
        const s = sink();
        await task([], s.impl).deliver('pis', 'terminal', ctx);
        (0, vitest_1.expect)(s.staged).toHaveLength(1);
        (0, vitest_1.expect)(s.copied).toEqual([]);
    });
    (0, vitest_1.it)('joins every block for "all", separated by a blank line', async () => {
        const s = sink();
        const { text } = await task([], s.impl).deliver('all', 'copy', both);
        (0, vitest_1.expect)(text).toContain('git clone https://abc.github/payment-service.ui payment-service.ui');
        (0, vitest_1.expect)(text).toContain('git clone https://abc.github/orders-service orders-service');
        (0, vitest_1.expect)(text).toContain('\n\n');
    });
    (0, vitest_1.it)('labels the combined delivery for the progress message', async () => {
        const { label } = await task([], sink().impl).deliver('all', 'copy', both);
        (0, vitest_1.expect)(label).toBe('all 2 repositories');
    });
    (0, vitest_1.it)('rejects a block that is not in the plan', async () => {
        await (0, vitest_1.expect)(task().deliver('ghost', 'copy', ctx)).rejects.toThrow(/ghost/);
    });
});
(0, vitest_1.describe)('completing the step', async () => {
    (0, vitest_1.it)('advances on the developer’s word, since nothing is executed here', () => {
        (0, vitest_1.expect)(task().validate().ok).toBe(true);
    });
    (0, vitest_1.it)('records absolute repository paths, which the workspace file needs', async () => {
        const result = await task().execute(clone, both, {});
        (0, vitest_1.expect)(result.repos).toEqual([
            { name: 'payment-service.ui', path: `${WORK}/payment-service.ui` },
            { name: 'orders-service', path: `${WORK}/orders-service` },
        ]);
        (0, vitest_1.expect)(result.branch).toBe('develop');
    });
    (0, vitest_1.it)('records the exact commands it showed, which is all the audit can prove', async () => {
        const result = await task().execute(clone, ctx, {});
        const shown = result.commands;
        (0, vitest_1.expect)(shown[0].lines[0]).toBe(`mkdir -p ${WORK}`);
    });
});
