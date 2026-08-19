/**
 * Browser-only development harness.
 *
 * The descriptor is the renderer's ONLY input, so the UI can be built and
 * eyeballed with no extension host, no F5 and no debugging session:
 *
 *   npm run build && open webview/fixtures/dev.html
 *
 * Edit a fixture below, rebuild, refresh the browser.
 */
import { renderStep, renderWorkflow, type StepDescriptor, type WorkflowDescriptor } from '../render/fields'
import workflow from './workflow.json'
import formStep from './form-step.json'

type Fixture =
  | { kind: 'workflow'; data: WorkflowDescriptor }
  | { kind: 'single'; data: StepDescriptor }

const FIXTURES: Record<string, Fixture> = {
  'workflow (middle pane)': { kind: 'workflow', data: workflow as WorkflowDescriptor },
  'setup form (sidebar)': { kind: 'single', data: formStep as StepDescriptor },
}

const root = document.getElementById('root')!
const picker = document.getElementById('fixture') as HTMLSelectElement

for (const name of Object.keys(FIXTURES)) {
  const opt = document.createElement('option')
  opt.value = name
  opt.textContent = name
  picker.append(opt)
}

function show(name: string): void {
  const fixture = FIXTURES[name]
  if (!fixture) return
  if (fixture.kind === 'workflow') {
    renderWorkflow(fixture.data, root, (stepId, actionId, values) =>
      console.log('step:', stepId, 'action:', actionId, 'values:', values),
    )
  } else {
    renderStep(fixture.data, root, (actionId, values) =>
      console.log('action:', actionId, 'values:', values),
    )
  }
}

picker.addEventListener('change', () => show(picker.value))
show(picker.value || 'workflow (middle pane)')
