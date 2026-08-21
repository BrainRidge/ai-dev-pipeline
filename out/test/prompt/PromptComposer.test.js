"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const PromptComposer_1 = require("../../src/prompt/PromptComposer");
const ContentRoot_1 = require("../../src/content/ContentRoot");
const fixtures_1 = require("../support/fixtures");
const TEMPLATE = `---
output: 02-analysis.md
---
Analysing for {{task.platform}}.
Story: {{requirement.story}}
Notes: {{requirement.notes}}
Services: {{task.services}}
`;
/** Templates are found by convention at <workflowId>/<stepId>.md. */
async function composer(body = TEMPLATE) {
    const dir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'pr-'));
    await (0, promises_1.mkdir)((0, node_path_1.join)(dir, 'researchTaskWorkflow'), { recursive: true });
    await (0, promises_1.writeFile)((0, node_path_1.join)(dir, 'researchTaskWorkflow', 'aiHandoff.md'), body);
    return new PromptComposer_1.PromptComposer((0, fixtures_1.bundledResolver)(dir));
}
const answers = {
    requirement: { story: 'PLAT-1 body', notes: 'said in refinement' },
};
const ctx = (0, fixtures_1.context)({
    inputs: { services: ['pis', 'ords'] },
    answersOf: (id) => answers[id] ?? {},
});
const handoff = (0, fixtures_1.step)('aiHandoff', { stepType: 'aiHandoff', taskType: 'invokeCopilot' });
const repos = [{ name: 'pis', path: '/code/pis' }];
(0, vitest_1.describe)('PromptComposer', () => {
    (0, vitest_1.it)('finds the template by workflow and step, so a new workflow needs no code', async () => {
        (0, vitest_1.expect)((await (await composer()).compose(handoff, ctx, repos)).prompt).toContain('Analysing for canada-assisted.');
    });
    (0, vitest_1.it)('resolves step and task placeholders', async () => {
        const { prompt } = await (await composer()).compose(handoff, ctx, repos);
        (0, vitest_1.expect)(prompt).toContain('Story: PLAT-1 body');
        (0, vitest_1.expect)(prompt).toContain('Notes: said in refinement');
    });
    (0, vitest_1.it)('joins array answers readably', async () => {
        const { prompt } = await (await composer()).compose(handoff, ctx, repos);
        (0, vitest_1.expect)(prompt).toContain('Services: pis, ords');
    });
    (0, vitest_1.it)('keeps the frontmatter out of the prompt', async () => {
        const { prompt } = await (await composer()).compose(handoff, ctx, repos);
        (0, vitest_1.expect)(prompt).not.toContain('output: 02-analysis.md');
        (0, vitest_1.expect)(prompt.startsWith('Analysing for')).toBe(true);
    });
    (0, vitest_1.it)('takes the output contract from the template, not from code', async () => {
        (0, vitest_1.expect)(await (await composer()).outputFor(handoff, ctx)).toBe('02-analysis.md');
    });
    (0, vitest_1.it)('appends the four parts in order', async () => {
        const { prompt } = await (await composer()).compose(handoff, ctx, repos);
        const iTemplate = prompt.indexOf('Analysing for');
        const iPaths = prompt.indexOf('/code/pis');
        const iScope = prompt.indexOf('Work only within');
        const iOutput = prompt.indexOf('02-analysis.md');
        (0, vitest_1.expect)(iTemplate).toBeLessThan(iPaths);
        (0, vitest_1.expect)(iPaths).toBeLessThan(iScope);
        (0, vitest_1.expect)(iScope).toBeLessThan(iOutput);
    });
    (0, vitest_1.it)('emits #file references for each repo', async () => {
        const { prompt } = await (await composer()).compose(handoff, ctx, repos);
        (0, vitest_1.expect)(prompt).toContain('#file:/code/pis');
    });
    (0, vitest_1.it)('states the absolute output path', async () => {
        const { prompt } = await (await composer()).compose(handoff, ctx, repos);
        (0, vitest_1.expect)(prompt).toContain('/tasks/T-1/02-analysis.md');
    });
    (0, vitest_1.it)('renders a missing answer as empty rather than "undefined"', async () => {
        const bare = (0, fixtures_1.context)({ answersOf: () => ({}) });
        const { prompt } = await (await composer()).compose(handoff, bare, repos);
        (0, vitest_1.expect)(prompt).not.toContain('undefined');
    });
    (0, vitest_1.it)('is deterministic', async () => {
        const c = await composer();
        const first = await c.compose(handoff, ctx, repos);
        (0, vitest_1.expect)((await c.compose(handoff, ctx, repos)).prompt).toBe(first.prompt);
    });
    (0, vitest_1.it)('rejects an output key that is present but unusable', async () => {
        const c = await composer('---\noutput: "  "\n---\nBody.\n');
        await (0, vitest_1.expect)(c.compose(handoff, ctx, repos)).rejects.toThrow(/unusable/);
    });
});
/**
 * A handoff that edits code produces no document, so its template declares no
 * output and the prompt carries no file contract to invent one.
 */
