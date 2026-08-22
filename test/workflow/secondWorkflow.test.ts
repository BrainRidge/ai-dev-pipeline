import { describe, it, expect } from 'vitest'
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowCatalog } from '../../src/engine/WorkflowCatalog'
import { WorkflowEngine } from '../../src/engine/WorkflowEngine'
import { PromptComposer } from '../../src/prompt/PromptComposer'
import { TaskStateStore } from '../../src/state/TaskStateStore'
import { AuditLog } from '../../src/audit/AuditLog'
import { CollectRequirement } from '../../src/tasks/CollectRequirement'
import { InvokeCopilot } from '../../src/tasks/InvokeCopilot'
import { ManualReview } from '../../src/tasks/ManualReview'
import { TaskTypeRegistry } from '../../src/tasks/TaskType'
import type { StepContext } from '../../src/tasks/context'
import type { CommandSink } from '../../src/tasks/CommandSink'
import { bundledResolver, taskState } from '../support/fixtures'

const noSink: CommandSink = { async copy() {}, async toTerminal() {} }

const ROOT = join(__dirname, '../..')
const CONFIG = {
  platformConfig: join(ROOT, 'examples/content-template/config/platforms.json'),
  microserviceConfig: join(ROOT, 'examples/content-template/config/microservices.json'),
}

const SECOND = {
  schemaVersion: 1,
  label: 'Throwaway Task',
  initialStep: 'requirement',
  steps: {
    requirement: {
      stepType: 'task',
      taskType: 'CollectRequirement',
      documentation: 'Say what you want.',
      nextStep: 'ask',
    },
    ask: {
      stepType: 'aiHandoff',
      taskType: 'invokeCopilot',
      documentation: 'Hand it over.',
      nextStep: 'check',
    },
    check: { stepType: 'manual', taskType: 'manualReview', documentation: 'Read it.' },
  },
}

const TEMPLATE = `---
output: throwaway.md
---
Answer this for {{task.epic}}: {{requirement.story}}
`

/**
 * Spec acceptance criterion 11: a tool developer adds a workflow with a JSON
 * file and a prompt template, and no TypeScript. This test is that claim, run.
 */
describe('a second workflow', () => {
  async function bundle() {
    const dir = await mkdtemp(join(tmpdir(), 'ext-'))
    await mkdir(join(dir, 'workflows'), { recursive: true })
    await mkdir(join(dir, 'prompts', 'throwawayWorkflow'), { recursive: true })

    // Only ever adding files: the bundled workflow is copied in untouched.
    await cp(join(ROOT, 'workflows'), join(dir, 'workflows'), { recursive: true })
    await writeFile(
      join(dir, 'workflows', 'throwawayWorkflow_1_0.json'),
      JSON.stringify(SECOND, null, 2),
    )
    await writeFile(join(dir, 'prompts', 'throwawayWorkflow', 'ask.md'), TEMPLATE)

    return dir
  }

  it('is loaded alongside the bundled ones', async () => {
    const catalog = await WorkflowCatalog.load(join(await bundle(), 'workflows'), CONFIG)
    expect(catalog.all().map((w) => w.id).sort()).toEqual([
      'bugFixWorkflow',
      'newFeatureWorkflow',
      'researchTaskWorkflow',
      'throwawayWorkflow',
    ])
  })

  it('names only taskTypes that already exist', async () => {
    const catalog = await WorkflowCatalog.load(join(await bundle(), 'workflows'), CONFIG)
    const registry = new TaskTypeRegistry([
      new CollectRequirement(),
      new InvokeCopilot(
        new PromptComposer(bundledResolver('/unused')),
        { async deliver() { return 'A' } },
        new AuditLog('/unused'),
        async () => true,
        noSink,
      ),
      new ManualReview(async () => {}, async () => 'h', async () => {}),
    ])
    const workflow = catalog.get('throwawayWorkflow')
    expect(() => registry.validateWorkflow(workflow.id, workflow.steps)).not.toThrow()
  })

  it('runs, using its own prompt template found by convention', async () => {
    const dir = await bundle()
    const taskDir = await mkdtemp(join(tmpdir(), 'run2-'))
    const catalog = await WorkflowCatalog.load(join(dir, 'workflows'), CONFIG)
    const workflow = catalog.get('throwawayWorkflow')

    const delivered: string[] = []
    const handoff = new InvokeCopilot(
      new PromptComposer(bundledResolver(join(dir, 'prompts'))),
      { async deliver(prompt) { delivered.push(prompt); return 'A' } },
      new AuditLog(taskDir),
      async () => true,
      noSink,
    )
    const registry = new TaskTypeRegistry([
      new CollectRequirement(),
      handoff,
      new ManualReview(async () => {}, async () => 'h', async () => {}),
    ])

    const store = new TaskStateStore(taskDir)
    await store.write(
      taskState({ workflowId: workflow.id, currentStepId: workflow.initialStep }),
    )

    const holder = { state: await store.read() }
    const ctx: StepContext = {
      platform: { id: 'canada-assisted', label: 'Canada Assisted' },
      microservices: catalog.microservices(),
      taskDir,
      epic: 'PLAT-9',
      taskId: 'T-9',
      workflowId: workflow.id,
      inputs: {},
      order: workflow.order,
      answersOf: (id) => holder.state.steps[id]?.answers ?? {},
      resultOf: (id) => holder.state.steps[id]?.result ?? {},
    }

    const engine = new WorkflowEngine(workflow, store, registry, ctx)
    await engine.submit('requirement', 'submit', { story: 'does this need code?' })
    holder.state = await store.read()

    await handoff.deliver(workflow.steps.ask!, ctx)
    expect(delivered[0]).toContain('Answer this for PLAT-9: does this need code?')
    expect(delivered[0]).toContain(join(taskDir, 'throwaway.md'))

    expect(await handoff.outputPath(workflow.steps.ask!, ctx)).toBe(join(taskDir, 'throwaway.md'))
  })
})
