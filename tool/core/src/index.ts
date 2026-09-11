/**
 * The core package's public surface: everything that is the same in every IDE.
 *
 * A host imports from `@ai-dev-pipeline/core` and nothing deeper, so the split
 * between "shared" and "host-specific" is visible in an import line rather than
 * having to be remembered. Anything a host needs that is not exported here is
 * either genuinely host-specific or an oversight — decide which before adding
 * a deep import. See spec Section 19.
 *
 * Generated shape, hand-maintained: add a line when you add a module.
 */
export * from './audit/AuditLog'
export * from './audit/summary'
export * from './bridge/WebviewBridge'
export * from './content/ContentRoot'
export * from './engine/StepDescriptor'
export * from './engine/ToolCatalog'
export * from './engine/WorkflowCatalog'
export * from './engine/WorkflowEngine'
export * from './engine/placeholders'
export * from './engine/schema'
export * from './engine/taskId'
export * from './handoff/Handoff'
export * from './host/HostPort'
export * from './prompt/PromptComposer'
export * from './providers/ManualProvider'
export * from './providers/Provider'
export * from './providers/registry'
export * from './session/SetupSelection'
export * from './session/openFolders'
export * from './session/resume'
export * from './session/setupDescriptor'
export * from './session/taskIndex'
export * from './skills/Skills'
export * from './state/TaskStateStore'
export * from './tasks/CollectRequirement'
export * from './tasks/CommandSink'
export * from './tasks/CopilotEditingHandoff'
export * from './tasks/CopilotHandoff'
export * from './tasks/Environment'
export * from './tasks/GitClone'
export * from './tasks/InvokeCopilot'
export * from './tasks/InvokeCopilotCodeReview'
export * from './tasks/InvokeCopilotCoding'
export * from './tasks/ManualReview'
export * from './tasks/TaskType'
export * from './tasks/ToolCheck'
export * from './tasks/ToolProbe'
export * from './tasks/context'
export * from './tasks/history'
export * from './tasks/promptBlock'
export * from './tasks/registry'
export * from './update/UpdateCheck'
export * from './workspace/TaskWorkspace'
