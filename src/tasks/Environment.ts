/** VS Code's own switch for agent mode. Documented, and defaults to true. */
export const AGENT_SETTING = 'chat.agent.enabled'

/** The command mechanism A calls. See spec Section 8. */
export const CHAT_COMMAND = 'workbench.action.chat.open'

/**
 * The two questions about the editor that System Check can actually answer,
 * behind an interface so the answering can be faked.
 */
export interface EnvironmentReader {
  /** A boolean setting's value, or undefined when the setting does not exist. */
  setting(id: string): boolean | undefined
  /** Every command id registered in this window. */
  commands(): Promise<string[]>
}

export interface EnvironmentFinding {
  id: string
  label: string
  required: boolean
  status: 'ok' | 'off' | 'missing' | 'unknown'
  /**
   * How this reads in the right-hand column. A setting is "enabled" or "turned
   * off", never "installed" or "not found" — the tool wording does not fit
   * something that was never on a PATH.
   */
  state: string
  detail: string
  /** What the developer can do about it, when there is anything. */
  fix?: string
}

/**
 * What the editor says about the things this extension depends on.
 *
 * These are not tools on a PATH and they are not team-configurable, which is
 * why they are built in rather than part of `config/tools.json`: every team
 * using this extension depends on Copilot agent mode, because that is
 * [D1](../../docs/spec/04-decisions.md). A team cannot opt out of it and so has
 * nothing to configure.
 *
 * This closes the gap [Section 8](../../docs/spec/08-ai-handoff-step.md) has
 * recorded since P1 under known friction: agent mode had to be enabled, the
 * check was specified, it was never implemented, and a developer with it turned
 * off found out when Copilot answered in chat instead of editing files —
 * several steps into a task.
 */
export async function readEnvironment(
  reader: EnvironmentReader,
): Promise<EnvironmentFinding[]> {
  const agent = reader.setting(AGENT_SETTING)
  const commands = await reader.commands()

  return [
    {
      id: 'agentMode',
      label: 'Copilot agent mode',
      // Required, because the coding and review steps expect Copilot to edit
      // files. With agent mode off it answers in chat and nothing changes.
      required: true,
      status: agent === false ? 'off' : agent === true ? 'ok' : 'unknown',
      state: agent === false ? 'turned off' : agent === true ? 'enabled' : 'could not be checked',
      detail:
        agent === undefined
          ? `${AGENT_SETTING} is not a setting in this version of VS Code, so this could ` +
            `not be checked. It needs 1.99 or later.`
          : 'The implementation and review steps expect Copilot to edit files rather than ' +
            'answer in chat.',
      fix:
        agent === false
          ? `Turn on ${AGENT_SETTING} in Settings. If it will not stay on, your ` +
            `organisation may have disabled agents and an administrator has to enable them.`
          : undefined,
    },
    {
      id: 'chatCommand',
      label: 'One-click handoff',
      // Not required: the handoff ladder degrades to the clipboard and then to
      // a file, and both work. This only decides whether Send to Copilot is one
      // click or one paste. See spec Section 8.
      required: false,
      status: commands.includes(CHAT_COMMAND) ? 'ok' : 'missing',
      state: commands.includes(CHAT_COMMAND) ? 'available' : 'not available',
      detail: commands.includes(CHAT_COMMAND)
        ? `${CHAT_COMMAND} is available, so a prompt can be sent straight into chat.`
        : `${CHAT_COMMAND} is not registered in this window, so every handoff will fall ` +
          `back to the clipboard. Nothing breaks; each one costs a paste.`,
      fix: commands.includes(CHAT_COMMAND)
        ? undefined
        : 'Install and sign in to GitHub Copilot Chat.',
    },
  ]
}
