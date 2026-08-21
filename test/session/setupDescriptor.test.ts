import { describe, it, expect } from 'vitest'
import { unconfiguredDescriptor } from '../../src/session/setupDescriptor'
import { PROTOCOL_VERSION } from '../../src/engine/StepDescriptor'

describe('the sidebar with no usable content root', () => {
  it('shows the message it was given rather than one of its own', () => {
    const message =
      'No microservice config configured. Set aiDevWorkflow.microserviceConfig in ' +
      'Settings → Extensions → AI Dev Workflow, or set Content Root to fill it in.'
    expect(unconfiguredDescriptor(message).step.text).toBe(message)
  })

  it('passes a load failure through verbatim, so a typo reads as a typo', () => {
    const message = 'microservices.json not found at /team/config/microservices.json'
    expect(unconfiguredDescriptor(message).step.text).toBe(message)
  })

  // Every field would be empty or wrong, and an empty microservice list can
  // never satisfy validateSetup. Offering the form would only mislead.
  it('offers no fields', () => {
    expect(unconfiguredDescriptor('x').step.fields).toEqual([])
  })

  it('offers exactly one action, and it is the fix', () => {
    expect(unconfiguredDescriptor('x').step.actions).toEqual([
      { id: 'openSettings', label: 'Open Settings', primary: true },
    ])
  })

  // Resuming needs the config directory too, so there is no half-working mode
  // to fall back to.
  it('offers no way into the existing-task mode', () => {
    const ids = unconfiguredDescriptor('x').step.fields.map((f) => f.id)
    expect(ids).not.toContain('mode')
  })

  it('carries the protocol version, so the renderer does not reject it', () => {
    expect(unconfiguredDescriptor('x').protocolVersion).toBe(PROTOCOL_VERSION)
  })

  it('has no footer, because the work directory is not the problem to solve', () => {
    expect(unconfiguredDescriptor('x').footer).toBeUndefined()
  })
})
