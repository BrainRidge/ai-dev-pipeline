import type { FieldDef } from '../engine/schema'

/**
 * The MCP migration seam. Today only ManualProvider exists. When the
 * organisation enables MCP, a JiraMcpProvider registers here under a new name
 * and workflow YAML references it — with no change to WorkflowEngine, any step
 * handler, or the renderer. See spec Section 5.
 */
export interface Provider {
  readonly name: string
  /** Options to offer for this field, or undefined for free entry. */
  options(field: FieldDef): Promise<{ value: string; label: string }[] | undefined>
}

export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>()

  register(p: Provider): void {
    this.providers.set(p.name, p)
  }

  get(name: string): Provider {
    const p = this.providers.get(name)
    if (!p) throw new Error(`unknown provider: ${name}`)
    return p
  }
}
