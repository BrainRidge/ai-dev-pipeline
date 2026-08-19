"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRegistry = void 0;
class ProviderRegistry {
    providers = new Map();
    register(p) {
        this.providers.set(p.name, p);
    }
    get(name) {
        const p = this.providers.get(name);
        if (!p)
            throw new Error(`unknown provider: ${name}`);
        return p;
    }
}
exports.ProviderRegistry = ProviderRegistry;
