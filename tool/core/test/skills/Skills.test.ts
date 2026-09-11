import { describe, it, expect } from 'vitest'
import {
  bodyOf,
  decide,
  descriptionOf,
  nameProblem,
  planSkills,
  skillDocument,
  skillLines,
  supportsSkills,
  type SkillFile,
} from '../../src/skills/Skills'

const file = (over: Partial<SkillFile> = {}): SkillFile => ({
  name: 'codebase-analyst',
  path: '/ext/prompts/skills/codebase-analyst/SKILL.md',
  source: 'bundled',
  raw: '---\ndescription: Reading code. Use when investigating behaviour.\n---\nBODY',
  ...over,
})

describe('naming a skill', () => {
  it('accepts lowercase letters, numbers and hyphens', () => {
    for (const name of ['git', 'code-review-2', 'a']) expect(nameProblem(name)).toBeUndefined()
  })

  // VS Code's rule, not ours — a name outside it is not a skill.
  it('refuses capitals, spaces and underscores, and says what to rename', () => {
    for (const name of ['CodeReview', 'code review', 'code_review', '-leading']) {
      expect(nameProblem(name)).toMatch(/lowercase letters, numbers and hyphens/)
    }
  })
})

/**
 * The description is what Copilot matches on to decide whether a skill is
 * relevant — the trigger, not a summary. Guessing one would quietly decide when
 * somebody's skill fires, so a file without one is refused.
 */
describe('the description a skill must declare', () => {
  it('reads it from frontmatter', () => {
    expect(descriptionOf(file().raw!)).toEqual({
      description: 'Reading code. Use when investigating behaviour.',
    })
  })

  it('refuses a file with no frontmatter at all, and says why it matters', () => {
    const result = descriptionOf('Just a body.')
    expect('problem' in result && result.problem).toMatch(/what Copilot matches on/)
  })

  it('refuses frontmatter with no description', () => {
    const result = descriptionOf('---\nname: x\n---\nBody')
    expect('problem' in result && result.problem).toMatch(/no usable `description:`/)
  })

  it('refuses an empty description rather than installing a skill nothing can trigger', () => {
    const result = descriptionOf('---\ndescription: "   "\n---\nBody')
    expect('problem' in result).toBe(true)
  })

  it('strips the frontmatter from the body, so it is not instructed twice', () => {
    expect(bodyOf(file().raw!)).toBe('BODY')
  })
})

describe('the SKILL.md that gets written', () => {
  it('carries the derived name and the declared description', () => {
    expect(
      skillDocument({ name: 'codebase-analyst', description: 'Reading code.', body: 'BODY' }),
    ).toBe('---\nname: codebase-analyst\ndescription: Reading code.\n---\nBODY\n')
  })

  it('is written rather than copied, since the two frontmatter formats differ', () => {
    const doc = skillDocument({ name: 'x', description: 'd', body: 'BODY' })
    expect(doc).not.toContain('output:')
    expect(doc.split('\n').filter((l) => l === '---')).toHaveLength(2)
  })
})

describe('whether this VS Code can load skills at all', () => {
  it('accepts the version Agent Skills arrived in, and later', () => {
    expect(supportsSkills('1.108.0')).toBe(true)
    expect(supportsSkills('1.134.0')).toBe(true)
    expect(supportsSkills('2.0.0')).toBe(true)
  })

  it('refuses earlier ones, including the minimum this extension supports', () => {
    expect(supportsSkills('1.96.0')).toBe(false)
    expect(supportsSkills('1.107.9')).toBe(false)
  })

  it('compares numerically, so 1.110 beats 1.99', () => {
    expect(supportsSkills('1.110.0')).toBe(true)
  })
})

/**
 * The rule from spec Section 16, applied to a folder instead of a settings file:
 * a file is ours to update only if it is absent or still holds exactly what we
 * last wrote. See spec Section 18.
 */
describe('deciding what to do with one skill', () => {
  const skill = { name: 'x', path: '/p/x.md', source: 'bundled' as const, body: 'BODY' }
  const wanted = skillDocument({ name: 'x', description: 'd', body: 'BODY' })

  it('installs one that is not there', () => {
    const { finding, write } = decide(skill, 'd', undefined, undefined)
    expect(finding.status).toBe('installed')
    expect(write).toBe(wanted)
  })

  it('writes nothing when the file already says exactly that', () => {
    const { finding, write } = decide(skill, 'd', wanted, wanted)
    expect(finding.status).toBe('unchanged')
    expect(write).toBeUndefined()
  })

  it('updates one that still holds what it last wrote', () => {
    const stale = skillDocument({ name: 'x', description: 'old', body: 'OLD' })
    const { finding, write } = decide(skill, 'd', stale, stale)
    expect(finding.status).toBe('installed')
    expect(finding.detail).toMatch(/^updated/)
    expect(write).toBe(wanted)
  })

  // The one bug this feature could introduce that nobody would think to look
  // for: a skill somebody tuned, silently reverting.
  it('leaves alone one the developer has edited', () => {
    const { finding, write } = decide(skill, 'd', 'THEIR OWN VERSION', wanted)
    expect(finding.status).toBe('changed-by-you')
    expect(write).toBeUndefined()
    expect(finding.detail).toMatch(/Delete it to take the version from your prompts folder/)
  })

  it('leaves alone one it has no memory of writing', () => {
    expect(decide(skill, 'd', 'SOMEBODY ELSE PUT THIS HERE', undefined).finding.status).toBe(
      'changed-by-you',
    )
  })

  it('says whether a skill came from the team or the bundle', () => {
    expect(decide({ ...skill, source: 'external' }, 'd', undefined, undefined).finding.detail).toMatch(
      /your team's prompts folder/,
    )
    expect(decide(skill, 'd', undefined, undefined).finding.detail).toMatch(/bundled skills/)
  })
})

