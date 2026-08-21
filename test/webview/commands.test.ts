// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import { renderWorkflow, type WorkflowDescriptor } from '../../webview/render/fields'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

const descriptor: WorkflowDescriptor = {
  protocolVersion: 2,
  task: { id: 'T', platform: 'canada-assisted', epic: 'PLAT-1234', workflowLabel: 'New Feature' },
  activeStepId: 'gitClone',
  steps: [
    {
      id: 'gitClone',
      index: 1,
      title: 'Get the code',
      stepType: 'commandExecution',
      badge: 'COMMAND',
      status: 'current',
      text: 'Run these in a terminal, then mark the step done.',
      commands: [
        {
          id: 'pis',
          label: 'party-service (pis)',
          note: 'Template: /team/prompts/w/s.md (external)',
          lines: ['git clone https://x/party-service /code/pis', 'cd /code/pis', 'git pull'],
        },
        { id: 'ris', label: 'reference-data-service (ris)', lines: ['cd /code/ris', 'git pull'] },
      ],
      actions: [
        { id: 'back', label: 'Back' },
        { id: 'submit', label: 'I have run these', primary: true },
      ],
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

describe('command blocks', () => {
  it('draws one block per microservice', () => {
    expect(render().querySelectorAll('.cmd-block')).toHaveLength(2)
  })

  it('labels each block so you know which repo it is', () => {
    const labels = [...render().querySelectorAll('.cmd-label')].map((n) => n.textContent)
    expect(labels).toEqual(['party-service (pis)', 'reference-data-service (ris)'])
  })

  it('shows the commands verbatim, one per line', () => {
    const pre = render().querySelector('.cmd-block[data-block=pis] pre')!
    expect(pre.textContent).toBe(
      'git clone https://x/party-service /code/pis\ncd /code/pis\ngit pull',
    )
  })

  it('offers Copy and Terminal for each block', () => {
    const buttons = [
      ...render().querySelectorAll('.cmd-block[data-block=pis] button'),
    ].map((b) => b.textContent)
    expect(buttons).toEqual(['Copy', '→ Terminal'])
  })

  it('offers an all-repositories shortcut above them', () => {
    const buttons = [...render().querySelectorAll('.cmd-toolbar button')].map((b) => b.textContent)
    expect(buttons).toEqual(['Copy all', 'Send all to terminal'])
  })

  it('reports which block was copied', () => {
    const seen: { actionId: string; values: Record<string, unknown> }[] = []
    const root = render((_s, actionId, values) => seen.push({ actionId, values }))
    root.querySelector<HTMLButtonElement>('.cmd-block[data-block=ris] button')!.click()
    expect(seen).toEqual([{ actionId: 'copy', values: { block: 'ris' } }])
  })

  it('reports a terminal request separately from a copy', () => {
    const seen: string[] = []
    const root = render((_s, actionId) => seen.push(actionId))
    const buttons = root.querySelectorAll<HTMLButtonElement>('.cmd-block[data-block=pis] button')
    buttons[1]!.click()
    expect(seen).toEqual(['terminal'])
  })

  it('addresses the whole plan as "all"', () => {
    const seen: { actionId: string; values: Record<string, unknown> }[] = []
    const root = render((_s, actionId, values) => seen.push({ actionId, values }))
    root.querySelector<HTMLButtonElement>('.cmd-toolbar button')!.click()
    expect(seen).toEqual([{ actionId: 'copy', values: { block: 'all' } }])
  })

  it('keeps the step actions working alongside the command buttons', () => {
    const seen: string[] = []
    const root = render((_s, actionId) => seen.push(actionId))
    const actions = root.querySelectorAll<HTMLButtonElement>('.wf-detail .actions button')
    expect([...actions].map((b) => b.textContent)).toEqual(['Back', 'I have run these'])
    actions[1]!.click()
    expect(seen).toEqual(['submit'])
  })

  it('draws nothing when a step has no commands', () => {
    const bare = {
      ...descriptor,
      steps: [{ ...descriptor.steps[0]!, commands: undefined }],
    }
    const root = document.createElement('div')
    renderWorkflow(bare, root)
    expect(root.querySelectorAll('.cmd-block')).toHaveLength(0)
    expect(root.querySelector('.cmd-toolbar')).toBeNull()
  })
})

describe('a block that declares its own actions', () => {
  const promptStep: WorkflowDescriptor = {
    ...descriptor,
    steps: [
      {
        ...descriptor.steps[0]!,
        stepType: 'aiHandoff',
        badge: 'COPILOT',
        commands: [
          {
            id: 'prompt',
            label: 'Composed prompt',
            lines: ['You are planning a new feature…', 'Platform: canada-assisted.'],
            actions: [
              { id: 'copy', label: 'Copy' },
              { id: 'send', label: 'Send to Copilot' },
            ],
          },
        ],
      },
    ],
  }

  function render(
    onAction?: (s: string, a: string, v: Record<string, unknown>) => void,
  ): HTMLElement {
    const root = document.createElement('div')
    renderWorkflow(promptStep, root, onAction)
    return root
  }

  it('renders the declared actions instead of the defaults', () => {
    const buttons = [...render().querySelectorAll('.cmd-block button')].map((b) => b.textContent)
    expect(buttons).toEqual(['Copy', 'Send to Copilot'])
  })

  it('offers no Terminal button, which makes no sense for a prompt', () => {
    expect(render().textContent).not.toContain('Terminal')
  })

  it('drops the all-at-once toolbar, since there is one block with its own actions', () => {
    expect(render().querySelector('.cmd-toolbar')).toBeNull()
  })

  it('reports the declared action id', () => {
    const seen: string[] = []
    const root = render((_s, actionId) => seen.push(actionId))
    root.querySelectorAll<HTMLButtonElement>('.cmd-block button')[1]!.click()
    expect(seen).toEqual(['send'])
  })

  it('shows the prompt text verbatim', () => {
    expect(render().querySelector('.cmd-block pre')!.textContent).toBe(
      'You are planning a new feature…\nPlatform: canada-assisted.',
    )
  })
})

describe('an editable block', () => {
  const editableStep: WorkflowDescriptor = {
    ...descriptor,
    steps: [
      {
        ...descriptor.steps[0]!,
        stepType: 'aiHandoff',
        badge: 'COPILOT',
        commands: [
          {
            id: 'prompt',
            label: 'Composed prompt',
            lines: ['You are planning a new feature…', 'Platform: canada-assisted.'],
            editable: true,
            actions: [
              { id: 'copy', label: 'Copy' },
              { id: 'send', label: 'Send to Copilot' },
              { id: 'reset', label: 'Reset' },
            ],
          },
        ],
        actions: [{ id: 'done', label: 'Done', primary: true }],
      },
    ],
  }

  function render(
    onAction?: (s: string, a: string, v: Record<string, unknown>) => void,
  ): HTMLElement {
    const root = document.createElement('div')
    renderWorkflow(editableStep, root, onAction)
    return root
  }

  it('draws a textarea rather than a read-only block', () => {
    const root = render()
    expect(root.querySelector('.cmd-block pre')).toBeNull()
    const area = root.querySelector<HTMLTextAreaElement>('.cmd-block textarea')!
    expect(area.value).toBe('You are planning a new feature…\nPlatform: canada-assisted.')
  })

  it('sends the edited text with the block action, not the generated text', () => {
    const seen: { actionId: string; values: Record<string, unknown> }[] = []
    const root = render((_s, actionId, values) => seen.push({ actionId, values }))
    root.querySelector<HTMLTextAreaElement>('.cmd-block textarea')!.value = 'MY OWN PROMPT'

    root.querySelectorAll<HTMLButtonElement>('.cmd-block button')[1]!.click()
    expect(seen).toEqual([
      { actionId: 'send', values: { block: 'prompt', edited: { prompt: 'MY OWN PROMPT' } } },
    ])
  })

  it('carries the edited text on the step action too, so Done can persist it', () => {
    const seen: Record<string, unknown>[] = []
    const root = render((_s, _a, values) => seen.push(values))
    root.querySelector<HTMLTextAreaElement>('.cmd-block textarea')!.value = 'EDITED'

    root.querySelector<HTMLButtonElement>('.wf-detail .actions button')!.click()
    expect(seen).toEqual([{ edited: { prompt: 'EDITED' } }])
  })

  it('leaves a read-only block alone, so command steps are unaffected', () => {
    const seen: Record<string, unknown>[] = []
    const root = document.createElement('div')
    renderWorkflow(descriptor, root, (_s, _a, values) => seen.push(values))
    root.querySelector<HTMLButtonElement>('.wf-detail .actions button')!.click()
    expect(seen).toEqual([{}])
  })
})

describe('a block with a note', () => {
  it('draws the note for the block that has one', () => {
    const note = render().querySelector('.cmd-block[data-block=pis] .cmd-note')
    expect(note?.textContent).toBe('Template: /team/prompts/w/s.md (external)')
  })

  it('draws no note element for a block without one', () => {
    expect(render().querySelector('.cmd-block[data-block=ris] .cmd-note')).toBeNull()
  })
})
