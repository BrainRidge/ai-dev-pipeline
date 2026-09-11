/**
 * Fails when the two plugins have drifted.
 *
 * Most of the answer to "make the change in both places" is structural: the
 * engine, the workflows, the prompts and the renderer live in `tool/core` and
 * there is only one copy to change. This checks the rest — the places where the
 * two hosts genuinely hold their own declarations and nothing but a habit keeps
 * them in step.
 *
 * Five things have to match:
 *
 *   1. Versions. core, the .vsix and the IntelliJ jar ship as one release.
 *   2. HostPort. A capability added to the TypeScript interface is a capability
 *      each host must answer. TypeScript enforces this for VS Code by failing
 *      the build; nothing enforces it for Kotlin, so this does.
 *   3. Commands. A command offered in one IDE and not the other is a feature
 *      half the team does not have.
 *   4. Settings. Same, for configuration.
 *   5. Renderer protocol. Both hosts serve the same bundle, so both must agree
 *      on the protocol version it speaks.
 *
 * Run by `npm run verify`, so it fails before review rather than after release.
 * See spec Section 19.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8')
const problems = []

const fail = (what, detail) => problems.push(`${what}\n  ${detail}`)

/** Both sides of a comparison, as sorted name lists. */
function compare(what, a, aName, b, bName) {
  const onlyA = a.filter((x) => !b.includes(x))
  const onlyB = b.filter((x) => !a.includes(x))
  if (onlyA.length) fail(what, `in ${aName} but not ${bName}: ${onlyA.join(', ')}`)
  if (onlyB.length) fail(what, `in ${bName} but not ${aName}: ${onlyB.join(', ')}`)
}

// ── 1. Versions ────────────────────────────────────────────────────────────
const coreVersion = JSON.parse(read('tool/core/package.json')).version
const vsixVersion = JSON.parse(read('tool/vscode-plugin/package.json')).version
const gradleVersion = /^\s*pluginVersion\s*=\s*(.+)$/m
  .exec(read('tool/intellij-plugin/gradle.properties'))?.[1]
  ?.trim()

if (new Set([coreVersion, vsixVersion, gradleVersion]).size !== 1) {
  fail(
    'The three packages do not share a version.',
    `core ${coreVersion}, vscode-plugin ${vsixVersion}, intellij-plugin ${gradleVersion}`,
  )
}

// ── 2. HostPort ────────────────────────────────────────────────────────────
// The members of `interface HostPort`, which is the entire porting surface.
const hostPortSrc = read('tool/core/src/host/HostPort.ts')
const hostPortBody = /export interface HostPort \{([\s\S]*?)\n\}/.exec(hostPortSrc)?.[1] ?? ''
const portMembers = [
  ...hostPortBody.matchAll(/^\s*(?:readonly\s+)?([a-zA-Z][a-zA-Z0-9]*)\s*[(:]/gm),
].map((m) => m[1])

if (portMembers.length === 0) fail('Could not read HostPort.', 'The interface shape changed.')

// The Kotlin host answers each one with a function of the same name. `sink` and
// `environment` are objects on the TypeScript side, so their own members are
// what Kotlin implements — named for the leaf, not the container.
const KOTLIN_EXPANSION = {
  sink: ['copy', 'toTerminal'],
  environment: ['setting', 'commands'],
  handoff: [], // answered by the sidecar's own ladder, not by the JVM host
}
const expectedKotlin = portMembers.flatMap((m) => KOTLIN_EXPANSION[m] ?? [m])

const kotlinSrc = read(
  'tool/intellij-plugin/src/main/kotlin/com/brainridge/aidevworkflow/sidecar/IntellijHost.kt',
)
const kotlinMembers = [...kotlinSrc.matchAll(/^\s*fun\s+([a-zA-Z][a-zA-Z0-9]*)\s*\(/gm)].map(
  (m) => m[1],
)

compare(
  'HostPort is not implemented the same way in both plugins.',
  expectedKotlin, 'core/src/host/HostPort.ts',
  kotlinMembers, 'IntellijHost.kt',
)

// ── 3. Commands ────────────────────────────────────────────────────────────
const vsixManifest = JSON.parse(read('tool/vscode-plugin/package.json'))
const vsCommands = (vsixManifest.contributes?.commands ?? []).map((c) => c.command).sort()

const pluginXml = read('tool/intellij-plugin/src/main/resources/META-INF/plugin.xml')
const ijCommands = [...pluginXml.matchAll(/<action\s+id="([^"]+)"/g)].map((m) => m[1]).sort()

compare(
  'The two plugins do not offer the same commands.',
  vsCommands, 'package.json contributes.commands',
  ijCommands, 'plugin.xml actions',
)

// ── 4. Settings ────────────────────────────────────────────────────────────
const vsSettings = Object.keys(vsixManifest.contributes?.configuration?.properties ?? {})
  .map((k) => k.replace(/^aiDevWorkflow\./, ''))
  .sort()

const settingsKt = read(
  'tool/intellij-plugin/src/main/kotlin/com/brainridge/aidevworkflow/settings/AiDevWorkflowSettings.kt',
)
const stateBody = /data class State\(([\s\S]*?)\n  \)/.exec(settingsKt)?.[1] ?? ''
const ijSettings = [...stateBody.matchAll(/var\s+([a-zA-Z][a-zA-Z0-9]*)\s*:/g)]
  .map((m) => m[1])
  .sort()

compare(
  'The two plugins do not expose the same settings.',
  vsSettings, 'package.json contributes.configuration',
  ijSettings, 'AiDevWorkflowSettings.State',
)

// ── 5. Renderer protocol ───────────────────────────────────────────────────
// One renderer bundle serves both, so a host that pins a different protocol
// version would show the reload prompt on every render. See spec Section 9.
const protocol = /export const PROTOCOL_VERSION = (\d+)/.exec(
  read('tool/core/src/engine/StepDescriptor.ts'),
)?.[1]

if (!protocol) fail('Could not read PROTOCOL_VERSION.', 'StepDescriptor.ts changed shape.')

// ── Report ─────────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error(`\n✗ ${problems.join('\n\n✗ ')}\n`)
  console.error(
    'Both plugins have to change together. If the difference is deliberate —\n' +
      'a capability one IDE genuinely cannot offer — say so in spec Section 19\n' +
      'and add it to the exception list in this script.\n',
  )
  process.exit(1)
}

console.log(
  `✓ both plugins at ${coreVersion}: ` +
    `${portMembers.length} HostPort members, ${vsCommands.length} commands, ` +
    `${vsSettings.length} settings, renderer protocol ${protocol}`,
)
