import type { I18nObject } from '../types'
import type { XpertViewScalar } from './model'

export const XPERT_REMOTE_COMPONENT_INVOKE_CLIENT_COMMAND_MESSAGE_TYPE = 'invokeClientCommand'

export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'
/** Append text selections to the current draft without sending or replacing it. */
export const ASSISTANT_COMPOSER_APPEND_REFERENCES_COMMAND = 'assistant.composer.append_references'
/** Append editable context to the current composer. Never starts a run or changes thread. */
export const ASSISTANT_COMPOSER_INSERT_COMMAND = 'assistant.composer.insert'
export const ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'

export const WORKBENCH_FILE_OPEN_COMMAND = 'workbench.file.open'
export const WORKBENCH_NAVIGATION_OPEN_COMMAND = 'workbench.navigation.open'

export const WORKBENCH_AGENT_EVOLUTION_TARGET = 'agent-evolution.target'
export const WORKBENCH_AGENT_EVOLUTION_CHANGE_TARGET = 'agent-evolution.change'
export const WORKBENCH_ASSISTANT_CONVERSATION_TARGET = 'assistant.conversation'
/** Locate a public message in the currently open group; never opens an Assistant's private runtime. */
export const WORKBENCH_GROUP_MESSAGE_TARGET = 'group.message'
/** Inspect an exact execution; embedded clients may open it without changing the active conversation. */
export const WORKBENCH_ASSISTANT_EXECUTION_TARGET = 'assistant.execution'
/** Opens the current Assistant inside a Project-scoped workbench route. */
export const WORKBENCH_ASSISTANT_PROJECT_TARGET = 'assistant.project'
export const WORKBENCH_EXTENSION_VIEW_TARGET = 'workbench.view'
export const WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET = 'knowledgebase.documents'
/** Resolve the Project's application entry through its registered type and current access checks. */
export const WORKBENCH_PROJECT_APPLICATION_TARGET = 'project.application'
/** Open full Project pipeline management in the configured platform. */
export const WORKBENCH_PROJECT_PIPELINES_TARGET = 'project.pipelines'

export interface XpertViewClientCommandDefinition {
  /** A host must implement this command before mounting the view. Optional actions may omit this. */
  required?: boolean

  key: string
  label?: I18nObject
  description?: I18nObject
  permissions?: string[]
}

export interface AssistantComposerInsertPayload {
  text: string
  workspaceFiles?: { path: string; name: string; mimeType?: string; size?: number }[]
  /** Exact skill names resolved uniquely against the current assistant/project capability catalog. */
  skillNames?: string[]
}

export interface WorkbenchOpenFileEvidenceBox {
  x: number
  y: number
  width: number
  height: number
}

export interface WorkbenchOpenFileEvidence {
  observationId?: string
  attributeCode?: string
  displayValue?: string
  text?: string
  method?: string
  region?: string
  confidence?: number
  locator?: {
    sourceType?: string
    page?: number
    coordinateSpace?: string
    recognitionRotation?: number
    orientationConfidence?: number
    box?: WorkbenchOpenFileEvidenceBox
  }
}

/** Payload accepted by the host-side `workbench.file.open` client command. */
export interface WorkbenchOpenFile {
  id?: string
  fileId?: string
  fileAssetId?: string
  storageFileId?: string
  name: string
  mimeType?: string
  size?: number
  url: string
  previewUrl?: string
  evidence?: WorkbenchOpenFileEvidence
}

export type WorkbenchNavigationOpenTarget =
  | typeof WORKBENCH_AGENT_EVOLUTION_TARGET
  | typeof WORKBENCH_AGENT_EVOLUTION_CHANGE_TARGET
  | typeof WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET
  | typeof WORKBENCH_ASSISTANT_CONVERSATION_TARGET
  | typeof WORKBENCH_GROUP_MESSAGE_TARGET
  | typeof WORKBENCH_ASSISTANT_EXECUTION_TARGET
  | typeof WORKBENCH_ASSISTANT_PROJECT_TARGET
  | typeof WORKBENCH_EXTENSION_VIEW_TARGET
  | typeof WORKBENCH_PROJECT_APPLICATION_TARGET
  | typeof WORKBENCH_PROJECT_PIPELINES_TARGET

