// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import { renderWorkflow, type WorkflowDescriptor } from '../../webview/render/fields'

beforeAll(() => {
  // jsdom has no layout engine, so scrollIntoView is absent.
  Element.prototype.scrollIntoView = () => {}
})

const descriptor: WorkflowDescriptor = {
  protocolVersion: 2,
  task: {
    id: 'PLAT-1234-research-20260815-01',
    platform: 'canada-assisted',
    epic: 'PLAT-1234',
    workflowLabel: 'Research Task',
  },
  activeStepId: 'context',
  steps: [
    {
      id: 'scope',
      index: 1,
      title: 'What are we researching?',
      stepType: 'task',
      badge: 'INPUT',
      status: 'complete',
      summary: 'why is checkout slow',
      answers: [{ label: 'Research question', value: 'why is checkout slow' }],
      actions: [{ id: 'edit', label: 'Edit' }],
    },
    {
      id: 'checkout',
      index: 2,
      title: 'Get the code',
      stepType: 'commandExecution',
      badge: 'COMMAND',
      status: 'complete',
      summary: '2 repos on PLAT-1234-research',
      actions: [{ id: 'edit', label: 'Edit' }],
    },
    {
      id: 'context',
      index: 3,
      title: 'Supporting context',
      stepType: 'task',
      badge: 'INPUT',
      status: 'current',
      values: { story: 'existing story' },
      fields: [{ id: 'story', type: 'textarea', label: 'JIRA story' }],
      actions: [
        { id: 'back', label: 'Back' },
        { id: 'submit', label: 'Continue', primary: true },
      ],
    },
    {
      id: 'analyse',
      index: 4,
      title: 'Run the analysis',
      stepType: 'aiHandoff',
      badge: 'COPILOT',
      status: 'pending',
    },
  ],
}

function render(
  onAction?: (s: string, a: string, v: Record<string, unknown>) => void,
): HTMLElement {
  const root = document.createElement('div')
  renderWorkflow(descriptor, root, onAction)
  return root
}

describe('the diagram', () => {
  it('draws a node for every step', () => {
    expect(render().querySelectorAll('.wf-node')).toHaveLength(4)
  })

  it('draws a connector between each pair of nodes', () => {
    expect(render().querySelectorAll('.wf-connector')).toHaveLength(3)
  })

  it('numbers the nodes', () => {
    const indexes = [...render().querySelectorAll('.wf-node-index')].map((n) => n.textContent)
    expect(indexes).toEqual(['1', '2', '3', '4'])
  })

  it('badges each node by type', () => {
    const badges = [...render().querySelectorAll('.wf-node .badge')].map((b) => b.textContent)
    expect(badges).toEqual(['INPUT', 'COMMAND', 'INPUT', 'COPILOT'])
  })

  it('marks node status as a class', () => {
    const root = render()
    expect(root.querySelector('[data-step-id=scope]')!.className).toContain('complete')
    expect(root.querySelector('[data-step-id=context]')!.className).toContain('current')
    expect(root.querySelector('[data-step-id=analyse]')!.className).toContain('pending')
  })

  it('shows a summary on completed nodes', () => {
    expect(render().querySelector('[data-step-id=scope]')!.textContent).toContain(
      'why is checkout slow',
    )
  })

  it('selects the active step on load', () => {
    expect(render().querySelector('.wf-node.selected')!.getAttribute('data-step-id')).toBe('context')
  })
})

describe('the detail pane', () => {
  it('shows the active step with its fields', () => {
    const root = render()
    const detail = root.querySelector('.wf-detail')!
    expect(detail.textContent).toContain('Supporting context')
    expect(detail.querySelector('textarea')).not.toBeNull()
  })

  it('prefills the active step from stored values', () => {
    const box = render().querySelector<HTMLTextAreaElement>('.wf-detail textarea')!
    expect(box.value).toBe('existing story')
  })

  it('keeps fields out of the diagram itself', () => {
    expect(render().querySelector('.wf-canvas textarea')).toBeNull()
  })

  it('switches to a completed step when its node is clicked', () => {
    const root = render()
    root.querySelector<HTMLButtonElement>('[data-step-id=scope]')!.click()

    const detail = root.querySelector('.wf-detail')!
    expect(detail.textContent).toContain('What are we researching?')
    expect(detail.querySelector('textarea')).toBeNull()
  })

  it('shows a completed step read-only, with its answers', () => {
    const root = render()
    root.querySelector<HTMLButtonElement>('[data-step-id=scope]')!.click()

    const labels = [...root.querySelectorAll('.wf-answer-label')].map((n) => n.textContent)
    const values = [...root.querySelectorAll('.wf-answer-value')].map((n) => n.textContent)
    expect(labels).toEqual(['Research question'])
    expect(values).toEqual(['why is checkout slow'])
  })

  it('offers Edit on a completed step', () => {
    const root = render()
    root.querySelector<HTMLButtonElement>('[data-step-id=scope]')!.click()
    const buttons = [...root.querySelectorAll('.wf-detail button')].map((b) => b.textContent)
    expect(buttons).toEqual(['Edit'])
  })

  it('explains that a pending step is not reachable yet', () => {
    const root = render()
    root.querySelector<HTMLButtonElement>('[data-step-id=analyse]')!.click()

    const detail = root.querySelector('.wf-detail')!
    expect(detail.textContent).toContain('not available yet')
    expect(detail.querySelectorAll('button')).toHaveLength(0)
  })

  it('moves the selection highlight when another node is clicked', () => {
    const root = render()
    root.querySelector<HTMLButtonElement>('[data-step-id=scope]')!.click()
    expect(root.querySelectorAll('.wf-node.selected')).toHaveLength(1)
    expect(root.querySelector('.wf-node.selected')!.getAttribute('data-step-id')).toBe('scope')
  })

  it('reports which step an action came from', () => {
    const seen: { stepId: string; actionId: string }[] = []
    const root = render((stepId, actionId) => seen.push({ stepId, actionId }))
    root.querySelector<HTMLButtonElement>('[data-step-id=scope]')!.click()
    root.querySelector<HTMLButtonElement>('.wf-detail button')!.click()
    expect(seen).toEqual([{ stepId: 'scope', actionId: 'edit' }])
  })

  it('collects the active step values on submit', () => {
    const seen: Record<string, unknown>[] = []
    const root = render((_s, _a, values) => seen.push(values))
    root.querySelector<HTMLTextAreaElement>('.wf-detail textarea')!.value = 'typed story'
    const buttons = root.querySelectorAll<HTMLButtonElement>('.wf-detail button')
    buttons[1]!.click()
    expect(seen).toEqual([{ story: 'typed story' }])
  })
})
