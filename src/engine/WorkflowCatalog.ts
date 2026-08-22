import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  microservicesFileSchema,
  parseWorkflowFilename,
  platformsFileSchema,
  repoNameOf,
  workflowFileSchema,
  type Microservice,
  type PlatformDef,
  type StepDef,
  type WorkflowDef,
  type WorkflowFile,
} from './schema'

/**
 * A config file now comes from a folder a team maintains rather than from the
 * extension bundle, so "which file, and where did we look" is the first thing
 * the reader needs. Errors from the schema and from validateMicroservices keep
 * their own wording — they are the most useful thing this loader says.
 * See spec Section 16.
 */
async function readConfig(path: string, label: string): Promise<unknown> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${label} not found at ${path}`)
    }
    throw err
  }

  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`${label} at ${path} is not valid JSON: ${(err as Error).message}`)
  }
}

/** Names the file a schema failure came from; zod's own message does not. */
function attribute<T>(label: string, path: string, parse: () => T): T {
  try {
    return parse()
  } catch (err) {
    throw new Error(
      `${label} at ${path} is not valid: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export class WorkflowCatalog {
  private constructor(
    private readonly workflows: Map<string, WorkflowDef>,
    private readonly platformDefs: PlatformDef[],
    private readonly services: Microservice[],
  ) {}

  /**
   * @param workflowsDir directory of `<name>_<major>_<minor>.json` workflow files
   * @param config       absolute paths to the two config files. They are given
   *                     separately rather than as a directory because each has
   *                     its own setting and may live anywhere. See spec Section 16.
   */
  static async load(
    workflowsDir: string,
    config: { platformConfig: string; microserviceConfig: string },
  ): Promise<WorkflowCatalog> {
    const platformsRaw = await readConfig(config.platformConfig, 'Platform config')
    const platforms = attribute('Platform config', config.platformConfig, () =>
      platformsFileSchema.parse(platformsRaw),
    ).platforms

    const servicesRaw = await readConfig(config.microserviceConfig, 'Microservice config')
    const services = attribute('Microservice config', config.microserviceConfig, () =>
      microservicesFileSchema.parse(servicesRaw),
    )
    validateMicroservices(services)

    const workflows = new Map<string, WorkflowDef>()
    for (const filename of await readdir(workflowsDir)) {
      if (!filename.endsWith('.json')) continue
      const parsed = parseWorkflowFilename(filename)
      if (!parsed) {
        throw new Error(
          `workflow filename "${filename}" is not versioned. ` +
            `Expected <name>_<major>_<minor>.json, e.g. researchTaskWorkflow_1_0.json`,
        )
      }

      const file = workflowFileSchema.parse(
        JSON.parse(await readFile(join(workflowsDir, filename), 'utf8')),
      )

      const workflow = buildWorkflow(parsed.id, parsed.version, file)

      // Keep only the highest version of each workflow id.
      const existing = workflows.get(parsed.id)
      if (existing && compareVersions(existing.version, parsed.version) >= 0) continue

      workflows.set(parsed.id, workflow)
    }

    return new WorkflowCatalog(workflows, platforms, services)
  }

  get(id: string): WorkflowDef {
    const wf = this.workflows.get(id)
    if (!wf) throw new Error(`unknown workflow: ${id}`)
    return wf
  }

  all(): WorkflowDef[] {
    return [...this.workflows.values()]
  }

  platforms(): PlatformDef[] {
    return this.platformDefs
  }

  microservices(): Microservice[] {
    return this.services
  }

  /** Type-ahead over name and shortCode. Empty query returns everything. */
  searchMicroservices(query: string): Microservice[] {
    const q = query.trim().toLowerCase()
    if (!q) return this.services
    return this.services.filter(
      (s) =>
        s.microserviceName.toLowerCase().includes(q) ||
        s.shortCode.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    )
  }

  microserviceByCode(shortCode: string): Microservice | undefined {
    return this.services.find((s) => s.shortCode === shortCode)
  }
}

/**
 * Two services must never collide, on either key. The shortCode is what the
 * sidebar selects by; the repository name is the folder both would be cloned
 * into, and a clash there would have them quietly overwrite each other on a
 * developer's disk. Both are load-time errors so they surface on a tool
 * developer's machine instead.
 */