describe('planning a whole folder of skills', () => {
  it('installs the usable ones and reports the rest, rather than throwing', () => {
    const plan = planSkills(
      [
        file(),
        file({ name: 'no-description', raw: 'Just a body.' }),
        file({ name: 'Bad Name' }),
      ],
      {},
      {},
    )

    expect(plan.findings.map((f) => f.status)).toEqual(['installed', 'unusable', 'unusable'])
    // Only the usable one is written.
    expect(Object.keys(plan.writes)).toEqual(['codebase-analyst'])
  })

  /**
   * A skill that cannot be installed must not stop a developer working — the
   * persona text still reaches Copilot through the composed prompt — and one
   * unparseable file must not cost the report the other skills either.
   */
  it('reports malformed YAML as that one file’s problem, without throwing', () => {
    const plan = planSkills(
      [file({ name: 'broken', raw: '---\n: : :\n---\n' }), file()],
      {},
      {},
    )
    expect(plan.findings.map((f) => f.status)).toEqual(['unusable', 'installed'])
    expect(plan.findings[0]!.detail).toMatch(/not valid YAML/)
    // The good one is still installed.
    expect(Object.keys(plan.writes)).toEqual(['codebase-analyst'])
  })

  it('names the file in an unusable finding, so it can be found and fixed', () => {
    const plan = planSkills([file({ raw: 'no frontmatter' })], {}, {})
    expect(plan.findings[0]!.detail).toContain('/ext/prompts/skills/codebase-analyst/SKILL.md')
  })
})

describe('the skills half of the report', () => {
  const dir = '/Users/you/.copilot/skills'

  it('lists each skill and where they went', () => {
    const lines = skillLines(
      dir,
      [
        { name: 'codebase-analyst', status: 'installed', detail: '' },
        { name: 'evidence-first', status: 'unchanged', detail: '' },
      ],
      true,
    )
    expect(lines[0]).toBe('codebase-analyst  ✓  installed')
    expect(lines[1]).toBe('evidence-first    ✓  already installed')
    expect(lines).toContain(`Installed to ${dir}`)
  })

  it('says plainly when this VS Code is too old, and does not pretend otherwise', () => {
    const lines = skillLines(dir, [], false)
    expect(lines.join('\n')).toMatch(/does not load Agent Skills \(needs 1\.108 or newer\)/)
    expect(lines.join('\n')).not.toContain('Installed to')
  })

  it('says so when there are no skill files rather than showing an empty list', () => {
    expect(skillLines(dir, [], true).join('\n')).toMatch(/no skill files found/)
  })

  it('explains the ones that need explaining, and only those', () => {
    const text = skillLines(
      dir,
      [
        { name: 'fine', status: 'installed', detail: 'should not appear' },
        { name: 'mine', status: 'changed-by-you', detail: 'edited since installed' },
      ],
      true,
    ).join('\n')

    expect(text).toContain('mine — edited since installed')
    expect(text).not.toContain('should not appear')
  })
})

/**
 * A skill is a folder now, so it can be wrong in ways a file could not: empty,
 * or holding its instructions under a name VS Code will not read. Neither may
 * throw, and neither may be silent. See spec Section 18.
 */
describe('a folder that is not a skill', () => {
  it('reports one holding no SKILL.md', () => {
    const plan = planSkills(
      [{ name: 'empty', path: '/p/skills/empty/SKILL.md', source: 'bundled', problem: '/p/skills/empty holds no SKILL.md, so there is nothing to install from it.' }],
      {},
      {},
    )
    expect(plan.findings[0]!.status).toBe('unusable')
    expect(plan.findings[0]!.detail).toMatch(/holds no SKILL\.md/)
    expect(plan.writes).toEqual({})
  })

  it('reports a case-mismatched SKILL.md as the trap it is', () => {
    const plan = planSkills(
      [{ name: 'lower', path: '/p/skills/lower/SKILL.md', source: 'bundled', problem: '/p/skills/lower holds "skill.md", and a skill\'s instructions have to be in "SKILL.md". The difference is invisible on this machine and fatal on a case-sensitive one.' }],
      {},
      {},
    )
    expect(plan.findings[0]!.detail).toMatch(/invisible on this machine and fatal on a case-sensitive one/)
  })

  it('installs the good ones alongside', () => {
    const plan = planSkills(
      [{ name: 'broken', path: '/p/skills/broken/SKILL.md', source: 'bundled', problem: 'no SKILL.md' }, file()],
      {},
      {},
    )
    expect(Object.keys(plan.writes)).toEqual(['codebase-analyst'])
  })
})
