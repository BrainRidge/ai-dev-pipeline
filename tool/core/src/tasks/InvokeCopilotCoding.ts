import { CopilotEditingHandoff } from './CopilotEditingHandoff'

/** Asks Copilot to implement the change in the repositories in scope. */
export class InvokeCopilotCoding extends CopilotEditingHandoff {
  readonly name = 'invokeCopilotCoding'
  readonly title = 'Implement the code'
  protected readonly instruction =
    'Send the composed prompt to Copilot, which will edit the repositories in scope.'
}
