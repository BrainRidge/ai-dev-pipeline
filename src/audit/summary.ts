import type { AuditEntry } from './AuditLog'

export type Mechanism = 'A' | 'B' | 'C'

export interface HandoffSummary {
  tasks: number
  handoffs: number
  /** How often each rung of the ladder was the one that worked. */
  byMechanism: Record<Mechanism, number>
  /** Prompts composed from a team template versus the bundled default. */
  templates: { external: number; bundled: number }
  /** Placeholders that resolved to nothing, by name and how often. */
  unresolved: Record<string, number>
  /** Handoffs whose declared artifact was seen to appear. */
  outputsDetected: number
  /** Tasks that ran on the bundled sample catalogue rather than a real one. */
  sampleCatalogue: number
  /** Tasks whose workflow snapshot had been edited. */
  snapshotsModified: number
}

/**
 * What the session logs say, across every task on this machine.
 *
 * This exists to answer V1 ([Section 12](../../docs/spec/12-verification-tasks.md)): which
 * rung of the handoff ladder actually works in practice. The data has been on
 * disk all along — what was missing was anybody reading it, and until the
 * `prompt-delivered` entry existed, the mechanism was not in the log at all.
 *
 * Kept free of `vscode` and of the filesystem so it can be tested against
 * fixture entries, which is also what lets the command that renders it stay
 * three lines long.
 */
export function summarise(perTask: AuditEntry[][]): HandoffSummary {
  const summary: HandoffSummary = {
    tasks: perTask.length,
    handoffs: 0,
    byMechanism: { A: 0, B: 0, C: 0 },
    templates: { external: 0, bundled: 0 },
    unresolved: {},
    outputsDetected: 0,
    sampleCatalogue: 0,
    snapshotsModified: 0,
  }

  for (const entries of perTask) {
    for (const entry of entries) {
      const data = entry.data ?? {}

      switch (entry.kind) {
        case 'prompt-delivered': {
          summary.handoffs += 1
          const mechanism = data.mechanism
          if (mechanism === 'A' || mechanism === 'B' || mechanism === 'C') {
            summary.byMechanism[mechanism] += 1
          }
          break
        }
        case 'prompt-composed': {
          if (data.templateSource === 'external') summary.templates.external += 1
          if (data.templateSource === 'bundled') summary.templates.bundled += 1
          for (const name of Array.isArray(data.unresolved) ? data.unresolved : []) {
            const key = String(name)
            summary.unresolved[key] = (summary.unresolved[key] ?? 0) + 1
          }
          break
        }
        case 'output-detected':
          summary.outputsDetected += 1
          break
        case 'content-resolved':
          if (data.source === 'sample') summary.sampleCatalogue += 1
          break
        case 'snapshot-modified':
          summary.snapshotsModified += 1
          break
      }
    }
  }

  return summary
}

/**
 * The summary as a document, because the person who needs it is usually not the
 * person at the keyboard: closing V1 means telling somebody else what the logs
 * say, and a markdown file can be pasted into a ticket.
 */
export function report(summary: HandoffSummary): string {
  const { byMechanism: m, handoffs } = summary
  const share = (n: number) => (handoffs === 0 ? '—' : `${Math.round((n / handoffs) * 100)}%`)

  const lines = [
    '# Handoff report',
    '',
    `${summary.tasks} task${summary.tasks === 1 ? '' : 's'} on this machine, ` +
      `${handoffs} prompt${handoffs === 1 ? '' : 's'} delivered to Copilot.`,
    '',
    '## Which handoff mechanism worked',
    '',
    'The A → B → C ladder from spec Section 8. This is the question V1 asks.',
    '',
    '| Mechanism | How it delivers | Times | Share |',
    '|---|---|---|---|',
    `| A | chat opened with the prompt prefilled | ${m.A} | ${share(m.A)} |`,
    `| B | prompt on the clipboard, chat opened | ${m.B} | ${share(m.B)} |`,
    `| C | prompt written to a file and opened | ${m.C} | ${share(m.C)} |`,
    '',
  ]

  if (handoffs === 0) {
    lines.push('No prompts have been delivered yet, so there is nothing to conclude.', '')
  } else if (m.A === handoffs) {
    lines.push(
      'Mechanism A has never failed on this machine, which is the answer V1 wanted.',
      'It does **not** tell you whether `mode: "agent"` was honoured — that is still',
      'unrecorded, and remains the gap Section 8 describes under known friction.',
      '',
    )
  } else if (m.A === 0) {
    lines.push(
      '**Mechanism A has never succeeded here.** Every handoff fell through to a rung',
      'that needs the developer to paste. Worth raising: the ladder is working as',
      'designed, but the one-click path never does.',
      '',
    )
  } else {
    lines.push(
      `Mechanism A works ${share(m.A)} of the time on this machine, so it is neither`,
      'reliable nor useless. That is the least convenient answer and the one most',
      'worth reporting — it suggests something about the environment rather than',
      'about the code.',
      '',
    )
  }

  lines.push(
    '## Prompt templates',
    '',
    `- composed from a team template: ${summary.templates.external}`,
    `- composed from the bundled default: ${summary.templates.bundled}`,
    '',
    '## Artifacts',
    '',
    `- declared output files seen to appear: ${summary.outputsDetected}`,
    '',
  )

  const unresolved = Object.entries(summary.unresolved).sort((a, b) => b[1] - a[1])
  if (unresolved.length > 0) {
    lines.push(
      '## Placeholders that resolved to nothing',
      '',
      'Each of these is a misspelling in a prompt template. The prompt was sent with',
      'a blank where the text should have been.',
      '',
      ...unresolved.map(([name, count]) => `- \`{{${name}}}\` — ${count} time(s)`),
      '',
    )
  }

  if (summary.sampleCatalogue > 0) {
    lines.push(
      '## Tasks run on the bundled sample',
      '',
      `${summary.sampleCatalogue} task${summary.sampleCatalogue === 1 ? '' : 's'} started ` +
        'with no microservice catalogue configured, so the placeholder services were used ' +
        'and nothing could have been cloned. See spec Section 16.',
      '',
    )
  }

  if (summary.snapshotsModified > 0) {
    lines.push(
      '## Workflow snapshots edited mid-task',
      '',
      `${summary.snapshotsModified} — detection, not prevention, by design. See spec ` +
        'Section 7.',
      '',
    )
  }

  return lines.join('\n')
}
