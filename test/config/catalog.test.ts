import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { WorkflowCatalog } from '../../src/engine/WorkflowCatalog'
import { TaskTypeRegistry } from '../../src/tasks/TaskType'
import { CollectRequirement } from '../../src/tasks/CollectRequirement'
import { GitClone } from '../../src/tasks/GitClone'
import { ManualReview } from '../../src/tasks/ManualReview'
import { context, step, systemCheck } from '../support/fixtures'

const WORKFLOWS = join(__dirname, '../../workflows')
const CONFIG = {
  platformConfig: join(__dirname, '../../examples/content-template/config/platforms.json'),
  microserviceConfig: join(
    __dirname,
    '../../examples/content-template/config/microservices.json',
  ),
}

const load = () => WorkflowCatalog.load(WORKFLOWS, CONFIG)

describe('bundled configuration', () => {
  it('loads the versioned research workflow', async () => {
    const wf = (await load()).get('researchTaskWorkflow')
    expect(wf.version).toBe('1.0')
    expect(wf.label).toBe('Research Task')
  })

  it('walks the graph in nextStep order', async () => {
    expect((await load()).get('researchTaskWorkflow').order).toEqual([
      'systemCheck',
      'requirement',
      'gitClone',
      'aiHandoff',
      'reviewAnalysis',
    ])
  })

  it('gives every step documentation to explain it to the developer', async () => {
    const wf = (await load()).get('researchTaskWorkflow')
    for (const id of wf.order) {
      expect(wf.steps[id]!.documentation.length).toBeGreaterThan(20)
    }
  })

  // Every workflow opens on the machine check: there is no point collecting a
  // requirement for a task that cannot finish for want of a tool.
  it('starts every bundled workflow on the system check', async () => {
    for (const wf of (await load()).all()) {
      expect(wf.initialStep).toBe('systemCheck')
      expect(wf.order[0]).toBe('systemCheck')
      expect(wf.steps.systemCheck!.stepType).toBe('systemCheck')
    }
  })

  it('ends on a terminal step', async () => {
    const wf = (await load()).get('researchTaskWorkflow')
    expect(wf.steps.reviewAnalysis!.nextStep).toBeUndefined()
  })

  it('loads all four platforms as context', async () => {
    expect((await load()).platforms().map((p) => p.id)).toEqual([
      'canada-assisted',
      'canada-self-serve',
      'us-assisted',
      'us-self-serve',
    ])
  })

  // Asserted against the shape of the catalogue, not its contents: editing
  // config/microservices.json is configuration, and must not break tests.
  it('loads every microservice with the facts a task needs', async () => {
    const services = (await load()).microservices()
    expect(services.length).toBeGreaterThan(0)
    for (const s of services) {
      expect(s.shortCode).not.toBe('')
      expect(s.microserviceName).not.toBe('')
      expect(s.gitLocation).toMatch(/^https?:\/\//)
    }
  })

  it('finds a service by the shortCode the sidebar selects with', async () => {
    const catalog = await load()
    const first = catalog.microservices()[0]!
    expect(catalog.microserviceByCode(first.shortCode)).toEqual(first)
  })

  it('gives every service a distinct shortCode, since it is the key', async () => {
    const codes = (await load()).microservices().map((s) => s.shortCode)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('every taskType named by the workflow is implemented', async () => {
    const registry = new TaskTypeRegistry([new CollectRequirement()])
    const wf = (await load()).get('researchTaskWorkflow')
    const named = new Set(Object.values(wf.steps).map((s) => s.taskType))
    expect(named).toContain('CollectRequirement')
    expect(registry.has('CollectRequirement')).toBe(true)
  })
})

describe('microservice search', async () => {
  it('matches on the full name', async () => {
    const catalog = await load()
    const target = catalog.microservices()[0]!
    expect(catalog.searchMicroservices(target.microserviceName)).toContainEqual(target)
  })

  it('matches on short code, which is the point for a long list', async () => {
    const catalog = await load()
    const target = catalog.microservices()[0]!
    expect(catalog.searchMicroservices(target.shortCode)).toContainEqual(target)
  })

  it('matches on category', async () => {
    const catalog = await load()
    const target = catalog.microservices().find((s) => s.category !== '')
    if (!target) return
    expect(catalog.searchMicroservices(target.category)).toContainEqual(target)
  })

  it('is case-insensitive', async () => {
    const catalog = await load()
    const code = catalog.microservices()[0]!.shortCode
    expect(catalog.searchMicroservices(code.toUpperCase())).toEqual(
      catalog.searchMicroservices(code.toLowerCase()),
    )
  })

  it('finds nothing for a query no service matches', async () => {
    expect((await load()).searchMicroservices('zzzz-no-such-service')).toEqual([])
  })

  it('returns everything for an empty query', async () => {
    const c = await load()
    expect(c.searchMicroservices('  ').length).toBe(c.microservices().length)
  })
})

describe('TaskTypeRegistry', async () => {
  const registry = new TaskTypeRegistry([new CollectRequirement()])

  it('resolves a registered taskType', () => {
    expect(registry.get('CollectRequirement').stepType).toBe('task')
  })

  it('lists known types when one is missing, so the error is actionable', () => {
    expect(() => registry.get('Nope')).toThrow(/Known: CollectRequirement/)
  })

  it('rejects a workflow whose stepType contradicts its taskType', () => {
    expect(() =>
      registry.validateWorkflow('wf', {
        a: {
          id: 'a',
          stepType: 'aiHandoff',
          taskType: 'CollectRequirement',
          documentation: '', prompts: [] },
      }),
    ).toThrow(/declares stepType "aiHandoff" but taskType "CollectRequirement" is a "task" step/)
  })
})

/**
 * Every action a primitive nominates as a transition has to be an action it
 * actually offers, or the step shows a button that cannot finish it and hides
 * one that can. Asserted across the vocabulary, so a new primitive is covered
 * the moment somebody adds it here. See spec Section 5.
 */
describe('every primitive offers the actions it says complete it', () => {
  const primitives = [
    new CollectRequirement(),
    new GitClone('/code', () => false, { async copy() {}, async toTerminal() {} }),
    new ManualReview(
      async () => {},
      async () => 'hash',
      async () => {},
    ),
    systemCheck(),
  ]

  for (const primitive of primitives) {
    it(`${primitive.name} offers ${primitive.transitions.join(', ')}`, async () => {
      const view = await primitive.describe(
        step('s', { stepType: primitive.stepType, taskType: primitive.name }),
        context({ order: ['s'] }),
        {},
      )
      const offered = view.actions.map((a) => a.id)
      for (const transition of primitive.transitions) {
        expect(offered).toContain(transition)
      }
    })
  }

  it('nominates at least one action for each, or the step could never finish', () => {
    for (const primitive of primitives) {
      expect(primitive.transitions.length).toBeGreaterThan(0)
    }
  })
})
