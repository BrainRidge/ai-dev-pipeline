import { describe, it, expect } from 'vitest'
import { buildTaskId } from '../src/engine/taskId'

describe('scaffold', () => {
  it('exposes a taskId builder', () => {
    expect(typeof buildTaskId).toBe('function')
  })
})
