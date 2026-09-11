import { describe, it, expect } from 'vitest'
import {
  NEW_FEATURE_WORKFLOW_ID,
  needsFeatureStory,
  normaliseSetup,
  validateSetup,
  type SetupSelection,
} from '../../src/session/SetupSelection'

const complete: SetupSelection = {
  platform: 'canada-assisted',
  epic: 'PLAT-1234',
  workflowId: 'researchTaskWorkflow',
  featureStory: '',
  baseBranch: 'develop',
  workDir: '/Users/you/work',
  services: ['pis'],
}

describe('needsFeatureStory', () => {
  it('is true for the new feature workflow', () => {
    expect(needsFeatureStory(NEW_FEATURE_WORKFLOW_ID)).toBe(true)
  })

  it('is false for every other workflow', () => {
    expect(needsFeatureStory('researchTaskWorkflow')).toBe(false)
    expect(needsFeatureStory('')).toBe(false)
  })
})

describe('validateSetup', () => {
  it('accepts a complete selection', () => {
    expect(validateSetup(complete)).toEqual({})
  })

  it('requires a platform', () => {
    expect(validateSetup({ ...complete, platform: '' }).platform).toMatch(/platform/i)
  })

  it('requires an epic', () => {
    expect(validateSetup({ ...complete, epic: '  ' }).epic).toMatch(/epic/i)
  })

  it('requires a task type', () => {
    expect(validateSetup({ ...complete, workflowId: '' }).workflowId).toMatch(/task type/i)
  })

  it('requires a base branch, because there is no safe default to guess', () => {
    expect(validateSetup({ ...complete, baseBranch: '' }).baseBranch).toMatch(/base branch/i)
  })

  it('requires at least one microservice', () => {
    expect(validateSetup({ ...complete, services: [] }).services).toMatch(/microservice/i)
  })

  describe('work directory', () => {
    it('is required', () => {
      expect(validateSetup({ ...complete, workDir: '  ' }).workDir).toMatch(/required/i)
    })

    it('rejects a relative path, which would resolve against an unknown cwd', () => {
      expect(validateSetup({ ...complete, workDir: 'work/repos' }).workDir).toMatch(/full path/i)
    })

    it('rejects a bare home shorthand, which a shell expands but git clone does not', () => {
      expect(validateSetup({ ...complete, workDir: '~/work' }).workDir).toBeDefined()
    })

    it('accepts a POSIX path', () => {
      expect(validateSetup({ ...complete, workDir: '/Users/you/work' })).toEqual({})
    })

    it('accepts a Windows path, since the commands are pasted into a shell', () => {
      expect(validateSetup({ ...complete, workDir: 'C:\\work' })).toEqual({})
      expect(validateSetup({ ...complete, workDir: '\\\\server\\share' })).toEqual({})
    })

    it('trims it on the way to the task state', () => {
      expect(normaliseSetup({ ...complete, workDir: '  /Users/you/work ' }).workDir).toBe(
        '/Users/you/work',
      )
    })
  })

  describe('feature story', () => {
    const newFeature = { ...complete, workflowId: NEW_FEATURE_WORKFLOW_ID }

    it('is required for the new feature workflow', () => {
      expect(validateSetup({ ...newFeature, featureStory: '' }).featureStory).toMatch(/required/i)
    })

    it('accepts a JIRA key', () => {
      expect(validateSetup({ ...newFeature, featureStory: 'PLAT-4821' })).toEqual({})
    })

    it('rejects a bare number, which is the likely mistake', () => {
      expect(validateSetup({ ...newFeature, featureStory: '4821' }).featureStory).toMatch(
        /PLAT-1234/,
      )
    })

    it('rejects a key with no number', () => {
      expect(validateSetup({ ...newFeature, featureStory: 'PLAT-' }).featureStory).toBeDefined()
    })

    it('tolerates surrounding whitespace', () => {
      expect(validateSetup({ ...newFeature, featureStory: '  PLAT-4821 ' })).toEqual({})
    })

    it('is ignored entirely by other workflows', () => {
      expect(validateSetup({ ...complete, featureStory: 'nonsense' })).toEqual({})
    })
  })
})
