import * as vscode from 'vscode'
import {
  derivedFrom,
  fieldsToWrite,
  PIECES,
  resolveContentRootSetting,
  type Piece,
} from '../content/ContentRoot'

/**
 * What we last wrote into the three settings. Kept so that a value the
 * developer has since changed can be told apart from one we put there.
 */
const MEMENTO_KEY = 'aiDevWorkflow.derivedPaths'

/**
 * Fills the three specific settings in from the content root.
 *
 * Writing into a developer's settings.json is unusual, and VS Code offers no
 * undo for it, so the rule is narrow: a field is overwritten only if it is
 * empty or still holds exactly what we last wrote. A prompts folder somebody
 * pointed at a shared repository is theirs, and must not silently revert the
 * next time the content root changes. See spec Section 16.
 *
 * The values are written into the same scope the content root was set in, so a
 * workspace-level root fills workspace-level paths and a team that commits
 * .vscode/settings.json stays consistent.
 */
export async function writeDerivedSettings(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('aiDevWorkflow')
  const root = resolveContentRootSetting(config.get<string>('contentRoot') ?? '')
  if (!root) return

  const workspaceScoped = config.inspect<string>('contentRoot')?.workspaceValue !== undefined
  const target = workspaceScoped
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global
  const memento = workspaceScoped ? context.workspaceState : context.globalState

  const current = Object.fromEntries(
    PIECES.map((piece) => [piece, config.get<string>(piece) ?? '']),
  ) as Record<Piece, string>

  const lastWritten = memento.get<Partial<Record<Piece, string>>>(MEMENTO_KEY) ?? {}
  const pending = fieldsToWrite(current, derivedFrom(root), lastWritten)
  if (Object.keys(pending).length === 0) return

  for (const [piece, value] of Object.entries(pending)) {
    await config.update(piece, value, target)
  }
  await memento.update(MEMENTO_KEY, { ...lastWritten, ...pending })
}
