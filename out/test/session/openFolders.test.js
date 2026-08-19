"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const openFolders_1 = require("../../src/session/openFolders");
const OPEN = '/Users/tarun.kumar/Documents/workspace';
(0, vitest_1.describe)('allInsideOpenFolders', () => {
    (0, vitest_1.it)('is true when every repository sits under the open folder', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)([`${OPEN}/party-service`, `${OPEN}/reference-data-service`], [OPEN])).toBe(true);
    });
    (0, vitest_1.it)('is true for a repository nested deeper', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)([`${OPEN}/team/party-service`], [OPEN])).toBe(true);
    });
    (0, vitest_1.it)('is true when the repository is itself an open folder', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)([`${OPEN}/party-service`], [`${OPEN}/party-service`])).toBe(true);
    });
    (0, vitest_1.it)('spreads across several open folders', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)(['/a/party-service', '/b/orders-service'], ['/a', '/b'])).toBe(true);
    });
    (0, vitest_1.it)('is false when even one repository is outside', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)([`${OPEN}/party-service`, '/srv/other/orders'], [OPEN])).toBe(false);
    });
    (0, vitest_1.it)('is false when nothing is open, as in an empty window', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)([`${OPEN}/party-service`], [])).toBe(false);
    });
    (0, vitest_1.it)('is false when there are no repositories to judge', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)([], [OPEN])).toBe(false);
    });
    (0, vitest_1.it)('tolerates a trailing separator on the open folder', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)([`${OPEN}/party-service`], [`${OPEN}/`])).toBe(true);
    });
    // /Users/you/workspace-old must not count as inside /Users/you/workspace.
    (0, vitest_1.it)('does not treat a sibling with a shared prefix as inside', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)([`${OPEN}-old/party-service`], [OPEN])).toBe(false);
    });
    (0, vitest_1.it)('does not treat a parent as inside its child', () => {
        (0, vitest_1.expect)((0, openFolders_1.allInsideOpenFolders)([OPEN], [`${OPEN}/party-service`])).toBe(false);
    });
});
