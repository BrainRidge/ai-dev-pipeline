import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowCatalog } from '../../src/engine/WorkflowCatalog'
import { repoNameOf } from '../../src/engine/schema'
import { WorkflowEngine } from '../../src/engine/WorkflowEngine'
import { buildWorkflowDescriptor } from '../../src/engine/StepDescriptor'
import { PromptComposer } from '../../src/prompt/PromptComposer'
import { TaskStateStore } from '../../src/state/TaskStateStore'
import { AuditLog } from '../../src/audit/AuditLog'
import { CollectRequirement } from '../../src/tasks/CollectRequirement'
import { GitClone } from '../../src/tasks/GitClone'
import { InvokeCopilot } from '../../src/tasks/InvokeCopilot'
import { InvokeCopilotCoding } from '../../src/tasks/InvokeCopilotCoding'
import { InvokeCopilotCodeReview } from '../../src/tasks/InvokeCopilotCodeReview'
import { ManualReview } from '../../src/tasks/ManualReview'
import { TaskTypeRegistry } from '../../src/tasks/TaskType'
import type { CommandSink } from '../../src/tasks/CommandSink'
import type { StepContext } from '../../src/tasks/context'
import { taskState } from '../support/fixtures'

const ROOT = join(__dirname, '../..')
const noSink: CommandSink = { async copy() {}, async toTerminal() {} }

/**
 * The bundled New Feature workflow, run against its real JSON and its real
 * prompt templates. Its microservices come from whatever the catalogue holds,
 * so editing config/microservices.json cannot break this test.
 */
