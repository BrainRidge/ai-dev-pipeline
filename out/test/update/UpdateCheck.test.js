"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const UpdateCheck_1 = require("../../src/update/UpdateCheck");
(0, vitest_1.describe)('isNewer', () => {
    (0, vitest_1.it)('compares semver numerically, not lexically', () => {
        (0, vitest_1.expect)((0, UpdateCheck_1.isNewer)('0.9.0', '0.10.0')).toBe(true);
    });
    (0, vitest_1.it)('is false for identical versions', () => {
        (0, vitest_1.expect)((0, UpdateCheck_1.isNewer)('1.2.3', '1.2.3')).toBe(false);
    });
    (0, vitest_1.it)('is false when the manifest is behind', () => {
        (0, vitest_1.expect)((0, UpdateCheck_1.isNewer)('2.0.0', '1.9.9')).toBe(false);
    });
    (0, vitest_1.it)('handles patch-level differences', () => {
        (0, vitest_1.expect)((0, UpdateCheck_1.isNewer)('1.0.0', '1.0.1')).toBe(true);
    });
});
(0, vitest_1.describe)('checkForUpdate', () => {
    (0, vitest_1.it)('is skipped when no manifest url is configured', async () => {
        (0, vitest_1.expect)(await (0, UpdateCheck_1.checkForUpdate)({
            manifestUrl: '',
            currentVersion: '1.0.0',
            fetchJson: async () => ({ version: '2.0.0' }),
        })).toBeUndefined();
    });
    (0, vitest_1.it)('returns the newer version when one exists', async () => {
        (0, vitest_1.expect)(await (0, UpdateCheck_1.checkForUpdate)({
            manifestUrl: 'https://x/m.json',
            currentVersion: '1.0.0',
            fetchJson: async () => ({ version: '1.1.0' }),
        })).toBe('1.1.0');
    });
    (0, vitest_1.it)('returns undefined when already current', async () => {
        (0, vitest_1.expect)(await (0, UpdateCheck_1.checkForUpdate)({
            manifestUrl: 'https://x/m.json',
            currentVersion: '1.1.0',
            fetchJson: async () => ({ version: '1.1.0' }),
        })).toBeUndefined();
    });
    (0, vitest_1.it)('stays silent when the manifest is unreachable', async () => {
        (0, vitest_1.expect)(await (0, UpdateCheck_1.checkForUpdate)({
            manifestUrl: 'https://x/m.json',
            currentVersion: '1.0.0',
            fetchJson: async () => {
                throw new Error('offline');
            },
        })).toBeUndefined();
    });
});
