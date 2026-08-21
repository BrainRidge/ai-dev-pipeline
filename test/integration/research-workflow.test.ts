import * as assert from 'node:assert'
import { join } from 'node:path'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as vscode from 'vscode'
import { TaskWorkspace } from '../../src/workspace/TaskWorkspace'
import { TaskStateStore } from '../../src/state/TaskStateStore'

const SOURCE = JSON.stringify({ schemaVersion: 1, label: 'R', initialStep: 'a', steps: {} })

suite('research workflow', () => {
  test('the extension activates and registers its commands', async () => {
    // Activation is onStartupFinished, which can land after this suite starts.
    await vscode.extensions.getExtension('internal.ai-dev-workflow')?.activate()

    const commands = await vscode.commands.getCommands(true)
    assert.ok(commands.includes('aiDevWorkflow.startTask'))
    assert.ok(commands.includes('aiDevWorkflow.resumeTask'))
  })

  test('a generated workspace file carries the taskId breadcrumb', async () => {
    const root = await mkdtemp(join(tmpdir(), 'e2e-'))
    const ws = await TaskWorkspace.create({
      tasksRoot: root,
      epic: 'PLAT-1',
      workflowId: 'research',
      platform: 'canada-assisted',
      workflowJson: SOURCE,
    })
    const file = await ws.writeWorkspaceFile([{ name: 'payments', path: '/code/payments' }])
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    assert.strictEqual(parsed.settings['aiDevWorkflow.taskId'], ws.taskId)
    assert.strictEqual(parsed.folders.length, 2)
  })

  test('state survives a simulated extension-host restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'e2e-'))
    const ws = await TaskWorkspace.create({
      tasksRoot: root,
      epic: 'PLAT-2',
      workflowId: 'research',
      platform: 'canada-assisted',
      workflowJson: SOURCE,
    })
    const store = new TaskStateStore(ws.dir)
    await store.write({
      schemaVersion: 1,
      taskId: ws.taskId,
      workflowId: 'research',
      workflowVersion: '1.0',
      platform: 'canada-assisted',
      epic: 'PLAT-2',
      currentStepId: 'context',
      workflowHash: await ws.hashOfSnapshot(),
      inputs: { services: ['pis'] },
      steps: { requirement: { status: 'complete', answers: { question: 'why' } } },
    })

    // A fresh store instance stands in for a restarted host.
    const state = await new TaskStateStore(ws.dir).read()
    assert.strictEqual(state.currentStepId, 'context')
    assert.strictEqual(state.steps.requirement?.answers?.question, 'why')
  })

  test('snapshot tampering is detected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'e2e-'))
    const ws = await TaskWorkspace.create({
      tasksRoot: root,
      epic: 'PLAT-3',
      workflowId: 'research',
      platform: 'canada-assisted',
      workflowJson: SOURCE,
    })
    const original = await ws.hashOfSnapshot()
    await writeFile(join(ws.dir, '.engine', 'workflow.json'), '{"tampered":true}')
    assert.strictEqual(await ws.verifySnapshot(original), false)
  })

  test('the bundled workflow and the content template ship inside the extension', async () => {
    const ext = vscode.extensions.getExtension('internal.ai-dev-workflow')
    assert.ok(ext, 'extension not found')

    const workflow = JSON.parse(
      await readFile(
        join(ext.extensionPath, 'workflows', 'researchTaskWorkflow_1_0.json'),
        'utf8',
      ),
    )
    assert.strictEqual(workflow.initialStep, 'requirement')

    // Prompts still ship: they are the per-file fallback for any template a
    // team has not supplied. See spec Section 16.
    const prompt = await readFile(
      join(ext.extensionPath, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'),
      'utf8',
    )
    assert.ok(prompt.includes('output:'), 'the bundled template declares its artifact')

    // Config does not ship. The template a team copies does.
    const services = JSON.parse(
      await readFile(
        join(ext.extensionPath, 'examples', 'content-template', 'config', 'microservices.json'),
        'utf8',
      ),
    )
    assert.ok(Array.isArray(services) && services.length > 0)

    await assert.rejects(
      readFile(join(ext.extensionPath, 'config', 'microservices.json'), 'utf8'),
      'config/ must not exist — nothing reads it, and it would name another team\u2019s repos',
    )
  })

  test('the content root setting is contributed and defaults to unset', () => {
    const ext = vscode.extensions.getExtension('internal.ai-dev-workflow')
    assert.ok(ext)
    const props = ext.packageJSON.contributes.configuration.properties as Record<
      string,
      { default: unknown }
    >
    assert.ok('aiDevWorkflow.contentRoot' in props)
    // An empty default is what puts a fresh install into the unconfigured state
    // rather than silently reading somebody else's catalogue.
    assert.strictEqual(props['aiDevWorkflow.contentRoot'].default, '')
  })

  /**
   * The one behaviour that cannot be unit tested: writing into settings needs a
   * real configuration service. See spec Section 16.
   */
  test('setting the content root fills in the three specific paths', async () => {
    await vscode.extensions.getExtension('internal.ai-dev-workflow')?.activate()

    const root = await mkdtemp(join(tmpdir(), 'root-'))
    const cfg = () => vscode.workspace.getConfiguration('aiDevWorkflow')
    const G = vscode.ConfigurationTarget.Global

    for (const key of ['microserviceConfig', 'platformConfig', 'customPrompts']) {
      await cfg().update(key, undefined, G)
    }
    await cfg().update('contentRoot', root, G)

    // onDidChangeConfiguration is async; poll rather than guess a delay.
    const deadline = Date.now() + 5000
    while (cfg().get<string>('microserviceConfig') === '' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50))
    }

    assert.strictEqual(
      cfg().get<string>('microserviceConfig'),
      join(root, 'config', 'microservices.json'),
    )
    assert.strictEqual(cfg().get<string>('platformConfig'), join(root, 'config', 'platforms.json'))
    assert.strictEqual(cfg().get<string>('customPrompts'), join(root, 'prompts'))

    // A value the developer chose themselves survives a later root change.
    await cfg().update('customPrompts', '/shared/prompts', G)
    const second = await mkdtemp(join(tmpdir(), 'root2-'))
    await cfg().update('contentRoot', second, G)

    const deadline2 = Date.now() + 5000
    while (
      cfg().get<string>('microserviceConfig') !== join(second, 'config', 'microservices.json') &&
      Date.now() < deadline2
    ) {
      await new Promise((r) => setTimeout(r, 50))
    }

    assert.strictEqual(
      cfg().get<string>('microserviceConfig'),
      join(second, 'config', 'microservices.json'),
    )
    assert.strictEqual(
      cfg().get<string>('customPrompts'),
      '/shared/prompts',
      'a hand-picked prompts folder must not silently revert',
    )

    for (const key of ['contentRoot', 'microserviceConfig', 'platformConfig', 'customPrompts']) {
      await cfg().update(key, undefined, G)
    }
  })
})
