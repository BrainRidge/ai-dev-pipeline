"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const ContentRoot_1 = require("../../src/content/ContentRoot");
function settings(over = {}) {
    return {
        contentRoot: '',
        microserviceConfig: '',
        platformConfig: '',
        customPrompts: '',
        ...over,
    };
}
(0, vitest_1.describe)('what a content root derives', () => {
    (0, vitest_1.it)('places each piece where the template puts it', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.derivedFrom)('/team')).toEqual({
            microserviceConfig: '/team/config/microservices.json',
            platformConfig: '/team/config/platforms.json',
            customPrompts: '/team/prompts',
        });
    });
});
(0, vitest_1.describe)('resolving a required config file', () => {
    (0, vitest_1.it)('names its own setting, and the root that would fill it in', () => {
        const r = (0, ContentRoot_1.resolveConfigFile)('microserviceConfig', settings());
        (0, vitest_1.expect)(r.ok).toBe(false);
        (0, vitest_1.expect)(r.ok === false && r.message).toBe('No microservice config configured. Set aiDevWorkflow.microserviceConfig in ' +
            'Settings → Extensions → AI Dev Workflow, or set Content Root to fill it in.');
    });
    (0, vitest_1.it)('names the platform setting when that is the missing one', () => {
        const r = (0, ContentRoot_1.resolveConfigFile)('platformConfig', settings());
        (0, vitest_1.expect)(r.ok === false && r.message).toContain('aiDevWorkflow.platformConfig');
    });
    (0, vitest_1.it)('derives from the content root when the piece has no setting of its own', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.resolveConfigFile)('microserviceConfig', settings({ contentRoot: '/team' }))).toEqual({
            ok: true,
            path: '/team/config/microservices.json',
        });
    });
    // Reading never depends on the derived value having been written into
    // settings, so hand-editing settings.json works and a failed write costs
    // nothing.
    (0, vitest_1.it)("prefers the piece's own setting over the content root", () => {
        const s = settings({ contentRoot: '/team', microserviceConfig: '/shared/services.json' });
        (0, vitest_1.expect)((0, ContentRoot_1.resolveConfigFile)('microserviceConfig', s)).toEqual({
            ok: true,
            path: '/shared/services.json',
        });
    });
    (0, vitest_1.it)('rejects a relative path in the piece, quoting what was given', () => {
        const r = (0, ContentRoot_1.resolveConfigFile)('microserviceConfig', settings({ microserviceConfig: './s.json' }));
        (0, vitest_1.expect)(r.ok === false && r.message).toBe('aiDevWorkflow.microserviceConfig must be an absolute path. Got "./s.json".');
    });
    (0, vitest_1.it)('blames the content root when that is the relative one', () => {
        const r = (0, ContentRoot_1.resolveConfigFile)('platformConfig', settings({ contentRoot: './team' }));
        (0, vitest_1.expect)(r.ok === false && r.message).toBe('aiDevWorkflow.contentRoot must be an absolute path. Got "./team".');
    });
    (0, vitest_1.it)('trims whitespace a pasted path carries', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.resolveConfigFile)('platformConfig', settings({ platformConfig: '  /a/p.json ' }))).toEqual({ ok: true, path: '/a/p.json' });
    });
});
/**
 * Prompts fall back per file to the bundled ones, so "not configured" is an
 * ordinary outcome rather than an error. "Configured badly" still is.
 */
(0, vitest_1.describe)('resolving the prompts folder', () => {
    (0, vitest_1.it)('reports none when neither it nor a content root is set', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.resolvePromptsDir)(settings())).toEqual({ kind: 'none' });
    });
    (0, vitest_1.it)('derives from the content root', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.resolvePromptsDir)(settings({ contentRoot: '/team' }))).toEqual({
            kind: 'dir',
            path: '/team/prompts',
        });
    });
    (0, vitest_1.it)('prefers its own setting, which is how a team shares one prompts repo', () => {
        const s = settings({ contentRoot: '/team', customPrompts: '/shared/prompts' });
        (0, vitest_1.expect)((0, ContentRoot_1.resolvePromptsDir)(s)).toEqual({ kind: 'dir', path: '/shared/prompts' });
    });
    (0, vitest_1.it)('reports a relative path rather than quietly using the bundled prompts', () => {
        const r = (0, ContentRoot_1.resolvePromptsDir)(settings({ customPrompts: 'prompts' }));
        (0, vitest_1.expect)(r.kind).toBe('error');
        (0, vitest_1.expect)(r.kind === 'error' && r.message).toContain('aiDevWorkflow.customPrompts');
    });
});
/**
 * Setting the content root writes the three derived paths into settings. The
 * rule that makes that safe is that it only ever overwrites its own work.
 */
