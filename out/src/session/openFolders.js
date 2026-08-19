"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allInsideOpenFolders = allInsideOpenFolders;
const node_path_1 = require("node:path");
/** A path is covered when it is an open folder or sits anywhere beneath one. */
function isInside(path, folder) {
    const root = folder.endsWith(node_path_1.sep) ? folder.slice(0, -node_path_1.sep.length) : folder;
    return path === root || path.startsWith(root + node_path_1.sep);
}
/**
 * Whether the window already shows every repository the task needs.
 *
 * The generated multi-root workspace exists so Copilot can see repositories
 * that are scattered across unrelated folders. When the developer is already
 * sitting in a window that contains them all, generating one buys nothing and
 * costs a reload — so the offer is skipped.
 *
 * Every repository must be covered, not merely some: a single one outside the
 * open folders is invisible to Copilot, which is the whole problem.
 */
function allInsideOpenFolders(repoPaths, openFolders) {
    if (repoPaths.length === 0 || openFolders.length === 0)
        return false;
    return repoPaths.every((path) => openFolders.some((folder) => isInside(path, folder)));
}
