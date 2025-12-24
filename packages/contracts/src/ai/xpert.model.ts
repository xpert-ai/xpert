import { ToolCall as LToolCall } from '@langchain/core/messages/tool'
import { RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
import { ITag } from '../tag-entity.model'
import { IUser, LanguagesEnum } from '../user.model'
import { ICopilotModel, TCopilotModel } from './copilot-model.model'
import { IKnowledgebase, TKBRecallParams } from './knowledgebase.model'
import { ChecklistItem, I18nObject, IPoint, ISize, TAvatar } from '../types'
import { IXpertAgent } from './xpert-agent.model'
import { IXpertToolset } from './xpert-toolset.model'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'
import { IIntegration } from '../integration.model'
import { TChatFrom, TSensitiveOperation } from './chat.model'
import { IWorkflowNode, TVariableAssigner, TWFCase, VariableOperationEnum } from './xpert-workflow.model'
import { IEnvironment } from './environment.model'
import { IStorageFile } from '../storage-file.model'
import { STATE_VARIABLE_HUMAN } from '../agent/graph'
import { TInterruptCommand } from '../agent/interrupt'

export type ToolCall = LToolCall

export enum XpertTypeEnum {
  /**
   * Chat Agents
   */
  Agent = 'agent',

  /**
   * Copilot in UI
   */
  Copilot = 'copilot',

  /**
   * Knowledge Workflow
   */
  Knowledge = 'knowledge',
}

export type TXpertFeatures = {
  opener: {
    enabled: boolean
    message: string
    questions: string[]
  }

  suggestion: {
    enabled: boolean
    prompt: string
  }

  textToSpeech: {
    enabled: boolean
    copilotModel?: TCopilotModel
  }

  speechToText: {
    enabled: boolean
    copilotModel?: TCopilotModel
  }

  /**
   * File upload feature
   */
  attachment?: TXpertAttachment

  /**
   * Reply with memory(Q&A)
   */
  memoryReply?: {
    enabled: boolean
    scoreThreshold?: number
  }
}

export type TXpert = {
  /**
   * Unique slug identifier, generated from name
   */
  slug: string
  /**
   * Expert name
   */
  name: string
  /**
   * Expert type
   */
  type: XpertTypeEnum
  title?: string
  /**
   * @deprecated use title
   */
  titleCN?: string
  /**
   * Expert description
   */
  description?: string

  /**
   * Is active
   */
  active?: boolean
  /**
   * Avatar Object
   */
  avatar?: TAvatar

  /**
   * Conversation starters
   */
  starters?: string[]

  /**
   * More configuration
   */
  options?: TXpertOptions
  /**
   * Config for every agent
   */
  agentConfig?: TXpertAgentConfig
  /**
   * Config of summarize past conversations
   */
  summarize?: TSummarize
  /**
   * Long-term memory config
   */
  memory?: TLongTermMemory

  features?: TXpertFeatures

  /**
   * Version of role: '1' '2' '2.1' '2.2'...
   */
  version?: string
  /**
   * Is latest version
   */
  latest?: boolean
  /**
   * Release notes
   */
  releaseNotes?: string

  /**
   * Draft on current version
   */
  draft?: TXpertTeamDraft
  /**
   * Published graph
   */
  graph?: TXpertGraph

  api?: TChatApi
  app?: TChatApp
  userId?: string
  user?: IUser

  /**
   * Primary agent for this expert
   */
  agent?: IXpertAgent

  // Many to one
  // Used copilot model
  copilotModel?: ICopilotModel
  copilotModelId?: string

  // One to many
  agents?: IXpertAgent[]

  // Many to many relationships

  /**
   * Sub-experts, Digital experts who perform specific tasks, focus on completing the assigned work
   */
  executors?: IXpert[]
  /**
   * The task coordinator who called this expert
   */
  leaders?: IXpert[]

  knowledgebases?: IKnowledgebase[]
  toolsets?: IXpertToolset[]

  /**
   * The corresponding person in charge, whose has the authority to execute this digital expert
   */
  managers?: IUser[]
  /**
   * Integrations for this xpert
   */
  integrations?: IIntegration[]
  
  tags?: ITag[]
}

/**
 * Digital Expert
 */
export interface IXpert extends IBasePerWorkspaceEntityModel, TXpert {
  environmentId?: string
	environment?: IEnvironment
  /**
   * When type is 'knowledge', it must binding a knowledgebase
   */
  knowledgebase?: IKnowledgebase
}

export type TXpertOptions = {
  knowledge?: Record<
    string,
    {
      position?: IPoint
      size?: ISize
    }
  >
  toolset?: Record<
    string,
    {
      position?: IPoint
      size?: ISize
    }
  >
  agent?: Record<
    string,
    {
      position?: IPoint
      size?: ISize
    }
  >
  xpert?: Record<
    string,
    {
      position?: IPoint
      size?: ISize
    }
  >
  position?: IPoint
  scale?: number
}

/**
 * Config for Agent execution (Langgraph.js)
 */
export type TXpertAgentConfig = {
  /**
   * Maximum number of times a call can recurse. If not provided, defaults to 25.
   */
  recursionLimit?: number;
  /** Maximum number of parallel calls to make. */
  maxConcurrency?: number;
  /**
   * Timeout for this call in milliseconds.
   */
  timeout?: number;

  /**
   * Sensitive tools and agents
   */
  interruptBefore?: string[]
  /**
   * End nodes
   */
  endNodes?: string[]

  /**
   * Custom variables of graph state
   */
  stateVariables?: TStateVariable[]

  /**
   * Custom input parameters should be consistent with the start node or primary agent parameters.
   */
  parameters?: TXpertParameter[]

  /**
   * @deprecated use memories in tools
   */
  toolsMemory?: Record<string, TVariableAssigner[]>

  /**
   * Disable agent's output
   * @deprecated use `mute` instead
   */
  disableOutputs?: string[]

  /**
   * Mute nodes in the graph of agents: filter messages by tags of stream events
   */
  mute?: string[][]

  /**
   * Recall knowledge params
   */
  recalls?: Record<string, TKBRecallParams>

  /**
   * Retrieval params for every knowledgebase
   */
  retrievals?: Record<string, TKBRetrievalSettings>

  /**
   * Summarize the title of the conversation
   */
  summarizeTitle?: {
    disable?: boolean
    instruction?: string
  }

  tools?: Record<string, {
    /**
     * Memory assigner for tool's results. (save result of tool call into state variable)
     */
    memories?: TVariableAssigner[]
    timeout?: number
    /**
     * Custom description for the tool
     */
    description?: string
  }>
}

export type TStateVariableType = XpertParameterTypeEnum | 'object' | 'array[string]' | 'array[number]' | 'array[object]'
/**
 */
export type TStateVariable<ValueType = any, UpdateType = ValueType> = TXpertParameter & {
  type: TStateVariableType
  default?: any
  reducer?: (a: ValueType, b: UpdateType) => ValueType
  operation?: VariableOperationEnum
}

/**
 * Config for summarizing past conversations
 */
export type TSummarize = {
  enabled?: boolean
  /**
   * The system prompt guide how to summarize the conversation
   */
  prompt?: string
  /**
   * The maximum number of tolerated messages, otherwise it will be summarized.
   * Should be greater than the number of retained messages
   */
  maxMessages?: number
  /**
   * Number of retained messages
   */
  retainMessages?: number
}

export enum LongTermMemoryTypeEnum {
  PROFILE = 'profile',
  QA = 'qa',
}

export type TLongTermMemoryConfig = {
  enabled?: boolean
  /**
   * System prompt guide how to remember the key points of the conversation
   */
  prompt?: string
}
/**
 * Config of long-term memory
 */
export type TLongTermMemory = {
  enabled?: boolean
  // type?: LongTermMemoryTypeEnum
  copilotModel?: TCopilotModel
  profile?: TLongTermMemoryConfig & {
    afterSeconds?: number
  }
  qa?: TLongTermMemoryConfig
}

export type TXpertAttachmentType = 'document' | 'image' | 'audio' | 'video' | 'others'
export type TXpertAttachment = {
  enabled?: boolean
  type?: 'upload' | 'url' | 'all'
  maxNum?: number
  fileTypes?: Array<TXpertAttachmentType>
}

export enum XpertParameterTypeEnum {
  /**
   * @deprecated use string
   */
  TEXT = 'text',
  /**
   * @deprecated use string
   */
  PARAGRAPH = 'paragraph',
  STRING = 'string',
  NUMBER = 'number',
  OBJECT = 'object',
  SELECT = 'select',
  FILE = 'file',
  ARRAY_STRING = 'array[string]',
  ARRAY_NUMBER = 'array[number]',
  ARRAY = 'array[object]',
  ARRAY_FILE = 'array[file]',
  ARRAY_DOCUMENT = 'array[document]',

  BOOLEAN = 'boolean',
  SECRET = 'secret',
}

export type TXpertParameter = {
  type: XpertParameterTypeEnum
  name: string
  /**
   * @deprecated use description and name only
   */
  title?: string
  description?: string | I18nObject
  optional?: boolean
  default?: any
  maximum?: number
  options?: string[]
  item?: TXpertParameter[]
}

export type TChatApp = {
  enabled?: boolean
  public?: boolean
}

export type TChatApi = {
  disabled?: boolean
}

// Xpert team draft types
export type TXpertGraph = {
  nodes: TXpertTeamNode[]
  connections: TXpertTeamConnection[]
}

export type TXpertTeamDraft = TXpertGraph & {
  team: Partial<IXpert>
  savedAt?: Date
  checklist?: ChecklistItem[]
}

export type TXpertTeamNodeType = 'agent' | 'knowledge' | 'toolset' | 'xpert' | 'workflow'

export type TXpertTeamNode = {
  key: string
  type: TXpertTeamNodeType
  position: IRect
  size?: ISize
  hash?: string
  parentId?: string
  readonly?: boolean
} & (
  | {
      type: 'agent'
      entity: IXpertAgent
    }
  | {
      type: 'knowledge'
      entity: IKnowledgebase
    }
  | {
      type: 'toolset'
      entity: IXpertToolset
    }
  | {
      type: 'xpert'
      entity: IXpert
      nodes?: TXpertTeamNode[]
      connections?: TXpertTeamConnection[]
      expanded?: boolean
    }
  | {
      type: 'workflow'
      entity: IWorkflowNode
    }
)

export interface IRect extends IPoint, Partial<ISize> {
  gravityCenter?: IPoint
}

export type TXpertTeamGroup = {
  id: string
  title: string
  position: IPoint
  size?: ISize
  parentId?: string
  team: IXpert
  agent?: IXpertAgent
}

export interface TXpertTeamConnection {
  key: string
  from: string
  to: string
  /**
   * - edge: Horizontal Process, workflow
   * - others: Vertical Process, agent
   */
  type: 'edge' | TXpertTeamNodeType

  readonly?: boolean
}

/**
 * Human input message, include parameters and attachments
 */
export type TChatRequestHuman = {
  input?: string
  files?: Partial<IStorageFile>[]
  [key: string]: unknown
}

export type TChatRequest = {
  /**
   * The human input, include parameters
   */
  input: TChatRequestHuman
  /**
   * Custom graph state
   */
  state?: {[STATE_VARIABLE_HUMAN]: TChatRequestHuman} & Record<string, any>
  xpertId: string
  agentKey?: string
  projectId?: string
  conversationId?: string
  environmentId?: string
  id?: string
  executionId?: string
  confirm?: boolean
  /**
   * Reject the sensitive tool calls
   * @deprecated use confirm with command resume instead
   */
  reject?: boolean
  /**
   * Message to update parameters of last tool call message
   * @deprecated use `command` instead
   */
  operation?: TSensitiveOperation
  command?: TInterruptCommand
  retry?: boolean
}

export type TChatOptions = {
  conversationId?: string
  /**
   * @deprecated
   */
  knowledgebases?: string[]
  /**
   * @deprecated
   */
  toolsets?: string[]
  /**
   * The language used by the current browser page
   */
  language?: LanguagesEnum
  /**
   * The browser's time zone
   */
  timeZone?: string
  /**
   * Call from
   */
  from?: TChatFrom
  /**
   * Whether to summarize the conversation title
   */
  summarizeTitle?: boolean
  /**
   * Project ID, identify the project where the xpert invoked
   */
  projectId?: string
  /**
   * Schedule task ID
   */
  taskId?: string
  /**
   * Specify environment with variables to run
   */
  environment?: IEnvironment
  /**
   * Specify additional tools
   */
  tools?: (StructuredToolInterface | RunnableToolLike)[]
}

/**
 * Knowledgebase retrieval settings
 */
export type TKBRetrievalSettings = {
  metadata: {
    filtering_mode: "disabled" | "automatic" | "manual"
    /**
     * Conditions (filter) when mode is manual
     */
    filtering_conditions: TWFCase
    /**
     * Parameter fields (tool call) when mode is automatic
     */
    fields: Record<string, object>
  }
}