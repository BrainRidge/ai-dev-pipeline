"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvokeCopilotCoding = void 0;
const CopilotEditingHandoff_1 = require("./CopilotEditingHandoff");
/** Asks Copilot to implement the change in the repositories in scope. */
class InvokeCopilotCoding extends CopilotEditingHandoff_1.CopilotEditingHandoff {
    name = 'invokeCopilotCoding';
    title = 'Implement the code';
    instruction = 'Send the composed prompt to Copilot, which will edit the repositories in scope.';
}
exports.InvokeCopilotCoding = InvokeCopilotCoding;
