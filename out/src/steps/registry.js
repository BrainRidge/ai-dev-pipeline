"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRegistry = buildRegistry;
function buildRegistry(handlers) {
    return new Map(handlers.map((h) => [h.kind, h]));
}
