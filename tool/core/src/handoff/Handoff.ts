/**
 * How a composed prompt reaches the assistant's chat box.
 *
 * The interface is core because every task type depends on it; the
 * implementations are host-specific because nothing about opening a chat is
 * portable. See spec Sections 8 and 19.
 *
 * `Mechanism` is the rung of the fallback ladder that succeeded, and it is
 * recorded in the audit log. A host that cannot offer a rung never returns its
 * letter — an IntelliJ host has no equivalent of VS Code's internal
 * `workbench.action.chat.open`, so it starts at B.
 */
export type Mechanism = 'A' | 'B' | 'C'

export interface Handoff {
  deliver(prompt: string, taskDir: string): Promise<Mechanism>
}
