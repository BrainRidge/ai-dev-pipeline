import { describe, it, expect } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  taskIdFromWorkspaceSettings,
  resolveTasksRoot,
  resolveCodeRoot,
} from '../../src/session/resume'

describe('taskIdFromWorkspaceSettings', () => {
  it('reads the breadcrumb', () => {
    expect(taskIdFromWorkspaceSettings({ 'aiDevWorkflow.taskId': 'T-1' })).toBe('T-1')
  })

  it('returns undefined when absent', () => {
    expect(taskIdFromWorkspaceSettings({})).toBeUndefined()
  })

  it('treats an empty string as absent', () => {
    expect(taskIdFromWorkspaceSettings({ 'aiDevWorkflow.taskId': '' })).toBeUndefined()
  })

  it('ignores a non-string value', () => {
    expect(taskIdFromWorkspaceSettings({ 'aiDevWorkflow.taskId': 42 })).toBeUndefined()
  })
})

describe('root resolution', () => {
  it('defaults tasks root under the home directory', () => {
    expect(resolveTasksRoot(undefined)).toBe(join(homedir(), 'ai-dev-workflow', 'tasks'))
    expect(resolveTasksRoot('')).toBe(join(homedir(), 'ai-dev-workflow', 'tasks'))
  })

  it('honours a configured tasks root', () => {
    expect(resolveTasksRoot('/custom/tasks')).toBe('/custom/tasks')
  })

  it('defaults code root under the home directory', () => {
    expect(resolveCodeRoot(undefined)).toBe(join(homedir(), 'ai-dev-workflow', 'code'))
  })
})
