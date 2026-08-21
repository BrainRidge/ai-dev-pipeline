# Task 2: Provenance — the caption and the audit fields

> Part of the [External content implementation plan](README.md).

Silent fallback is only acceptable if it is visible afterwards. This task adds
the two surfaces the spec requires: a caption above the composed prompt in the
panel, and `templatePath` / `templateSource` on the `prompt-composed` audit
entry.

The caption is carried as a new optional `note` on `CommandBlock`. That keeps
the renderer generic — it draws a note if one arrives and knows nothing about
templates — so [invariant 1](../../spec/05-architecture.md) still holds.
`CommandBlock` is declared twice on purpose, once in `src/tasks/context.ts` and
once in `webview/render/fields.ts`, because ESLint forbids the renderer from
importing `src/**`. Both copies change.

**Files:**
- Modify: `src/tasks/context.ts` — the `CommandBlock` interface
- Modify: `src/tasks/promptBlock.ts` — `composePreview` and `promptBlock`
- Modify: `src/tasks/InvokeCopilot.ts` — `deliver`, the audit append (Task 1 already edited this method)
- Modify: `src/tasks/CopilotEditingHandoff.ts` — `deliver`
- Modify: `webview/render/fields.ts` — the `CommandBlock` interface and `commandList`
- Modify: `webview/style.css` — after the `.cmd-label` rule
- Modify: `test/tasks/InvokeCopilot.test.ts` — the `composer` stub
- Modify: `test/tasks/CopilotEditingHandoff.test.ts` — the `composer` stub
- Modify: `test/webview/commands.test.ts`

**Interfaces:**
- Consumes: `ComposedPrompt.templatePath` / `.templateSource`, `PromptComposer.resolved` (Task 1); `templateNote` (Task 0)
- Produces: `CommandBlock.note?: string`; `prompt-composed` audit entries carrying `templatePath: string` and `templateSource: 'external' | 'bundled'`

---

- [ ] **Step 1: Teach the two composer fakes about resolution**

Both handoff test files stub `PromptComposer` with an object cast. `composePreview`
is about to ask those stubs for provenance, so they need to answer.

In `test/tasks/InvokeCopilot.test.ts`, replace the `composer` constant:

```typescript
const composer = {
  async compose() {
    return {
      prompt: 'COMPOSED PROMPT',
      outputFile: '02-analysis.md',
      templatePath: '/ext/prompts/researchTaskWorkflow/aiHandoff.md',
      templateSource: 'bundled' as const,
    }
  },
  async outputFor() {
    return '02-analysis.md'
  },
  async resolved() {
    return {
      path: '/ext/prompts/researchTaskWorkflow/aiHandoff.md',
      source: 'bundled' as const,
    }
  },
} as unknown as PromptComposer
```

In `test/tasks/CopilotEditingHandoff.test.ts`, replace its `composer` constant:

```typescript
/** An editing template declares no output, so compose returns none. */
const composer = {
  async compose() {
    return {
      prompt: 'COMPOSED PROMPT',
      outputFile: undefined,
      templatePath: '/team/prompts/newFeatureWorkflow/CodeImplementation.md',
      templateSource: 'external' as const,
    }
  },
  async resolved() {
    return {
      path: '/team/prompts/newFeatureWorkflow/CodeImplementation.md',
      source: 'external' as const,
    }
  },
} as unknown as PromptComposer
```

- [ ] **Step 2: Write the failing tests for the caption and the audit fields**

Append to `test/tasks/InvokeCopilot.test.ts`:

```typescript
describe('the developer can see which template composed the prompt', () => {
  it('captions the prompt block with the resolved template', async () => {
    const view = await task().describe(handoffStep, ctx, {})
    expect(view.commands?.[0]?.note).toBe(
      'Template: /ext/prompts/researchTaskWorkflow/aiHandoff.md (bundled default)',
    )
  })

  it('still captions the block when the developer has rewritten the prompt', async () => {
    const view = await task().describe(handoffStep, ctx, {
      edited: { prompt: 'MY OWN WORDS' },
    })
    expect(view.commands?.[0]?.note).toContain('aiHandoff.md')
  })

  // The log has always answered "what was asked". It now also answers
  // "whose template asked it". See spec Section 16.
  it('records the template path and source alongside the prompt', async () => {
    const audit = fakeAudit()
    const t = new InvokeCopilot(composer, handoffReturning('A'), audit, async () => true, noSink)
    await t.deliver(handoffStep, ctx)
    expect(audit.logged[0]!.data).toMatchObject({
      templatePath: '/ext/prompts/researchTaskWorkflow/aiHandoff.md',
      templateSource: 'bundled',
    })
  })
})
```

Append to `test/tasks/CopilotEditingHandoff.test.ts`:

```typescript
describe('provenance on an editing handoff', () => {
  it('records the template path and source, even with no output contract', async () => {
    const audit = fakeAudit()
    const t = new InvokeCopilotCoding(composer, handoffReturning('A'), audit, noSink)
    await t.deliver(coding, ctx)
    expect(audit.logged[0]!.data).toMatchObject({
      templatePath: '/team/prompts/newFeatureWorkflow/CodeImplementation.md',
      templateSource: 'external',
    })
  })

  it('captions the prompt block so a team override is visible on screen', async () => {
    const view = await task().describe(coding, ctx, {})
    expect(view.commands?.[0]?.note).toBe(
      'Template: /team/prompts/newFeatureWorkflow/CodeImplementation.md (external)',
    )
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/tasks/InvokeCopilot.test.ts test/tasks/CopilotEditingHandoff.test.ts`
Expected: FAIL — `note` is undefined, and the audit data has no `templatePath`

