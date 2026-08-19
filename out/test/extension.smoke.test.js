"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const taskId_1 = require("../src/engine/taskId");
(0, vitest_1.describe)('scaffold', () => {
    (0, vitest_1.it)('exposes a taskId builder', () => {
        (0, vitest_1.expect)(typeof taskId_1.buildTaskId).toBe('function');
    });
});
