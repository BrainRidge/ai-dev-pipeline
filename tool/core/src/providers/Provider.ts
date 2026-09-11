import type { FieldDef } from '../engine/schema'

/**
 * The MCP migration seam. Today only ManualProvider exists. When the
 * organisation enables MCP, a JiraMcpProvider registers here under a new name
 * and a field references it — with no change to WorkflowEngine, any step
 * handler, or the renderer. See spec Section 5.
 */
export interface Provider {
  readonly name: string
  /** Options to offer for this field, or undefined for free entry. */
  options(field: FieldDef): Promise<{ value: string; label: string }[] | undefined>
}

export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>()

  constructor(providers: Provider[] = []) {
    for (const p of providers) this.register(p)
  }

  register(p: Provider): void {
    this.providers.set(p.name, p)
  }

  get(name: string): Provider {
    const p = this.providers.get(name)
    if (!p) {
      throw new Error(
        `unknown provider "${name}". Known: ${[...this.providers.keys()].sort().join(', ')}`,
      )
    }
    return p
  }

  has(name: string): boolean {
    return this.providers.has(name)
  }
}
