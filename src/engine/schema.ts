import { z } from 'zod'

/** How a step behaves. Declared by its taskType and cross-checked in the JSON. */
export const stepTypeSchema = z.enum([
  'task',
  'commandExecution',
  'aiHandoff',
  'manual',
  'toolCheck',
])
export type StepType = z.infer<typeof stepTypeSchema>

export const fieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'text',
    'textarea',
    'select',
    'multiselect',
    'boolean',
    'repo-picker',
    'file-picker',
  ]),
  label: z.string().min(1),
  required: z.boolean().optional(),
  source: z.string().optional(),
  provider: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
})

export const workflowStepSchema = z.object({
  stepType: stepTypeSchema,
  taskType: z.string().min(1),
  documentation: z.string().default(''),
  interactive: z.boolean().optional(),
  nextStep: z.string().optional(),
  /**
   * Prompt files this step composes *before* its own template — the personas
   * and skills that say who the model is being asked to be, ahead of the
   * functional prompt that says what to do. Named relative to the prompts root,
   * with or without a leading slash. See spec Section 6.
   */
  prompts: z.array(z.string().min(1)).default([]),
})

export const workflowFileSchema = z.object({
  schemaVersion: z.literal(1),
  label: z.string().min(1),
  initialStep: z.string().min(1),
  steps: z.record(z.string(), workflowStepSchema),
})

/** The microservice catalogue. Note: no platform key — platform is context only. */
export const microserviceSchema = z.object({
  microserviceName: z.string().min(1),
  shortCode: z.string().min(1),
  purpose: z.string().default(''),
  gitLocation: z.string().min(1),
  category: z.string().default(''),
  subcategory: z.string().default(''),
})

export const microservicesFileSchema = z.array(microserviceSchema)

/**
 * A tool the Tool Check step looks for on the developer's machine.
 *
 * `command` and `args` are spawned directly rather than through a shell, so the
 * command is an executable name and the arguments are a list — not one string
 * to be split. See spec Section 17.
 */
export const toolSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default(['--version']),
  /** A missing required tool blocks the step; a missing optional one is noted. */
  required: z.boolean().default(true),
  /** Dotted numbers, e.g. "17" or "2.30". Compared numerically, segment by segment. */
  minVersion: z
    .string()
    .regex(/^\d+(\.\d+)*$/, 'minVersion must be dotted numbers, such as "17" or "2.30"')
    .optional(),
  /** Why this workflow needs it. Shown beside the tool when it is missing. */
  why: z.string().default(''),
  /** Install hint per `process.platform`: darwin, win32, linux. */
  install: z.record(z.string(), z.string()).default({}),
  /**
   * Per-platform overrides of what to run, keyed by `process.platform` —
   * `darwin`, `win32`, `linux`. A platform with no entry uses the `command` and
   * `args` above, so the common case stays a single line.
   *
   * This is for a tool that is genuinely a different program somewhere, not for
   * a Windows batch shim: `mvn.cmd` and `gradle.bat` are found without help,
   * because the probe tries those extensions itself. See spec Section 17.
   */
  platforms: z
    .record(
      z.string(),
      z.object({
        command: z.string().min(1).optional(),
        args: z.array(z.string()).optional(),
      }),
    )
    .default({}),
})

export const toolsFileSchema = z.array(toolSchema)

export const platformSchema = z.object({ id: z.string().min(1), label: z.string().min(1) })
export const platformsFileSchema = z.object({
  comment: z.string().optional(),
  platforms: z.array(platformSchema),
})

export type FieldDef = z.infer<typeof fieldSchema>
export type WorkflowStepDef = z.infer<typeof workflowStepSchema>
export type WorkflowFile = z.infer<typeof workflowFileSchema>
export type Microservice = z.infer<typeof microserviceSchema>
export type PlatformDef = z.infer<typeof platformSchema>
export type ToolDef = z.infer<typeof toolSchema>

/** A step with its id folded in, which is what the engine and UI pass around. */
export interface StepDef extends WorkflowStepDef {
  id: string
}

export interface WorkflowDef {
  id: string
  version: string
  label: string
  initialStep: string
  steps: Record<string, StepDef>
  /** Reachable order from initialStep — used for numbering and display. */
  order: string[]
}

/**
 * The folder a repository lands in, derived from its git location the way git
 * itself does: the last path segment, without a trailing `.git`.
 *
 * Only `.git` is stripped — `payment-service.ui` keeps its suffix, because that
 * is part of the repository's name rather than a git convention.
 *
 * Returns undefined for a location with no usable segment, which the catalogue
 * rejects at load time rather than leaving a `cd` pointing nowhere.
 */
export function repoNameOf(gitLocation: string): string | undefined {
  const trimmed = (gitLocation.split(/[?#]/)[0] ?? '').replace(/\/+$/, '')

  // Drop the scheme and host, or the scp-like `user@host:` prefix, so that a
  // location with no path left cannot pass the host off as a repository.
  const path = trimmed.includes('://')
    ? trimmed.slice(trimmed.indexOf('://') + 3).replace(/^[^/]*/, '')
    : trimmed.slice(trimmed.indexOf(':') + 1)

  const name = (path.split('/').filter(Boolean).pop() ?? '').replace(/\.git$/, '')
  return name === '' ? undefined : name
}

/**
 * Workflows are versioned by filename: researchTaskWorkflow_1_0.json.
 * Returns { id: 'researchTaskWorkflow', version: '1.0' }.
 */
export function parseWorkflowFilename(
  filename: string,
): { id: string; version: string } | undefined {
  const m = /^(.+?)_(\d+)_(\d+)\.json$/.exec(filename)
  if (!m) return undefined
  return { id: m[1]!, version: `${m[2]}.${m[3]}` }
}
