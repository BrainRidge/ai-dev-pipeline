"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitiseEpic = sanitiseEpic;
exports.buildTaskId = buildTaskId;
/**
 * Task ids are used as folder names, workspace filenames and audit keys,
 * so they must be filesystem-safe. See spec Section 7.
 */
function sanitiseEpic(epic) {
    return epic.replace(/[^A-Za-z0-9._-]/g, '-');
}
function buildTaskId(epic, workflowId, date, counter) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const nn = String(counter).padStart(2, '0');
    return `${sanitiseEpic(epic)}-${workflowId}-${y}${m}${d}-${nn}`;
}
