"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const Provider_1 = require("../../src/providers/Provider");
const ManualProvider_1 = require("../../src/providers/ManualProvider");
(0, vitest_1.describe)('ProviderRegistry', () => {
    (0, vitest_1.it)('resolves a registered provider by name', () => {
        const registry = new Provider_1.ProviderRegistry();
        registry.register(new ManualProvider_1.ManualProvider());
        (0, vitest_1.expect)(registry.get('manual').name).toBe('manual');
    });
    (0, vitest_1.it)('throws for an unknown provider', () => {
        (0, vitest_1.expect)(() => new Provider_1.ProviderRegistry().get('jira-mcp')).toThrow(/unknown provider/);
    });
    (0, vitest_1.it)('manual provider offers no options, meaning free entry', async () => {
        const options = await new ManualProvider_1.ManualProvider().options({
            id: 'story',
            type: 'textarea',
            label: 'JIRA story',
        });
        (0, vitest_1.expect)(options).toBeUndefined();
    });
});
