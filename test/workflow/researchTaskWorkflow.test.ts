import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
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

/**
 * The bundled research workflow, run end to end against the real JSON, the real
 * microservice catalogue and the real prompt template. This is what proves the
 * configuration and the code agree — every other test uses fixtures.
 */
describe('the bundled research workflow', () => {
  let copied: string[] = []
  const sink: CommandSink = {
    async copy(text) { copied.push(text) },
    async toTerminal(text) { copied.push(text) },
  }

  let delivered: string[] = []
  let opened: string[] = []
  let outputWritten = false

  beforeEach(() => {
    copied = []
    delivered = []
    opened = []
    outputWritten = false
  })

  async function run() {
    const catalog = await WorkflowCatalog.load(join(ROOT, 'workflows'), CONFIG)
    const workflow = catalog.get('researchTaskWorkflow')
    const taskDir = await mkdtemp(join(tmpdir(), 'run-'))
    const services = catalog.microservices().slice(0, 2).map((s) => s.shortCode)

    const registry = new TaskTypeRegistry([
      systemCheck(),
      new CollectRequirement(),
      new GitClone('/code', () => false, sink),
      new InvokeCopilot(
        new PromptComposer(bundledResolver(join(ROOT, 'prompts'))),
        { async deliver(prompt) { delivered.push(prompt); return 'A' } },
        new AuditLog(taskDir),
        async () => outputWritten,
        sink,
      ),
      new ManualReview(
        async (p) => { opened.push(p) },
        async () => 'deadbeef',
      ),
    ])
    registry.validateWorkflow(workflow.id, workflow.steps)

    const store = new TaskStateStore(taskDir)
    const state = taskState({
      workflowId: workflow.id,
      currentStepId: workflow.initialStep,
      inputs: { services, baseBranch: 'develop', workDir: '/Users/you/work' },
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

    return { workflow, engine, registry, ctx, store, refresh, taskDir, services }
  }

  it('walks requirement → gitClone → aiHandoff → reviewAnalysis', async () => {
    const { engine, store, refresh } = await run()

    expect((await engine.current()).id).toBe('requirement')
    await engine.submit('requirement', 'submit', { story: 'why is checkout slow' })
    await refresh()

    expect((await engine.current()).id).toBe('gitClone')
    await engine.submit('gitClone', 'submit', {})
    await refresh()

    expect((await engine.current()).id).toBe('aiHandoff')
    outputWritten = true
    await engine.submit('aiHandoff', 'done', { confirmed: true, outputPresent: true })
    await refresh()

    expect((await engine.current()).id).toBe('reviewAnalysis')
    expect(await engine.submit('reviewAnalysis', 'approve', {})).toEqual({ ok: true, done: true })

    const final = await store.read()
    expect(Object.keys(final.steps)).toEqual([
      'systemCheck',
      'requirement',
      'gitClone',
      'aiHandoff',
      'reviewAnalysis',
    ])
  })

  it('plans clone commands rather than running them', async () => {
    const { engine, registry, ctx, refresh, services } = await run()
    await engine.submit('requirement', 'submit', { story: 'why' })
    await refresh()

    const blocks = (registry.get('gitClone') as GitClone).plan(ctx)
    expect(blocks.map((b) => b.id)).toEqual(services)
    expect(blocks[0]!.lines).toContain('cd /Users/you/work')
    expect(blocks[0]!.lines).toContain('git checkout develop')
  })

  it('copies a block only when the developer asks for it', async () => {
    const { engine, registry, ctx, refresh, services } = await run()
    await engine.submit('requirement', 'submit', { story: 'why' })
    await refresh()

    expect(copied).toEqual([])
    await (registry.get('gitClone') as GitClone).deliver(services[0]!, 'copy', ctx)
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('git checkout develop')
  })

  it('composes a prompt carrying the answers, the repo paths and the output contract', async () => {
    const { engine, registry, ctx, workflow, refresh } = await run()
    await engine.submit('requirement', 'submit', { story: 'why is checkout slow' })
    await refresh()
    await engine.submit('gitClone', 'submit', {})
    await refresh()

    // The handoff finds the cloned repositories itself, from the step behind it.
    const task = registry.get('invokeCopilot') as InvokeCopilot
    await task.deliver(workflow.steps.aiHandoff!, ctx)

    const prompt = delivered[0]!
    expect(prompt).toContain('why is checkout slow')
    expect(prompt).toContain('Platform: canada-assisted')
    expect(prompt).toContain('#file:/Users/you/work/')
    expect(prompt).toContain(join(ctx.taskDir, '02-analysis.md'))
    expect(prompt).not.toContain('{{')
  })

  it('opens the artifact the handoff step declared, without naming it twice', async () => {
    const { engine, registry, ctx, workflow, refresh, taskDir } = await run()
    await engine.submit('requirement', 'submit', { story: 'why' })
    await refresh()
    await engine.submit('gitClone', 'submit', {})
    await refresh()

    outputWritten = true
    await writeFile(join(taskDir, '02-analysis.md'), '# Analysis\n')
    await engine.submit('aiHandoff', 'done', { confirmed: true, outputPresent: true })
    await refresh()

    await (registry.get('manualReview') as ManualReview).open(workflow.steps.reviewAnalysis!, ctx)
    expect(opened).toEqual([join(taskDir, '02-analysis.md')])
  })

  it('revise on the review step sends the work back to the handoff', async () => {
    const { engine, store, refresh } = await run()
    await engine.submit('requirement', 'submit', { story: 'why' })
    await refresh()
    await engine.submit('gitClone', 'submit', {})
    await refresh()
    outputWritten = true
    await engine.submit('aiHandoff', 'done', { confirmed: true, outputPresent: true })
    await refresh()

    await engine.submit('reviewAnalysis', 'revise', {})
    expect((await engine.current()).id).toBe('aiHandoff')
    expect((await store.read()).steps.aiHandoff!.status).toBe('pending')
  })

  it('blocks the handoff until the artifact exists, whatever the developer clicks', async () => {
    const { engine, refresh } = await run()
    await engine.submit('requirement', 'submit', { story: 'why' })
    await refresh()
    await engine.submit('gitClone', 'submit', {})
    await refresh()

    const blocked = await engine.submit('aiHandoff', 'done', {
      confirmed: true,
      outputPresent: false,
      outputFile: '02-analysis.md',
    })
    expect(blocked).toMatchObject({ ok: false })
    expect((await engine.current()).id).toBe('aiHandoff')
  })

  it('renders a descriptor the webview can draw, with no workflow-specific code', async () => {
    const { engine, workflow, registry, ctx, store, refresh } = await run()
    await engine.submit('requirement', 'submit', { story: 'why is checkout slow' })
    await refresh()

    const descriptor = await buildWorkflowDescriptor({
      workflow,
      state: await store.read(),
      registry,
      ctx,
      values: {},
      errors: {},
    })

    expect(descriptor.steps.map((s) => s.badge)).toEqual([
      'SYSTEM',
      'INPUT',
      'COMMAND',
      'COPILOT',
      'REVIEW',
    ])
    expect(descriptor.activeStepId).toBe('gitClone')
    expect(descriptor.steps.find((s) => s.id === 'requirement')!.summary).toBe(
      'why is checkout slow',
    )
    expect(descriptor.steps.find((s) => s.id === 'systemCheck')!.summary).toBe('1 of 1 tools found')
    expect(descriptor.steps.every((s) => (s.documentation ?? '').length > 20)).toBe(true)
  })
})
