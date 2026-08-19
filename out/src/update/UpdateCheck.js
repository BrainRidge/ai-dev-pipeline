"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNewer = isNewer;
exports.checkForUpdate = checkForUpdate;
function isNewer(current, latest) {
    const a = current.split('.').map(Number);
    const b = latest.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        if (bv > av)
            return true;
        if (bv < av)
            return false;
    }
    return false;
}
/**
 * Distribution is a .vsix installed by hand, so there is no auto-update and
 * versions will drift across a large team. This check mitigates that; it does
 * not solve it. See spec Section 13.
 *
 * An unset manifest url disables the check entirely, and a network failure is
 * silent — never nag a developer about something they cannot fix.
 */
async function checkForUpdate(deps) {
    if (!deps.manifestUrl)
        return undefined;
    try {
        const manifest = await deps.fetchJson(deps.manifestUrl);
        return isNewer(deps.currentVersion, manifest.version) ? manifest.version : undefined;
    }
    catch {
        return undefined;
    }
}
