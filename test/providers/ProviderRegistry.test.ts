import { describe, it, expect } from 'vitest'
import { ProviderRegistry } from '../../src/providers/Provider'
import { ManualProvider } from '../../src/providers/ManualProvider'

describe('ProviderRegistry', () => {
  it('resolves a registered provider by name', () => {
    const registry = new ProviderRegistry()
    registry.register(new ManualProvider())
    expect(registry.get('manual').name).toBe('manual')
  })

  it('throws for an unknown provider', () => {
    expect(() => new ProviderRegistry().get('jira-mcp')).toThrow(/unknown provider/)
  })

  it('manual provider offers no options, meaning free entry', async () => {
    const options = await new ManualProvider().options({
      id: 'story',
      type: 'textarea',
      label: 'JIRA story',
    })
    expect(options).toBeUndefined()
  })
})
