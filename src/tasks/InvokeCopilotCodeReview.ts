import { CopilotEditingHandoff } from './CopilotEditingHandoff'

/** Asks Copilot to review the change it just made and correct what it finds. */
export class InvokeCopilotCodeReview extends CopilotEditingHandoff {
  readonly name = 'invokeCopilotCodeReview'
  readonly title = 'Review the code'
  protected readonly instruction =
    'Send the composed prompt to Copilot, which will review the changes and fix what it finds.'
}
