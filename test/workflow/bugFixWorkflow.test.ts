import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowCatalog } from '../../src/engine/WorkflowCatalog'
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
import { bundledResolver, systemCheck, taskState } from '../support/fixtures'

const ROOT = join(__dirname, '../..')
const CONFIG = {
  platformConfig: join(ROOT, 'examples/content-template/config/platforms.json'),
  microserviceConfig: join(ROOT, 'examples/content-template/config/microservices.json'),
}
const noSink: CommandSink = { async copy() {}, async toTerminal() {} }

/**
 * The bundled Bug Fix workflow, run against its real JSON and its real prompt
 * templates. It is composed entirely from taskTypes that already existed, which
 * is the claim spec acceptance criterion 11 makes: a new workflow costs a JSON
 * file and some markdown, and no TypeScript.
 */
describe('the bundled bug fix workflow', () => {
  let delivered: { stepId: string; prompt: string }[] = []
  let outputWritten = false

  beforeEach(() => {
    delivered = []
    outputWritten = false
  })

  async function run() {
    const catalog = await WorkflowCatalog.load(join(ROOT, 'workflows'), CONFIG)
    const workflow = catalog.get('bugFixWorkflow')
    const taskDir = await mkdtemp(join(tmpdir(), 'bf-'))
    const services = catalog.microservices().slice(0, 1).map((s) => s.shortCode)

    const composer = new PromptComposer(bundledResolver(join(ROOT, 'prompts')))
    const record = (stepId: string) => ({
      async deliver(prompt: string) {
        delivered.push({ stepId, prompt })
        return 'A' as const
      },
    })

    const registry = new TaskTypeRegistry([
      systemCheck(),
      new CollectRequirement(),
      new GitClone('/code', () => false, noSink),
      new InvokeCopilot(composer, record('diagnosis'), new AuditLog(taskDir), async () => outputWritten, noSink),
      new InvokeCopilotCoding(composer, record('CodeFix'), new AuditLog(taskDir), noSink),
      new InvokeCopilotCodeReview(composer, record('CodeReview'), new AuditLog(taskDir), noSink),
      new ManualReview(async () => {}, async () => 'deadbeef'),
    ])
    registry.validateWorkflow(workflow.id, workflow.steps)

    const store = new TaskStateStore(taskDir)
    const state = taskState({
      workflowId: workflow.id,
      currentStepId: workflow.initialStep,
      inputs: { services, baseBranch: 'release/8.2', workDir: '/Users/you/work' },
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

    // The workflow now opens on System Check. Passing it here keeps the tests
    // below starting where they always did; the step has its own tests, and its
    // place at the front of every workflow is asserted in catalog.test.ts.
    await registry.get('systemCheck').describe(workflow.steps.systemCheck!, ctx, {})
    await engine.submit('systemCheck', 'submit', {})
    holder.state = await store.read()

    return { workflow, engine, registry, ctx, store, refresh, services }
  }

  const defect = {
    story: 'Applying a promo code twice doubles the discount',
    notes: 'Reproduced on release/8.2 by QA, not on develop',
  }

  async function upTo(stepId: string) {
    const h = await run()
    for (const id of ['requirement', 'gitClone', 'diagnosis', 'reviewDiagnosis', 'CodeFix']) {
      if (id === stepId) break
      if (id === 'requirement') await h.engine.submit(id, 'submit', defect)
      else if (id === 'diagnosis') {
        outputWritten = true
        await h.engine.submit(id, 'done', { confirmed: true, outputPresent: true })
      } else if (id === 'CodeFix') {
        await h.engine.submit(id, 'done', { confirmed: true })
      } else await h.engine.submit(id, 'submit', {})
      await h.refresh()
    }
    return h
  }

  it('joins Research and New Feature as a third task type', async () => {
    const catalog = await WorkflowCatalog.load(join(ROOT, 'workflows'), CONFIG)
    expect(catalog.all().map((w) => w.label).sort()).toEqual([
      'Bug Fix',
      'New Feature',
      'Research Task',
    ])
  })

  it('names only taskTypes that already existed — no new TypeScript', async () => {
    const { workflow, registry } = await run()
    expect(() => registry.validateWorkflow(workflow.id, workflow.steps)).not.toThrow()
  })

  it('diagnoses before it fixes, which is the whole shape of the workflow', async () => {
    const { workflow } = await run()
    expect(workflow.order).toEqual([
      'systemCheck',
      'requirement',
      'gitClone',
      'diagnosis',
      'reviewDiagnosis',
      'CodeFix',
      'CodeReview',
    ])
  })

  it('reaches the terminal review step and reports done', async () => {
    const h = await upTo('CodeReview')
    expect((await h.engine.current()).id).toBe('CodeReview')
    expect(await h.engine.submit('CodeReview', 'done', { confirmed: true })).toEqual({
      ok: true,
      done: true,
    })
  })

  it('contracts the diagnosis to a file, so D9 holds on the step that matters', async () => {
    const h = await upTo('diagnosis')
    const task = h.registry.get('invokeCopilot') as InvokeCopilot
    expect(await task.outputPath(h.workflow.steps.diagnosis!, h.ctx)).toBe(
      join(h.ctx.taskDir, '02-root-cause.md'),
    )
  })

  it('tells the diagnosis step to find the cause and change nothing', async () => {
    const h = await upTo('diagnosis')
    const task = h.registry.get('invokeCopilot') as InvokeCopilot
    await task.deliver(h.workflow.steps.diagnosis!, h.ctx)

    const prompt = delivered[0]!.prompt
    expect(prompt).toMatch(/do not fix anything in this step/i)
    expect(prompt).toContain('Applying a promo code twice doubles the discount')
    expect(prompt).toContain('release/8.2')
    expect(prompt).not.toContain('{{')
  })

  it('reviews the diagnosis the handoff wrote, without naming the file twice', async () => {
    const h = await upTo('reviewDiagnosis')
    const task = h.registry.get('manualReview') as ManualReview
    expect(task.artifactPath(h.workflow.steps.reviewDiagnosis!, h.ctx)).toBe(
      join(h.ctx.taskDir, '02-root-cause.md'),
    )
  })

  it('asks the fix step for a regression test that fails without the fix', async () => {
    const h = await upTo('CodeFix')
    const task = h.registry.get('invokeCopilotCoding') as InvokeCopilotCoding
    const delivery = await task.deliver(h.workflow.steps.CodeFix!, h.ctx)

    expect(delivery.outputPath).toBeUndefined()
    const prompt = delivered.at(-1)!.prompt
    expect(prompt).toMatch(/failing test first/i)
    expect(prompt).toContain(join(h.ctx.taskDir, '02-root-cause.md'))
    expect(prompt).not.toContain('{{')
  })

  it('has the review step judge the fix against the cause, not the symptom', async () => {
    const h = await upTo('CodeReview')
    const task = h.registry.get('invokeCopilotCodeReview') as InvokeCopilotCodeReview
    await task.deliver(h.workflow.steps.CodeReview!, h.ctx)

    const prompt = delivered.at(-1)!.prompt
    expect(prompt).toMatch(/symptom, not cause/i)
    expect(prompt).not.toContain('{{')
  })

  it('quotes the same shared house rules the feature workflow uses', async () => {
    const h = await upTo('CodeFix')
    const task = h.registry.get('invokeCopilotCoding') as InvokeCopilotCoding
    await task.deliver(h.workflow.steps.CodeFix!, h.ctx)

    const prompt = delivered.at(-1)!.prompt
    expect(prompt).toContain('## House rules')
    // Still specific to a defect: the shared file carries none of this.
    expect(prompt).toContain('Write the failing test first')
  })

  it('never asks for a feature story, which a defect does not have', async () => {
    const h = await upTo('CodeFix')
    const task = h.registry.get('invokeCopilotCoding') as InvokeCopilotCoding
    await task.deliver(h.workflow.steps.CodeFix!, h.ctx)
    expect(delivered.at(-1)!.prompt).not.toMatch(/story/i)
  })

  it('badges the seven steps for the panel with no workflow-specific code', async () => {
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
      'SYSTEM',
      'INPUT',
      'COMMAND',
      'COPILOT',
      'REVIEW',
      'COPILOT',
      'COPILOT',
    ])
  })
})