(0, vitest_1.describe)('a template with no output declared', async () => {
    (0, vitest_1.it)('composes without frontmatter at all', async () => {
        const { prompt } = await (await composer('Just do it for {{task.epic}}.\n')).compose(handoff, ctx, repos);
        (0, vitest_1.expect)(prompt).toContain('Just do it for PLAT-1234.');
    });
    (0, vitest_1.it)('reports no output file', async () => {
        const c = await composer('Just do it.\n');
        (0, vitest_1.expect)((await c.compose(handoff, ctx, repos)).outputFile).toBeUndefined();
    });
    (0, vitest_1.it)('instructs the model to change code in place instead', async () => {
        const { prompt } = await (await composer('Just do it.\n')).compose(handoff, ctx, repos);
        (0, vitest_1.expect)(prompt).toContain('Change the code in place');
        (0, vitest_1.expect)(prompt).not.toContain('Create the file if it does not exist');
    });
    (0, vitest_1.it)('still constrains the scope, which is the part that must not be optional', async () => {
        const { prompt } = await (await composer('Just do it.\n')).compose(handoff, ctx, repos);
        (0, vitest_1.expect)(prompt).toContain('Work only within');
        (0, vitest_1.expect)(prompt).toContain('#file:/code/pis');
    });
    (0, vitest_1.it)('refuses to answer outputFor, because a watched step needs a filename', async () => {
        const c = await composer('Just do it.\n');
        await (0, vitest_1.expect)(c.outputFor(handoff, ctx)).rejects.toThrow(/must declare "output:"/);
    });
});
/**
 * A bundled directory and a team directory, so resolution has something to
 * choose between. Returns both paths so tests can assert which one won.
 */
async function twoSources(opts) {
    const bundledDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'bundled-'));
    await (0, promises_1.mkdir)((0, node_path_1.join)(bundledDir, 'researchTaskWorkflow'), { recursive: true });
    await (0, promises_1.writeFile)((0, node_path_1.join)(bundledDir, 'researchTaskWorkflow', 'aiHandoff.md'), TEMPLATE);
    const contentRoot = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'team-'));
    if (opts.external !== undefined) {
        await (0, promises_1.mkdir)((0, node_path_1.join)(contentRoot, 'prompts', 'researchTaskWorkflow'), { recursive: true });
        await (0, promises_1.writeFile)((0, node_path_1.join)(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'), opts.external);
    }
    return {
        composer: new PromptComposer_1.PromptComposer((0, ContentRoot_1.templateResolver)({ promptsDir: (0, node_path_1.join)(contentRoot, 'prompts'), bundledPromptsDir: bundledDir }, ContentRoot_1.nodeProbe)),
        bundledDir,
        contentRoot,
    };
}
(0, vitest_1.describe)('where the template came from', () => {
    (0, vitest_1.it)('reports the bundled template when the team supplied none', async () => {
        const { composer, bundledDir } = await twoSources({});
        const composed = await composer.compose(handoff, ctx, repos);
        (0, vitest_1.expect)(composed.templateSource).toBe('bundled');
        (0, vitest_1.expect)(composed.templatePath).toBe((0, node_path_1.join)(bundledDir, 'researchTaskWorkflow', 'aiHandoff.md'));
    });
    (0, vitest_1.it)("uses and reports the team's template when they supplied one", async () => {
        const { composer, contentRoot } = await twoSources({
            external: '---\noutput: 02-analysis.md\n---\nOur own wording for {{task.epic}}.\n',
        });
        const composed = await composer.compose(handoff, ctx, repos);
        (0, vitest_1.expect)(composed.templateSource).toBe('external');
        (0, vitest_1.expect)(composed.templatePath).toBe((0, node_path_1.join)(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'));
        (0, vitest_1.expect)(composed.prompt).toContain('Our own wording for PLAT-1234.');
    });
    (0, vitest_1.it)('takes the output contract from whichever template won', async () => {
        const { composer } = await twoSources({ external: '---\noutput: our-analysis.md\n---\nBody.\n' });
        (0, vitest_1.expect)(await composer.outputFor(handoff, ctx)).toBe('our-analysis.md');
    });
    (0, vitest_1.it)('answers resolved() without composing, for callers that only need the path', async () => {
        const { composer, contentRoot } = await twoSources({ external: 'Body.\n' });
        (0, vitest_1.expect)(await composer.resolved(handoff, ctx)).toEqual({
            path: (0, node_path_1.join)(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'),
            source: 'external',
        });
    });
    // The guard from Task 0, seen from where a developer would actually hit it.
    (0, vitest_1.it)('surfaces a case-mismatched override as a composition failure', async () => {
        const bundledDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'bundled-'));
        await (0, promises_1.mkdir)((0, node_path_1.join)(bundledDir, 'researchTaskWorkflow'), { recursive: true });
        await (0, promises_1.writeFile)((0, node_path_1.join)(bundledDir, 'researchTaskWorkflow', 'aiHandoff.md'), TEMPLATE);
        const contentRoot = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'team-'));
        await (0, promises_1.mkdir)((0, node_path_1.join)(contentRoot, 'prompts', 'researchTaskWorkflow'), { recursive: true });
        await (0, promises_1.writeFile)((0, node_path_1.join)(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.MD'), 'Body.\n');
        const composer = new PromptComposer_1.PromptComposer((0, ContentRoot_1.templateResolver)({ promptsDir: (0, node_path_1.join)(contentRoot, 'prompts'), bundledPromptsDir: bundledDir }, ContentRoot_1.nodeProbe));
        await (0, vitest_1.expect)(composer.compose(handoff, ctx, repos)).rejects.toThrow(/found "aiHandoff\.MD".*expected "aiHandoff\.md"/);
    });
});
