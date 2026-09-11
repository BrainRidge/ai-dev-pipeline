import { ManualProvider } from './ManualProvider'
import { ProviderRegistry } from './Provider'

/**
 * The providers a field may name. One today.
 *
 * This function is where P3's work lands: a `JiraMcpProvider` is registered
 * here under a new name, and a field's `provider` key starts resolving to it.
 * Nothing else changes — not `WorkflowEngine`, not the renderer, not any step
 * handler — which is the whole claim the seam makes. See spec Section 5.
 */
export function defaultProviders(): ProviderRegistry {
  return new ProviderRegistry([new ManualProvider()])
}
