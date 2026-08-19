"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const schema_1 = require("../../src/engine/schema");
const WorkflowCatalog_1 = require("../../src/engine/WorkflowCatalog");
const fixtures_1 = require("../support/fixtures");
(0, vitest_1.describe)('repoNameOf', () => {
    (0, vitest_1.it)('takes the last segment of an https URL', () => {
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('https://github.com/kumartj/reference-data-service')).toBe('reference-data-service');
    });
    (0, vitest_1.it)('strips a trailing .git', () => {
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('https://github.com/kumartj/party-service.git')).toBe('party-service');
    });
    (0, vitest_1.it)('handles the scp-like form git uses for ssh', () => {
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('git@github.com:kumartj/application-onboarding.git')).toBe('application-onboarding');
    });
    (0, vitest_1.it)('ignores a trailing slash', () => {
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('https://github.com/kumartj/orders-service/')).toBe('orders-service');
    });
    (0, vitest_1.it)('leaves a non-git suffix alone, because it is part of the name', () => {
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('https://abc.github/payment-service.ui')).toBe('payment-service.ui');
    });
    (0, vitest_1.it)('ignores a query string or fragment', () => {
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('https://host/org/repo.git?ref=main')).toBe('repo');
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('https://host/org/repo#frag')).toBe('repo');
    });
    (0, vitest_1.it)('copes with a deep path', () => {
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('https://host/a/b/c/deep-repo')).toBe('deep-repo');
    });
    (0, vitest_1.it)('returns nothing when there is no usable segment', () => {
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('')).toBeUndefined();
        (0, vitest_1.expect)((0, schema_1.repoNameOf)('https://host/')).toBeUndefined();
    });
});
(0, vitest_1.describe)('validateMicroservices', () => {
    const service = (over) => ({
        microserviceName: 'A Service',
        shortCode: 'a',
        purpose: '',
        gitLocation: 'https://host/org/a-service',
        category: '',
        subcategory: '',
        ...over,
    });
    (0, vitest_1.it)('accepts the bundled catalogue', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateMicroservices)(fixtures_1.MICROSERVICES)).not.toThrow();
    });
    (0, vitest_1.it)('rejects two services sharing a shortCode', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateMicroservices)([
            service({ microserviceName: 'First' }),
            service({ microserviceName: 'Second', gitLocation: 'https://host/org/b-service' }),
        ])).toThrow(/share the shortCode "a"/);
    });
    (0, vitest_1.it)('rejects two services that would clone into the same folder', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateMicroservices)([
            service({ microserviceName: 'Ours', shortCode: 'a', gitLocation: 'https://host/us/svc' }),
            service({ microserviceName: 'Theirs', shortCode: 'b', gitLocation: 'https://host/them/svc' }),
        ])).toThrow(/both clone into "svc"/);
    });
    (0, vitest_1.it)('names both offenders, so the fix is obvious', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateMicroservices)([
            service({ microserviceName: 'Ours', shortCode: 'a', gitLocation: 'https://host/us/svc' }),
            service({ microserviceName: 'Theirs', shortCode: 'b', gitLocation: 'https://host/them/svc' }),
        ])).toThrow(/Ours.*Theirs|Theirs.*Ours/);
    });
    (0, vitest_1.it)('rejects a git location with no repository name', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateMicroservices)([service({ gitLocation: 'https://host/' })])).toThrow(/no repository name/);
    });
    (0, vitest_1.it)('treats .git and bare forms of the same repo as a clash', () => {
        (0, vitest_1.expect)(() => (0, WorkflowCatalog_1.validateMicroservices)([
            service({ shortCode: 'a', gitLocation: 'https://host/org/svc' }),
            service({ shortCode: 'b', gitLocation: 'https://host/org/svc.git' }),
        ])).toThrow(/both clone into "svc"/);
    });
});
