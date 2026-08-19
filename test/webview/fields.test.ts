// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderField, renderStep, collectValues } from '../../webview/render/fields'
import type { StepDescriptor } from '../../webview/render/fields'

describe('renderField', () => {
  it('renders a textarea for type textarea', () => {
    const el = renderField({ id: 'q', type: 'textarea', label: 'Question' }, 'why')
    expect(el.querySelector('textarea')!.value).toBe('why')
  })

  it('renders one checkbox per option for multiselect', () => {
    const el = renderField(
      {
        id: 's',
        type: 'multiselect',
        label: 'Services',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      ['a'],
    )
    const boxes = el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    expect(boxes).toHaveLength(2)
    expect(boxes[0]!.checked).toBe(true)
    expect(boxes[1]!.checked).toBe(false)
  })

  it('marks a required field', () => {
    const el = renderField({ id: 'q', type: 'text', label: 'Q', required: true }, '')
    expect(el.querySelector('input')!.required).toBe(true)
  })

  it('shows an error message when present', () => {
    const el = renderField({ id: 'q', type: 'text', label: 'Q' }, '', 'Q is required')
    expect(el.textContent).toContain('Q is required')
  })

  it('renders unknown-but-declared field types as text inputs', () => {
    const el = renderField({ id: 'r', type: 'repo-picker', label: 'Repo' }, 'payments')
    expect(el.querySelector('input')!.value).toBe('payments')
  })
})

describe('collectValues', () => {
  it('round-trips a form through render and collect', () => {
    const root = document.createElement('div')
    const fields = [
      { id: 'q', type: 'text' as const, label: 'Q' },
      {
        id: 's',
        type: 'multiselect' as const,
        label: 'S',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      { id: 'ok', type: 'boolean' as const, label: 'OK' },
    ]
    for (const f of fields) {
      root.append(
        renderField(f, f.id === 'q' ? 'why' : f.id === 's' ? ['b'] : true),
      )
    }
    expect(collectValues(root, fields)).toEqual({ q: 'why', s: ['b'], ok: true })
  })
})

const descriptor: StepDescriptor = {
  protocolVersion: 1,
  task: { id: 'T', platform: 'p', epic: 'E', workflowLabel: 'Research Task' },
  progress: {
    index: 1,
    total: 2,
    steps: [
      { id: 'a', title: 'A', status: 'current' },
      { id: 'b', title: 'B', status: 'pending' },
    ],
  },
  step: {
    id: 'a',
    kind: 'form',
    title: 'A',
    values: {},
    fields: [{ id: 'q', type: 'text', label: 'Q' }],
    actions: [{ id: 'submit', label: 'Continue', primary: true }],
  },
}

describe('renderStep', () => {
  it('renders exactly the actions it is given', () => {
    const root = document.createElement('div')
    renderStep(descriptor, root)
    expect([...root.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Continue'])
  })

  it('renders the progress list', () => {
    const root = document.createElement('div')
    renderStep(descriptor, root)
    expect(root.querySelectorAll('[data-step-id]')).toHaveLength(2)
  })

  it('reports the action id and collected values on click', () => {
    const root = document.createElement('div')
    const seen: { id: string; values: Record<string, unknown> }[] = []
    renderStep(descriptor, root, (id, values) => seen.push({ id, values }))
    root.querySelector<HTMLInputElement>('input[name=q]')!.value = 'typed'
    root.querySelector('button')!.click()
    expect(seen).toEqual([{ id: 'submit', values: { q: 'typed' } }])
  })

  it('clears previous content on re-render', () => {
    const root = document.createElement('div')
    renderStep(descriptor, root)
    renderStep(descriptor, root)
    expect(root.querySelectorAll('button')).toHaveLength(1)
  })

  it('renders step text when the handler supplies it', () => {
    const root = document.createElement('div')
    renderStep({ ...descriptor, step: { ...descriptor.step, text: 'Explanatory copy' } }, root)
    expect(root.textContent).toContain('Explanatory copy')
  })
})

describe('the footer section', () => {
  const withFooter: StepDescriptor = {
    ...descriptor,
    step: { ...descriptor.step, values: { q: 'why', workDir: '/Users/you/work' } },
    footer: {
      title: 'Work directory',
      fields: [{ id: 'workDir', type: 'text', label: 'Where repositories are cloned' }],
      actions: [{ id: 'browse', label: 'Browse…' }],
    },
  }

  function render(onAction?: (id: string, values: Record<string, unknown>) => void): HTMLElement {
    const root = document.createElement('div')
    renderStep(withFooter, root, onAction)
    return root
  }

  it('renders below the primary action, not among the fields', () => {
    const root = render()
    const order = [...root.children].map((n) => n.className)
    expect(order.indexOf('actions')).toBeLessThan(order.indexOf('step-footer'))
  })

  it('shows its title', () => {
    expect(render().querySelector('.step-footer-title')!.textContent).toBe('Work directory')
  })

  it('prefills its fields from the descriptor values', () => {
    const box = render().querySelector<HTMLInputElement>('.step-footer input[name=workDir]')!
    expect(box.value).toBe('/Users/you/work')
  })

  it('renders its own actions', () => {
    const buttons = [...render().querySelectorAll('.step-footer button')].map((b) => b.textContent)
    expect(buttons).toEqual(['Browse…'])
  })

  it('sends footer values with a footer action', () => {
    const seen: { id: string; values: Record<string, unknown> }[] = []
    const root = render((id, values) => seen.push({ id, values }))
    root.querySelector<HTMLButtonElement>('.step-footer button')!.click()
    expect(seen).toEqual([{ id: 'browse', values: { q: 'why', workDir: '/Users/you/work' } }])
  })

  it('sends footer values with the primary action too, so nothing is lost', () => {
    const seen: Record<string, unknown>[] = []
    const root = render((_id, values) => seen.push(values))
    root.querySelector<HTMLInputElement>('.step-footer input[name=workDir]')!.value = '/srv/repos'
    root.querySelector<HTMLButtonElement>('.actions button')!.click()
    expect(seen).toEqual([{ q: 'why', workDir: '/srv/repos' }])
  })

  it('renders nothing extra when there is no footer', () => {
    const root = document.createElement('div')
    renderStep(descriptor, root)
    expect(root.querySelector('.step-footer')).toBeNull()
  })
})