export interface WorkbenchNavigationOpenPayload {
  target: WorkbenchNavigationOpenTarget
  targetId?: string
  /** Exact evolution request to select on the existing evaluation page. */
  changeId?: string
  knowledgebaseId?: string
  documentId?: string
  parentId?: string
  /** Exact KnowledgeDocument chunk anchor for evidence navigation. */
  chunkId?: string
  /** One-based source page anchor when the document has an analysis preview. */
  page?: number
  /** Parser/OCR block anchors within the source page. */
  sourceBlockIds?: string[]
  /** Transient source excerpt used for context/highlighting; the host must not place it in the URL. */
  evidenceText?: string
  /** For `group.message`, the current public group ID. Hosts reject navigation to a different group. */
  conversationId?: string
  threadId?: string
  executionId?: string
  /** Untrusted Assistant hint; the host resolves the canonical owner from `conversationId`. */
  xpertId?: string
  /** Platform Chat Project selected for Project-scoped Assistant navigation. */
  projectId?: string
  /** Untrusted identity hint; Project application entry reauthorizes the current persisted node. */
  pipelineNodeId?: string
  /** Read-only Project pipeline return focus, rechecked when the graph is read. */
  pipelineInstanceId?: string
  pipelineRoundId?: string
  viewKey?: string
  selectionId?: string
  parameters?: Record<string, XpertViewScalar | XpertViewScalar[]>
  /** Exact visible message in the requested branch, or a public group message for `group.message`. */
  messageId?: string
  /** Keep the originating Workbench view open during navigation. */
  preserveView?: boolean
}

export interface WorkbenchAssistantConversationOpenRequest {
  conversationId: string
  threadId?: string
  executionId?: string
  /** Untrusted hint; the host must resolve the canonical Assistant from `conversationId`. */
  xpertId?: string
  /** Untrusted hint; the host must resolve the canonical Project from `conversationId`. */
  projectId?: string
  /** Exact visible message in the requested branch. */
  messageId?: string
  /** Keep the originating Workbench view open during navigation. */
  preserveView?: boolean
}

/** Server-authorized runtime scope used to rebuild ChatKit for one persisted Assistant conversation. */
export interface WorkbenchAssistantConversationResolution {
  conversationId: string
  threadId: string
  xpertId: string
  projectId: string | null
  isExternalAssistant: boolean
  messageId?: string
}

export interface WorkbenchAssistantProjectOpenRequest {
  /** Trusted platform Chat Project id; this is distinct from plugin business ids. */
  projectId: string
  /** Inspect a View in this Project without changing the active conversation. */
  view?: WorkbenchExtensionViewOpenRequest
}

export interface WorkbenchExtensionViewOpenRequest {
  viewKey: string
  selectionId?: string
  parameters?: Record<string, XpertViewScalar | XpertViewScalar[]>
}

export interface XpertRemoteComponentInvokeClientCommandRequest {
  type: typeof XPERT_REMOTE_COMPONENT_INVOKE_CLIENT_COMMAND_MESSAGE_TYPE
  requestId: string
  commandKey: string
  payload?: unknown
}

export type AssistantComposerReference = {
  id?: string
  label?: string
  text: string
} & (
  | { type: 'code'; path: string; startLine: number; endLine: number; language?: string }
  | { type: 'quote'; source?: string; messageId?: string }
)
export type AssistantComposerAppendReferencesPayload = { references: AssistantComposerReference[] }

/** Host-owned browser persistence. Plugins never choose an account/storage namespace. */
export const WORKBENCH_CONTENT_DRAFT_COMMAND = 'workbench.content.draft'
export interface XpertViewLocalDraftBinding {
  resourceId: string
  scopeKey: string
  maxBytes: number
}
export type WorkbenchContentDraftRequest = { resourceId: string } & (
  | { operation: 'list' }
  | { operation: 'read'; draftId: string }
  | { operation: 'write'; draftId: string; expectedRevision: number; content: string }
  | { operation: 'delete'; draftId: string; expectedRevision: number }
)
