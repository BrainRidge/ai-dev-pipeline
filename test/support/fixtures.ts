import type { Microservice, StepDef, StepType, ToolDef } from '../../src/engine/schema'
import type { StepContext } from '../../src/tasks/context'
import type { TaskState } from '../../src/state/TaskStateStore'
import {
  nodeProbe,
  templateResolver,
  type TemplateResolver,
} from '../../src/content/ContentRoot'
import { ToolCheck } from '../../src/tasks/ToolCheck'
import type { CommandSink } from '../../src/tasks/CommandSink'
import type { ToolProbe } from '../../src/tasks/ToolProbe'
import { CHAT_COMMAND, type EnvironmentReader } from '../../src/tasks/Environment'

/** An editor with agent mode on and the chat command registered. */
export const healthyEditor: EnvironmentReader = {
  setting: () => true,
  commands: async () => [CHAT_COMMAND],
}

/** One required tool with no version floor — enough to exercise the step. */
export const TOOLS: ToolDef[] = [
  {
    id: 'git',
    label: 'Git',
    command: 'git',
    args: ['--version'],
    required: true,
    why: 'The Get the code step gives you git commands to run.',
    install: { darwin: 'brew install git', win32: 'winget install Git.Git' },
    platforms: {},
  },
]

/** A probe that finds everything and reports a plausible version. */
export const foundProbe: ToolProbe = {
  async run() {
    return { found: true, output: 'git version 2.50.1' }
  },
}

/**
 * A Tool Check wired to a fake machine. The platform is pinned so the install
 * hint in the report reads the same wherever the test runs.
 */
export function toolCheck(
  opts: {
    probe?: ToolProbe
    tools?: ToolDef[]
    source?: 'external' | 'bundled'
    path?: string
    sink?: CommandSink
    environment?: EnvironmentReader
  } = {},
): ToolCheck {
  const sink: CommandSink = opts.sink ?? { async copy() {}, async toTerminal() {} }
  return new ToolCheck(
    async () => ({
      tools: opts.tools ?? TOOLS,
      source: opts.source ?? 'bundled',
      path: opts.path,
    }),
    opts.probe ?? foundProbe,
    sink,
    opts.environment ?? healthyEditor,
    'darwin',
  )
}

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
    prompts: [],
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
