"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Browser-only development harness.
 *
 * The descriptor is the renderer's ONLY input, so the UI can be built and
 * eyeballed with no extension host, no F5 and no debugging session:
 *
 *   npm run build && open webview/fixtures/dev.html
 *
 * Edit a fixture below, rebuild, refresh the browser.
 */
const fields_1 = require("../render/fields");
const workflow_json_1 = __importDefault(require("./workflow.json"));
const form_step_json_1 = __importDefault(require("./form-step.json"));
const FIXTURES = {
    'workflow (middle pane)': { kind: 'workflow', data: workflow_json_1.default },
    'setup form (sidebar)': { kind: 'single', data: form_step_json_1.default },
};
const root = document.getElementById('root');
const picker = document.getElementById('fixture');
for (const name of Object.keys(FIXTURES)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    picker.append(opt);
}
function show(name) {
    const fixture = FIXTURES[name];
    if (!fixture)
        return;
    if (fixture.kind === 'workflow') {
        (0, fields_1.renderWorkflow)(fixture.data, root, (stepId, actionId, values) => console.log('step:', stepId, 'action:', actionId, 'values:', values));
    }
    else {
        (0, fields_1.renderStep)(fixture.data, root, (actionId, values) => console.log('action:', actionId, 'values:', values));
    }
}
picker.addEventListener('change', () => show(picker.value));
show(picker.value || 'workflow (middle pane)');
