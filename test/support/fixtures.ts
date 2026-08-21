import type { Microservice, StepDef, StepType } from '../../src/engine/schema'
import type { StepContext } from '../../src/tasks/context'
import type { TaskState } from '../../src/state/TaskStateStore'
import {
  nodeProbe,
  templateResolver,
  type TemplateResolver,
} from '../../src/content/ContentRoot'

export const MICROSERVICES: Microservice[] = [
  {
    microserviceName: 'Payment Service',
    shortCode: 'pis',
    purpose: 'Takes payments.',
    gitLocation: 'https://abc.github/payment-service.ui',
    category: 'ui',
    subcategory: 'checkout',
  },
  {
    microserviceName: 'Orders Service',
    shortCode: 'ords',
    purpose: 'Order lifecycle.',
    gitLocation: 'https://abc.github/orders-service',
    category: 'backend',
    subcategory: 'fulfilment',
  },
]

export function step(id: string, over: Partial<StepDef> = {}): StepDef {
  return {
    id,
    stepType: 'task' as StepType,
    taskType: 'CollectRequirement',
    documentation: '',
    ...over,
  }
}

export function context(over: Partial<StepContext> = {}): StepContext {
  return {
    platform: { id: 'canada-assisted', label: 'Canada Assisted' },
    microservices: MICROSERVICES,
    taskDir: '/tasks/T-1',
    epic: 'PLAT-1234',
    taskId: 'T-1',
    workflowId: 'researchTaskWorkflow',
    inputs: {},
    order: [],
    answersOf: () => ({}),
    resultOf: () => ({}),
    ...over,
  }
}

export function taskState(over: Partial<TaskState> = {}): TaskState {
  return {
    schemaVersion: 1,
    taskId: 'T-1',
    workflowId: 'researchTaskWorkflow',
    workflowVersion: '1.0',
    platform: 'canada-assisted',
    epic: 'PLAT-1234',
    currentStepId: 'requirement',
    workflowHash: 'h',
    inputs: {},
    steps: {},
    ...over,
  }
}

/**
 * A resolver with no content root, so every template resolves to the given
 * directory. This is what `PromptComposer` did on its own before the content
 * root existed, and it keeps tests that do not care about resolution short.
 */
export function bundledResolver(promptsDir: string): TemplateResolver {
  return templateResolver({ bundledPromptsDir: promptsDir }, nodeProbe)
}