describe('the bundled new feature workflow', () => {
  let delivered: { stepId: string; prompt: string }[] = []
  let outputWritten = false

  beforeEach(() => {
    delivered = []
    outputWritten = false
  })

  async function run() {
    const catalog = await WorkflowCatalog.load(join(ROOT, 'workflows'), join(ROOT, 'config'))
    const workflow = catalog.get('newFeatureWorkflow')
    const taskDir = await mkdtemp(join(tmpdir(), 'nf-'))
    const services = catalog.microservices().slice(0, 2).map((s) => s.shortCode)

    const composer = new PromptComposer(join(ROOT, 'prompts'))
    const record = (stepId: string) => ({
      async deliver(prompt: string) {
        delivered.push({ stepId, prompt })
        return 'A' as const
      },
    })

    const registry = new TaskTypeRegistry([
      new CollectRequirement(),
      new GitClone('/code', () => false, noSink),
      new InvokeCopilot(composer, record('aiHandoff'), new AuditLog(taskDir), async () => outputWritten, noSink),
      new InvokeCopilotCoding(composer, record('CodeImplementation'), new AuditLog(taskDir), noSink),
      new InvokeCopilotCodeReview(composer, record('CodeReview'), new AuditLog(taskDir), noSink),
      new ManualReview(async () => {}, async () => 'deadbeef'),
    ])
    registry.validateWorkflow(workflow.id, workflow.steps)

    const store = new TaskStateStore(taskDir)
    const state = taskState({
      workflowId: workflow.id,
      currentStepId: workflow.initialStep,
      inputs: { services, baseBranch: 'develop', workDir: '/Users/you/work', featureStory: 'PLAT-4821' },
    })
    await store.write(state)

    const holder = { state: await store.read() }
    const ctx: StepContext = {
      platform: { id: 'canada-assisted', label: 'Canada Assisted' },
      microservices: catalog.microservices(),
      taskDir,
      epic: 'PLAT-1234',
      taskId: state.taskId,
      workflowId: workflow.id,
      inputs: state.inputs,
      order: workflow.order,
      answersOf: (id) => holder.state.steps[id]?.answers ?? {},
      resultOf: (id) => holder.state.steps[id]?.result ?? {},
    }

    const engine = new WorkflowEngine(workflow, store, registry, ctx)
    const refresh = async () => {
      holder.state = await store.read()
    }
    return { workflow, engine, registry, ctx, store, refresh, services }
  }

  const requirement = { story: 'As a customer I can apply for a product', notes: 'from refinement' }

  async function upTo(stepId: string) {
    const h = await run()
    const path = ['requirement', 'gitClone', 'aiHandoff', 'reviewAnalysis', 'CodeImplementation']
    for (const id of path) {
      if (id === stepId) break
      if (id === 'requirement') await h.engine.submit(id, 'submit', requirement)
      else if (id === 'aiHandoff') {
        outputWritten = true
        await h.engine.submit(id, 'done', { confirmed: true, outputPresent: true })
      } else if (id === 'CodeImplementation') {
        await h.engine.submit(id, 'done', { confirmed: true })
      } else await h.engine.submit(id, 'submit', {})
      await h.refresh()
    }
    return h
  }

  it('is loaded from the workflows directory alongside the other task types', async () => {
    const catalog = await WorkflowCatalog.load(join(ROOT, 'workflows'), join(ROOT, 'config'))
    expect(catalog.all().map((w) => w.label).sort()).toEqual([
      'Bug Fix',
      'New Feature',
      'Research Task',
    ])
  })

  it('names only taskTypes that are implemented', async () => {
    const { workflow, registry } = await run()
    expect(() => registry.validateWorkflow(workflow.id, workflow.steps)).not.toThrow()
  })

  it('walks all six steps in nextStep order', async () => {
    const { workflow } = await run()
    expect(workflow.order).toEqual([
      'requirement',
      'gitClone',
      'aiHandoff',
      'reviewAnalysis',
      'CodeImplementation',
      'CodeReview',
    ])
  })

  it('reaches the terminal code review step and reports done', async () => {
    const h = await upTo('CodeReview')
    expect((await h.engine.current()).id).toBe('CodeReview')
    expect(await h.engine.submit('CodeReview', 'done', { confirmed: true })).toEqual({
      ok: true,
      done: true,
    })
  })

  it('carries the feature story and base branch into the planning prompt', async () => {
    const h = await upTo('aiHandoff')
    const task = h.registry.get('invokeCopilot') as InvokeCopilot
    await task.deliver(h.workflow.steps.aiHandoff!, h.ctx)

    const prompt = delivered[0]!.prompt
    expect(prompt).toContain('Story: PLAT-4821')
    expect(prompt).toContain('based on `develop`')
    expect(prompt).toContain('As a customer I can apply for a product')
    expect(prompt).not.toContain('{{')
  })

  it('contracts the planning step to a file, so D9 still holds there', async () => {
    const h = await upTo('aiHandoff')
    const task = h.registry.get('invokeCopilot') as InvokeCopilot
    expect(await task.outputPath(h.workflow.steps.aiHandoff!, h.ctx)).toBe(
      join(h.ctx.taskDir, '02-implementation-plan.md'),
    )
  })

  it('contracts the coding step to edits instead of a file', async () => {
    const h = await upTo('CodeImplementation')
    const task = h.registry.get('invokeCopilotCoding') as InvokeCopilotCoding
    const delivery = await task.deliver(h.workflow.steps.CodeImplementation!, h.ctx)

    expect(delivery.outputPath).toBeUndefined()
    expect(delivered.at(-1)!.prompt).toContain('Change the code in place')
    expect(delivered.at(-1)!.prompt).not.toContain('Create the file if it does not exist')
  })

  it('points the coding step at the plan the developer approved', async () => {
    const h = await upTo('CodeImplementation')
    const task = h.registry.get('invokeCopilotCoding') as InvokeCopilotCoding
    await task.deliver(h.workflow.steps.CodeImplementation!, h.ctx)
    expect(delivered.at(-1)!.prompt).toContain(join(h.ctx.taskDir, '02-implementation-plan.md'))
  })

  it('lets the coding step complete on confirmation alone', async () => {
    const h = await upTo('CodeImplementation')
    expect(await h.engine.submit('CodeImplementation', 'done', { confirmed: true })).toEqual({
      ok: true,
      done: false,
    })
  })

  it('blocks the coding step when the developer has not confirmed', async () => {
    const h = await upTo('CodeImplementation')
    expect(await h.engine.submit('CodeImplementation', 'done', {})).toMatchObject({ ok: false })
  })

  it('reviews the plan the handoff wrote, without naming it twice', async () => {
    const h = await upTo('reviewAnalysis')
    const task = h.registry.get('manualReview') as ManualReview
    expect(task.artifactPath(h.workflow.steps.reviewAnalysis!, h.ctx)).toBe(
      join(h.ctx.taskDir, '02-implementation-plan.md'),
    )
  })

  it('shows the real composed prompt on the handoff step, ready to copy', async () => {
    const h = await upTo('aiHandoff')
    const descriptor = await buildWorkflowDescriptor({
      workflow: h.workflow,
      state: await h.store.read(),
      registry: h.registry,
      ctx: h.ctx,
      values: {},
      errors: {},
    })

    const handoff = descriptor.steps.find((s) => s.id === 'aiHandoff')!
    const prompt = handoff.commands![0]!.lines.join('\n')
    expect(prompt).toContain('Story: PLAT-4821')
    expect(prompt).toContain('As a customer I can apply for a product')
    expect(prompt).not.toContain('{{')
    expect(handoff.commands![0]!.actions!.map((a) => a.id)).toEqual(['copy', 'send'])
  })

  it('badges the six steps for the panel with no workflow-specific code', async () => {
    const h = await upTo('gitClone')
    const descriptor = await buildWorkflowDescriptor({
      workflow: h.workflow,
      state: await h.store.read(),
      registry: h.registry,
      ctx: h.ctx,
      values: {},
      errors: {},
    })
    expect(descriptor.steps.map((s) => s.badge)).toEqual([
      'INPUT',
      'COMMAND',
      'COPILOT',
      'REVIEW',
      'COPILOT',
      'COPILOT',
    ])
    expect(descriptor.steps.map((s) => s.title)).toEqual([
      'Collect the requirement',
      'Get the code',
      'Hand off to Copilot',
      'Review the result',
      'Implement the code',
      'Review the code',
    ])
  })

  it('plans commands for whichever services the catalogue actually holds', async () => {
    const h = await upTo('gitClone')
    const task = h.registry.get('gitClone') as GitClone
    expect(task.plan(h.ctx).map((b) => b.id)).toEqual(h.services)
  })

  it('puts each repository on the base branch chosen in the sidebar', async () => {
    const h = await upTo('gitClone')
    const task = h.registry.get('gitClone') as GitClone
    const lines = task.plan(h.ctx).flatMap((b) => b.lines)
    expect(lines).toContain('git checkout develop')
    expect(lines.join('\n')).not.toContain('checkout -b')
  })

  it('records the repositories under their own repository names', async () => {
    const h = await upTo('gitClone')
    await h.engine.submit('gitClone', 'submit', {})

    const expected = h.ctx.microservices
      .filter((s) => h.services.includes(s.shortCode))
      .map((s) => repoNameOf(s.gitLocation))
    const result = (await h.store.read()).steps.gitClone!.result!
    expect((result.repos as { name: string }[]).map((r) => r.name)).toEqual(expected)
  })
})
