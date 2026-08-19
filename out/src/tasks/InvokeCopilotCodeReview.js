"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvokeCopilotCodeReview = void 0;
const CopilotEditingHandoff_1 = require("./CopilotEditingHandoff");
/** Asks Copilot to review the change it just made and correct what it finds. */
class InvokeCopilotCodeReview extends CopilotEditingHandoff_1.CopilotEditingHandoff {
    name = 'invokeCopilotCodeReview';
    title = 'Review the code';
    instruction = 'Send the composed prompt to Copilot, which will review the changes and fix what it finds.';
}
exports.InvokeCopilotCodeReview = InvokeCopilotCodeReview;
