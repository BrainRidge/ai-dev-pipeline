import * as vscode from 'vscode'
import type { CommandSink, EnvironmentReader, HostPort, SkillsSupport } from '@ai-dev-pipeline/core'
import { ChatHandoff } from '../handoff/ChatHandoff'

const TERMINAL = 'AI Dev Workflow'

/**
 * Where VS Code looks for a developer's own Agent Skills. There are three; this
 * is the Copilot-flavoured one, and writing to more than one would install the
 * same skill several times over. Agent Skills arrived in 1.108; below that,
 * installing one does nothing. See spec Section 18.
 */
const VSCODE_SKILLS: SkillsSupport = {
  dir: '.copilot/skills',
  minimumVersion: '1.108',
}

/**
 * Everything core needs from VS Code, in one object.
 *
 * This is the entirety of what a second IDE has to reimplement. Everything
 * else — the engine, the prompt composer, the state store, the renderer, every
 * task type — is shared. See spec Section 19.
 */
export class VsCodeHost implements HostPort {
  readonly handoff = new ChatHandoff()
  readonly editorVersion = vscode.version
  readonly skills = VSCODE_SKILLS

  readonly sink: CommandSink = {
    async copy(text) {
      await vscode.env.clipboard.writeText(text)
    },
    // sendText with addNewLine false pastes at the prompt and stops. The
    // developer presses Enter; nothing runs because a panel button was clicked.
    async toTerminal(text) {
      const terminal =
        vscode.window.terminals.find((t) => t.name === TERMINAL) ??
        vscode.window.createTerminal({ name: TERMINAL })
      terminal.show()
      terminal.sendText(text, false)
    },
  }

  /**
   * Two one-liners, so that the judgement of what the answers mean stays in
   * `Environment.ts` where it can be tested without an extension host.
   * See spec Section 17.
   */
  readonly environment: EnvironmentReader = {
    setting(id) {
      // Split on the first dot: getConfiguration wants the section and the key
      // separately, and `chat.agent.enabled` is section `chat`, key `agent.enabled`.
      const cut = id.indexOf('.')
      return vscode.workspace.getConfiguration(id.slice(0, cut)).get<boolean>(id.slice(cut + 1))
    },
    async commands() {
      return vscode.commands.getCommands(true)
    },
  }

  /**
   * Opens an artifact for review beside the workflow panel rather than on top of
   * it. `ViewColumn.Beside` because the panel lives in the editor area and a
   * document opened into the same column covers it — which is not merely untidy:
   * it is how the developer loses sight of the step they are being asked to
   * approve. `preserveFocus` because the panel is what they are about to press a
   * button on. See spec Section 9.
   */
  async openInEditor(p: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p))
    await vscode.window.showTextDocument(doc, {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    })
  }
}