export function validateMicroservices(services: Microservice[]): void {
  const seenCodes = new Map<string, string>()
  const seenRepos = new Map<string, string>()

  for (const service of services) {
    const clashingCode = seenCodes.get(service.shortCode)
    if (clashingCode) {
      throw new Error(
        `microservices: "${service.microserviceName}" and "${clashingCode}" ` +
          `share the shortCode "${service.shortCode}"`,
      )
    }
    seenCodes.set(service.shortCode, service.microserviceName)

    const repo = repoNameOf(service.gitLocation)
    if (!repo) {
      throw new Error(
        `microservices: "${service.microserviceName}" has a gitLocation with no ` +
          `repository name: "${service.gitLocation}"`,
      )
    }

    const clashingRepo = seenRepos.get(repo)
    if (clashingRepo) {
      throw new Error(
        `microservices: "${service.microserviceName}" and "${clashingRepo}" both clone ` +
          `into "${repo}", so they would overwrite each other`,
      )
    }
    seenRepos.set(repo, service.microserviceName)
  }
}

/**
 * Folds the step ids in and walks the graph. Shared by the catalogue and by
 * resume, which rebuilds the workflow from the task's own snapshot (spec D8)
 * rather than from whatever the installed extension ships today.
 */
export function buildWorkflow(id: string, version: string, file: WorkflowFile): WorkflowDef {
  const steps: Record<string, StepDef> = {}
  for (const [stepId, step] of Object.entries(file.steps)) steps[stepId] = { ...step, id: stepId }

  return {
    id,
    version,
    label: file.label,
    initialStep: file.initialStep,
    steps,
    order: validateGraph(id, file.initialStep, steps),
  }
}

/**
 * A workflow is a directed graph, so it must be checked as one: the entry point
 * exists, every nextStep resolves, and no step is stranded. These are load-time
 * errors so a broken workflow fails on a tool developer's machine rather than a
 * developer's. See spec Section 6.
 */
export function validateGraph(
  workflowId: string,
  initialStep: string,
  steps: Record<string, StepDef>,
): string[] {
  if (!steps[initialStep]) {
    throw new Error(`${workflowId}: initialStep "${initialStep}" is not a step`)
  }

  for (const step of Object.values(steps)) {
    if (step.nextStep && !steps[step.nextStep]) {
      throw new Error(`${workflowId}: step "${step.id}" points at unknown nextStep "${step.nextStep}"`)
    }
    if (step.nextStep === step.id) {
      throw new Error(
        `${workflowId}: step "${step.id}" points at itself, so the workflow can never finish`,
      )
    }
  }

  // Walk from the entry point to establish display order and reachability.
  const order: string[] = []
  const seen = new Set<string>()
  let cursor: string | undefined = initialStep
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    order.push(cursor)
    cursor = steps[cursor]?.nextStep
  }

  const stranded = Object.keys(steps).filter((id) => !seen.has(id))
  if (stranded.length > 0) {
    throw new Error(
      `${workflowId}: step(s) ${stranded.map((s) => `"${s}"`).join(', ')} cannot be reached from "${initialStep}"`,
    )
  }

  for (const step of Object.values(steps)) {
    for (const name of step.prompts) {
      const problem = promptNameProblem(name)
      if (problem) {
        throw new Error(`${workflowId}: step "${step.id}" lists prompt "${name}" — ${problem}`)
      }
    }
  }

  const terminal = order.some((id) => !steps[id]!.nextStep)
  if (!terminal) {
    throw new Error(`${workflowId}: no step is terminal, so the workflow can never finish`)
  }

  return order
}

/**
 * Why a prompt name is unusable, or undefined when it is fine.
 *
 * Checked when the catalogue loads rather than when the prompt is composed, so a
 * typo in a workflow fails on a tool developer's machine instead of three steps
 * into somebody's task. Existence cannot be checked here — the file may live in
 * a team's content folder, which the catalogue knows nothing about.
 */
export function promptNameProblem(name: string): string | undefined {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed === '/') return 'it names no file'
  if (!/\.md$/i.test(trimmed)) return 'prompts are markdown files, so it must end in .md'
  if (trimmed.split(/[\\/]/).includes('..')) {
    return 'it climbs out of the prompts folder, which is not allowed'
  }
  if (/^[A-Za-z]:/.test(trimmed) || trimmed.startsWith('\\\\')) {
    return 'it is an absolute path. Name it relative to the prompts folder, such as ' +
      '"/skills/java-expert.md"'
  }
  return undefined
}

function compareVersions(a: string, b: string): number {
  const [aMaj = 0, aMin = 0] = a.split('.').map(Number)
  const [bMaj = 0, bMin = 0] = b.split('.').map(Number)
  return aMaj !== bMaj ? aMaj - bMaj : aMin - bMin
}