- [ ] **Step 4: Add `note` to the host-side CommandBlock**

In `src/tasks/context.ts`, inside `CommandBlock`, after `lines`:

```typescript
  /**
   * A caption under the label. Used to show which prompt template composed the
   * block, so a fallback to the bundled default is visible rather than silent.
   * See spec Section 16.
   */
  note?: string
```

- [ ] **Step 5: Set the caption when building the prompt block**

In `src/tasks/promptBlock.ts`, import `templateNote` and thread the note through:

```typescript
import { templateNote } from '../content/ContentRoot'
```

```typescript
export async function composePreview(
  composer: PromptComposer,
  step: StepDef,
  ctx: StepContext,
  override?: string,
): Promise<PromptPreview> {
  try {
    // An override replaces the text but not the provenance: the caption still
    // reports which template this step would compose from.
    if (override !== undefined) {
      const note = templateNote(await composer.resolved(step, ctx))
      return { block: promptBlock(override, true, note) }
    }

    const composed = await composer.compose(step, ctx, reposBefore(ctx, step.id))
    const note = templateNote({
      path: composed.templatePath,
      source: composed.templateSource,
    })
    return { block: promptBlock(composed.prompt, false, note) }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}

function promptBlock(text: string, edited: boolean, note: string): CommandBlock {
  return {
    id: PROMPT_BLOCK_ID,
    label: edited ? 'Composed prompt (edited)' : 'Composed prompt',
    note,
    lines: text.split('\n'),
    editable: true,
    actions: [
      { id: 'copy', label: 'Copy' },
      { id: 'send', label: 'Send to Copilot' },
      ...(edited ? [{ id: 'reset', label: 'Reset' }] : []),
    ],
  }
}
```

Note that the `override` branch now sits inside the `try`, so a case-mismatched
template reports its error on the step even when the developer has edited the
prompt.

- [ ] **Step 6: Record provenance in the audit log**

In `src/tasks/InvokeCopilot.ts`, `deliver` already destructures `composed`. Widen
it and extend the entry:

```typescript
    const composed = await this.composer.compose(step, ctx, reposBefore(ctx, step.id))
    const { outputFile, templatePath, templateSource } = composed
```

```typescript
    // Written BEFORE delivery so a crash still leaves the record.
    await this.audit.append({
      kind: 'prompt-composed',
      stepId: step.id,
      data: { prompt, chars: prompt.length, outputFile, templatePath, templateSource },
    })
```

In `src/tasks/CopilotEditingHandoff.ts`, `deliver` currently discards everything
but the prompt. Keep the composed result:

```typescript
  async deliver(step: StepDef, ctx: StepContext, override?: string): Promise<Delivery> {
    const composed = await this.composer.compose(step, ctx, reposBefore(ctx, step.id))
    const prompt = override ?? composed.prompt

    // Written BEFORE delivery so a crash still leaves the record.
    await this.audit.append({
      kind: 'prompt-composed',
      stepId: step.id,
      data: {
        prompt,
        chars: prompt.length,
        templatePath: composed.templatePath,
        templateSource: composed.templateSource,
      },
    })
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run test/tasks`
Expected: PASS

- [ ] **Step 8: Write the failing renderer test**

In `test/webview/commands.test.ts`, add `note` to the `pis` block in the
descriptor:

```typescript
        {
          id: 'pis',
          label: 'party-service (pis)',
          note: 'Template: /team/prompts/w/s.md (external)',
          lines: ['git clone https://x/party-service /code/pis', 'cd /code/pis', 'git pull'],
        },
```

and append a describe block:

```typescript
describe('a block with a note', () => {
  it('draws the note for the block that has one', () => {
    const note = render().querySelector('.cmd-block[data-block=pis] .cmd-note')
    expect(note?.textContent).toBe('Template: /team/prompts/w/s.md (external)')
  })

  it('draws no note element for a block without one', () => {
    expect(render().querySelector('.cmd-block[data-block=ris] .cmd-note')).toBeNull()
  })
})
```

- [ ] **Step 9: Run it to verify it fails**

Run: `npx vitest run test/webview/commands.test.ts`
Expected: FAIL — `note` is not a known property, and `.cmd-note` is null

- [ ] **Step 10: Draw the note in the renderer**

In `webview/render/fields.ts`, add to the renderer's own `CommandBlock`
declaration, after `lines`:

```typescript
  /** A caption under the label. The renderer draws it and asks no questions. */
  note?: string
```

and in `commandList`, immediately after `box.append(head)`:

```typescript
    if (block.note) box.append(el('div', 'cmd-note', block.note))
```

- [ ] **Step 11: Style it**

In `webview/style.css`, after the `.cmd-label` rule:

```css
.cmd-note {
  padding: 0 .5rem .35rem;
  color: var(--vscode-descriptionForeground);
  font-size: .8em;
  word-break: break-all;
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npx vitest run test/webview`
Expected: PASS

- [ ] **Step 13: Run the full gate and rebuild**

Run: `npm run verify && npm run build`
Expected: PASS, 413 tests

- [ ] **Step 14: Commit**

```bash
git add src/tasks/context.ts src/tasks/promptBlock.ts src/tasks/InvokeCopilot.ts \
        src/tasks/CopilotEditingHandoff.ts webview/render/fields.ts webview/style.css \
        test/ out/
git commit -m "feat(provenance): show and log which template composed a prompt

A caption above the prompt block, and templatePath/templateSource on the
prompt-composed audit entry. Carried as a generic CommandBlock note, so
the renderer still knows nothing about templates. See spec Section 16."
```
