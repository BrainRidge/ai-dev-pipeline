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

  test('the bundled workflow and its configuration ship inside the extension', async () => {
    const ext = vscode.extensions.getExtension('internal.ai-dev-workflow')
    assert.ok(ext, 'extension not found')

    const workflow = JSON.parse(
      await readFile(
        join(ext.extensionPath, 'workflows', 'researchTaskWorkflow_1_0.json'),
        'utf8',
      ),
    )
    assert.strictEqual(workflow.initialStep, 'requirement')

    const services = JSON.parse(
      await readFile(join(ext.extensionPath, 'config', 'microservices.json'), 'utf8'),
    )
    assert.ok(Array.isArray(services) && services.length > 0)
  })
})