(0, vitest_1.describe)('deciding which fields to write', () => {
    const derived = (0, ContentRoot_1.derivedFrom)('/team');
    const empty = {
        microserviceConfig: '',
        platformConfig: '',
        customPrompts: '',
    };
    (0, vitest_1.it)('fills in every empty field', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.fieldsToWrite)(empty, derived, {})).toEqual(derived);
    });
    (0, vitest_1.it)('updates a field that still holds what it last wrote', () => {
        const previous = (0, ContentRoot_1.derivedFrom)('/old');
        const written = (0, ContentRoot_1.fieldsToWrite)({ ...empty, customPrompts: previous.customPrompts }, derived, {
            customPrompts: previous.customPrompts,
        });
        (0, vitest_1.expect)(written.customPrompts).toBe('/team/prompts');
    });
    // The whole point of the rule: a hand-picked prompts folder must not silently
    // revert the next time the content root changes.
    (0, vitest_1.it)('leaves a field the developer chose themselves alone', () => {
        const written = (0, ContentRoot_1.fieldsToWrite)({ ...empty, customPrompts: '/shared/prompts' }, derived, { customPrompts: '/old/prompts' });
        (0, vitest_1.expect)(written.customPrompts).toBeUndefined();
        (0, vitest_1.expect)(written.microserviceConfig).toBe('/team/config/microservices.json');
    });
    (0, vitest_1.it)('writes nothing when everything already holds the derived value', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.fieldsToWrite)({ ...derived }, derived, derived)).toEqual({});
    });
    (0, vitest_1.it)('treats a whitespace-only field as empty', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.fieldsToWrite)({ ...empty, platformConfig: '   ' }, derived, {}).platformConfig).toBe('/team/config/platforms.json');
    });
});
/** A disk that exists only in this test: directory path -> filenames. */
function probeOf(dirs) {
    return { async list(dir) { return dirs[dir]; } };
}
const BUNDLED = '/ext/prompts';
const PROMPTS = '/team/prompts';
(0, vitest_1.describe)('resolving a prompt template', () => {
    (0, vitest_1.it)('uses the bundled template when no prompts folder is configured', async () => {
        const resolve = (0, ContentRoot_1.templateResolver)({ bundledPromptsDir: BUNDLED }, probeOf({}));
        (0, vitest_1.expect)(await resolve('researchTaskWorkflow', 'aiHandoff')).toEqual({
            path: '/ext/prompts/researchTaskWorkflow/aiHandoff.md',
            source: 'bundled',
        });
    });
    (0, vitest_1.it)('uses the bundled template when the team has no folder for that workflow', async () => {
        const resolve = (0, ContentRoot_1.templateResolver)({ promptsDir: PROMPTS, bundledPromptsDir: BUNDLED }, probeOf({}));
        (0, vitest_1.expect)((await resolve('researchTaskWorkflow', 'aiHandoff')).source).toBe('bundled');
    });
    // Per file, not per directory: overriding one prompt must not mean adopting
    // every other one and letting them go stale. See spec Section 16.
    (0, vitest_1.it)('falls back per file when the folder exists but that template does not', async () => {
        const resolve = (0, ContentRoot_1.templateResolver)({ promptsDir: PROMPTS, bundledPromptsDir: BUNDLED }, probeOf({ '/team/prompts/newFeatureWorkflow': ['CodeReview.md'] }));
        (0, vitest_1.expect)(await resolve('newFeatureWorkflow', 'aiHandoff')).toEqual({
            path: '/ext/prompts/newFeatureWorkflow/aiHandoff.md',
            source: 'bundled',
        });
    });
    (0, vitest_1.it)("uses the team's template when they have supplied one", async () => {
        const resolve = (0, ContentRoot_1.templateResolver)({ promptsDir: PROMPTS, bundledPromptsDir: BUNDLED }, probeOf({ '/team/prompts/researchTaskWorkflow': ['aiHandoff.md'] }));
        (0, vitest_1.expect)(await resolve('researchTaskWorkflow', 'aiHandoff')).toEqual({
            path: '/team/prompts/researchTaskWorkflow/aiHandoff.md',
            source: 'external',
        });
    });
    /**
     * The one mistake silent fallback must not hide. On a case-insensitive
     * filesystem this resolves and the team's prompt runs; on a case-sensitive
     * one it does not, and they would get the bundled prompt while believing
     * otherwise. See spec Section 16.
     */
    (0, vitest_1.it)('refuses a template that differs only by case, naming both names', async () => {
        const resolve = (0, ContentRoot_1.templateResolver)({ promptsDir: PROMPTS, bundledPromptsDir: BUNDLED }, probeOf({ '/team/prompts/researchTaskWorkflow': ['aiHandoff.MD'] }));
        await (0, vitest_1.expect)(resolve('researchTaskWorkflow', 'aiHandoff')).rejects.toThrow('found "aiHandoff.MD" in /team/prompts/researchTaskWorkflow, expected "aiHandoff.md"');
    });
    (0, vitest_1.it)('prefers an exact match over a case variant sitting beside it', async () => {
        const resolve = (0, ContentRoot_1.templateResolver)({ promptsDir: PROMPTS, bundledPromptsDir: BUNDLED }, probeOf({ '/team/prompts/researchTaskWorkflow': ['aiHandoff.MD', 'aiHandoff.md'] }));
        (0, vitest_1.expect)((await resolve('researchTaskWorkflow', 'aiHandoff')).source).toBe('external');
    });
});
(0, vitest_1.describe)('externalWorkflowsPresent', () => {
    // Workflows stay bundled. A team may reasonably expect otherwise, so their
    // folder is reported rather than ignored in silence. See spec Section 16.
    (0, vitest_1.it)('is true when the team has put a workflows folder in their content root', async () => {
        (0, vitest_1.expect)(await (0, ContentRoot_1.externalWorkflowsPresent)('/team', probeOf({ '/team/workflows': ['mine_1_0.json'] }))).toBe(true);
    });
    (0, vitest_1.it)('is false when they have not', async () => {
        (0, vitest_1.expect)(await (0, ContentRoot_1.externalWorkflowsPresent)('/team', probeOf({}))).toBe(false);
    });
    (0, vitest_1.it)('is true even for an empty folder, because the intent is the signal', async () => {
        (0, vitest_1.expect)(await (0, ContentRoot_1.externalWorkflowsPresent)('/team', probeOf({ '/team/workflows': [] }))).toBe(true);
    });
});
(0, vitest_1.describe)('templateNote', () => {
    (0, vitest_1.it)('marks a team template as external', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.templateNote)({ path: '/team/prompts/w/s.md', source: 'external' })).toBe('Template: /team/prompts/w/s.md (external)');
    });
    (0, vitest_1.it)('says plainly when the bundled default was used', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.templateNote)({ path: '/ext/prompts/w/s.md', source: 'bundled' })).toBe('Template: /ext/prompts/w/s.md (bundled default)');
    });
});
(0, vitest_1.describe)('resolveAll', () => {
    (0, vitest_1.it)('reports every path once all three are usable', () => {
        (0, vitest_1.expect)((0, ContentRoot_1.resolveAll)(settings({ contentRoot: '/team' }))).toEqual({
            ok: true,
            microserviceConfig: '/team/config/microservices.json',
            platformConfig: '/team/config/platforms.json',
            promptsDir: '/team/prompts',
        });
    });
    (0, vitest_1.it)('leaves promptsDir undefined when the team supplied none', () => {
        const r = (0, ContentRoot_1.resolveAll)(settings({ microserviceConfig: '/a/m.json', platformConfig: '/a/p.json' }));
        (0, vitest_1.expect)(r.ok === true && r.promptsDir).toBeUndefined();
    });
    (0, vitest_1.it)('reports the microservice config first, since it is the one that names repos', () => {
        const r = (0, ContentRoot_1.resolveAll)(settings());
        (0, vitest_1.expect)(r.ok === false && r.message).toContain('aiDevWorkflow.microserviceConfig');
    });
    // Carrying on with the bundled prompts is the silent fallback this design
    // exists to avoid.
    (0, vitest_1.it)('stops for a broken prompts setting too, rather than using the bundled ones', () => {
        const r = (0, ContentRoot_1.resolveAll)(settings({ contentRoot: '/team', customPrompts: 'relative' }));
        (0, vitest_1.expect)(r.ok).toBe(false);
        (0, vitest_1.expect)(r.ok === false && r.message).toContain('aiDevWorkflow.customPrompts');
    });
});
