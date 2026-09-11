import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
import { bundledResolver, toolCheck, taskState } from '../support/fixtures'

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
  let kept: { from: string; to: string }[] = []
  let outputWritten = false

  beforeEach(() => {
    copied = []
    delivered = []
    opened = []
    kept = []
    outputWritten = false
  })

  async function run() {
    const catalog = await WorkflowCatalog.load(join(ROOT, 'workflows'), CONFIG)
    const workflow = catalog.get('researchTaskWorkflow')
    const taskDir = await mkdtemp(join(tmpdir(), 'run-'))
    const services = catalog.microservices().slice(0, 2).map((s) => s.shortCode)

    const registry = new TaskTypeRegistry([
      toolCheck(),
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
        async (from, to) => { kept.push({ from, to }) },
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

    // The workflow now opens on Tool Check. Passing it here keeps the tests
    // below starting where they always did; the step has its own tests, and its
    // place at the front of every workflow is asserted in catalog.test.ts.
    await registry.get('toolCheck').describe(workflow.steps.toolCheck!, ctx, {})
    await engine.submit('toolCheck', 'submit', {})
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
      'toolCheck',
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
    // Plain git against absolute paths, so the block runs in any shell.
    expect(blocks[0]!.lines.join('\n')).toContain('git clone "')
    expect(blocks[0]!.lines.join('\n')).toContain('checkout develop')
    expect(blocks[0]!.lines.join('\n')).not.toContain('cd ')
  })

  it('copies a block only when the developer asks for it', async () => {
    const { engine, registry, ctx, refresh, services } = await run()
    await engine.submit('requirement', 'submit', { story: 'why' })
    await refresh()

    expect(copied).toEqual([])
    await (registry.get('gitClone') as GitClone).deliver(services[0]!, 'copy', ctx)
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('checkout develop')
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

  /**
   * The first bundled workflow to use the workflow-declared prompts. Asserted
   * against the real JSON and the real skill files, because this is the pairing
   * that proves the capability works on shipped content rather than a fixture.
   * See spec Section 6.
   */
  it('composes the two skill prompts ahead of the step’s own template', async () => {
    const { engine, registry, ctx, workflow, refresh } = await run()
    await engine.submit('requirement', 'submit', { story: 'why is checkout slow' })
    await refresh()
    await engine.submit('gitClone', 'submit', {})
    await refresh()

    expect(workflow.steps.aiHandoff!.prompts).toEqual([
      '/skills/codebase-analyst/SKILL.md',
      '/skills/evidence-first/SKILL.md',
    ])

    await (registry.get('invokeCopilot') as InvokeCopilot).deliver(workflow.steps.aiHandoff!, ctx)
    const prompt = delivered[0]!

    const analyst = prompt.indexOf('Read before you theorise')
    const evidence = prompt.indexOf('Separate what you observed')
    const functional = prompt.indexOf('why is checkout slow')

    // Declared order, then the functional prompt, then the generated parts.
    expect(analyst).toBeGreaterThanOrEqual(0)
    expect(analyst).toBeLessThan(evidence)
    expect(evidence).toBeLessThan(functional)
    expect(functional).toBeLessThan(prompt.indexOf('## Repositories in scope'))
  })

  it('records both skill prompts on the composed result, for the caption and the log', async () => {
    const { engine, ctx, workflow, refresh } = await run()
    // Both fields, as the panel sends them: a submission carries every field the
    // step declared, including the ones left blank. Omitting one here made the
    // placeholder guard report requirement.notes, which is the guard being right.
    await engine.submit('requirement', 'submit', { story: 'why', notes: '' })
    await refresh()

    const composed = await new PromptComposer(bundledResolver(join(ROOT, 'prompts'))).compose(
      workflow.steps.aiHandoff!,
      ctx,
      [],
    )
    expect(composed.prompts.map((p) => p.path)).toEqual([
      join(ROOT, 'prompts', 'skills', 'codebase-analyst', 'SKILL.md'),
      join(ROOT, 'prompts', 'skills', 'evidence-first', 'SKILL.md'),
    ])
    // Skill prompts carry no placeholders, so they cannot go stale against a
    // workflow that renames a field.
    expect(composed.unresolved).toEqual([])
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

  /**
   * The step's documentation promises that sending work back means "Copilot will
   * run again with your edits included". That promise lives in the workflow JSON
   * and is kept by the prompt template, so it needs a test between the two or it
   * is only a claim.
   */
  it('recomposes a prompt that reads the developer’s edits on the second pass', async () => {
    const { engine, registry, ctx, workflow, refresh, taskDir } = await run()
    await engine.submit('requirement', 'submit', { story: 'why is checkout slow' })
    await refresh()
    await engine.submit('gitClone', 'submit', {})
    await refresh()

    outputWritten = true
    await writeFile(join(taskDir, '02-analysis.md'), '# Analysis\n')
    await engine.submit('aiHandoff', 'done', { confirmed: true, outputPresent: true })
    await refresh()

    // The developer edits the artifact and sends it back.
    await writeFile(join(taskDir, '02-analysis.md'), '# Analysis\n\nThis bit is wrong.\n')
    await engine.submit('reviewAnalysis', 'revise', {})
    await refresh()
    expect((await engine.current()).id).toBe('aiHandoff')

    const task = registry.get('invokeCopilot') as InvokeCopilot
    await task.deliver(workflow.steps.aiHandoff!, ctx)

    const prompt = delivered.at(-1)!
    expect(prompt).toContain(join(taskDir, '02-analysis.md'))
    expect(prompt).toMatch(/sent it back/i)
    expect(prompt).toMatch(/treat\s+them as instructions/i)
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
      'TOOLS',
      'INPUT',
      'COMMAND',
      'COPILOT',
      'REVIEW',
    ])
    expect(descriptor.activeStepId).toBe('gitClone')
    expect(descriptor.steps.find((s) => s.id === 'requirement')!.summary).toBe(
      'why is checkout slow',
    )
    expect(descriptor.steps.find((s) => s.id === 'toolCheck')!.summary).toBe(
      '3 of 3 checks passed',
    )
    expect(descriptor.steps.every((s) => (s.documentation ?? '').length > 20)).toBe(true)
  })
})

/**
 * Every step whose artifact a later step reviews has to survive being sent back,
 * because every one of those review steps offers Revise. A template that says
 * nothing about a second pass produces a byte-identical prompt on the way
 * through, which is what the workflow's own documentation promises it will not
 * do. Asserted against the real bundled templates.
 */
describe('every reviewable artifact survives a second pass', () => {
  const REVIEWED = [
    ['researchTaskWorkflow', 'aiHandoff', '02-analysis.md'],
    ['newFeatureWorkflow', 'aiHandoff', '02-implementation-plan.md'],
    ['bugFixWorkflow', 'diagnosis', '02-root-cause.md'],
  ] as const

  for (const [workflowId, stepId, artifact] of REVIEWED) {
    it(`${workflowId}/${stepId} tells Copilot to read ${artifact} if it is already there`, async () => {
      const body = await readFile(join(ROOT, 'prompts', workflowId, `${stepId}.md`), 'utf8')
      expect(body).toContain(`output: ${artifact}`)
      expect(body).toContain(artifact)
      expect(body).toMatch(/already exists/i)
      expect(body).toMatch(/sent it back/i)
    })
  }
})
