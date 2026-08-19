"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualProvider = void 0;
/** Renders as a plain input. The developer supplies the value by hand. */
class ManualProvider {
    name = 'manual';
    async options(_field) {
        return undefined;
    }
}
exports.ManualProvider = ManualProvider;
