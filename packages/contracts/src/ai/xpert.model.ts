import { ToolCall as LToolCall } from '@langchain/core/dist/messages/tool'
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
import { IWorkflowNode, TVariableAssigner, VariableOperationEnum } from './xpert-workflow.model'
import { IEnvironment } from './environment.model'
import { IStorageFile } from '../storage-file.model'
import { TInterruptCommand } from '../agent'

export type ToolCall = LToolCall

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
  slug: string
  name: string
  type: XpertTypeEnum
  title?: string
  titleCN?: string
  description?: string

  active?: boolean
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
   * Draft on current version
   */
  draft?: TXpertTeamDraft
  graph?: TXpertGraph

  api?: TChatApi
  app?: TChatApp
  userId?: string
  user?: IUser

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
   * Memory assigner for tool's results. (save result of tool call into state variable)
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
   * Recall params
   */
  recalls?: Record<string, TKBRecallParams>

  /**
   * Summarize the title of the conversation
   */
  summarizeTitle?: {
    disable?: boolean
    instruction?: string
  }
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

export enum XpertTypeEnum {
  Agent = 'agent',
  Copilot = 'copilot'
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
  ARRAY_STRING = 'array[string]',
  ARRAY = 'array[object]',
  ARRAY_FILE = 'array[file]',

  BOOLEAN = 'boolean',
  SECRET = 'secret',
}

export type TXpertParameter = {
  type: XpertParameterTypeEnum
  name: string
  title?: string
  description?: string | I18nObject
  optional?: boolean
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
}

export enum ChatMessageTypeEnum {
  // LOG = 'log',
  MESSAGE = 'message',
  EVENT = 'event'
}

/**
 * https://js.langchain.com/docs/how_to/streaming/#event-reference
 */
export enum ChatMessageEventTypeEnum {
  ON_CONVERSATION_START = 'on_conversation_start',
  ON_CONVERSATION_END = 'on_conversation_end',
  ON_MESSAGE_START = 'on_message_start',
  ON_MESSAGE_END = 'on_message_end',
  ON_TOOL_START = 'on_tool_start',
  ON_TOOL_END = 'on_tool_end',
  ON_TOOL_ERROR = 'on_tool_error',
  /**
   * Step message in tool call
   */
  ON_TOOL_MESSAGE = 'on_tool_message',
  ON_AGENT_START = 'on_agent_start',
  ON_AGENT_END = 'on_agent_end',
  ON_RETRIEVER_START = 'on_retriever_start',
  ON_RETRIEVER_END = 'on_retriever_end',
  ON_RETRIEVER_ERROR = 'on_retriever_error',
  ON_INTERRUPT = 'on_interrupt',
  ON_ERROR = 'on_error',
  ON_CHAT_EVENT = 'on_chat_event',
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
  knowledgebases?: string[]
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

// Helpers
export function omitXpertRelations(xpert: Partial<IXpert>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { draft, agent, agents, executors, leaders, knowledgebases, toolsets, managers, ...rest } = xpert ?? {}
  return rest
}

export function figureOutXpert(xpert: IXpert, isDraft: boolean) {
  return (isDraft ? xpert.draft?.team : xpert) ?? xpert
}

export function xpertLabel(agent: Partial<IXpert>) {
  return agent.title || agent.name
}

export function createXpertGraph(xpert: IXpert, position: IPoint) {
  const graph = xpert.graph ?? xpert.draft

  const nodes = graph.nodes

  // Extract the area by positions of all nodes
  const positions = nodes.map((node) => node.position)
  const x0Positions = positions.map((pos) => pos.x)
  const x1Positions = nodes.map((node) => node.position.x + (node.size?.width ?? 240)) // Node width min 240
  const y0Positions = positions.map((pos) => pos.y)
  const y1Positions = nodes.map((node) => node.position.y + (node.size?.height ?? 70)) // Node height min 70

  const xRange = {
    min: Math.min(...x0Positions),
    max: Math.max(...x1Positions)
  }

  const yRange = {
    min: Math.min(...y0Positions),
    max: Math.max(...y1Positions)
  }

  const size = {
    width: xRange.max - xRange.min + 50, 
    height: yRange.max - yRange.min + 80
  }

  nodes.forEach((node) => {
    node.position = {
      x: position.x + (node.position?.x ? node.position.x - xRange.min : 0) + 10,
      y: position.y + (node.position?.y ? node.position.y - yRange.min : 0) + 40,
    }
  })

  return { nodes, size, connections: graph.connections }
}

/**
 * Create all nodes of xpert and it's area size
 * 
 * @param xpert 
 * @returns 
 */
export function createXpertNodes(xpert: IXpert, position: IPoint) {
  const nodes: TXpertTeamNode[] = []
  // Agents
  nodes.push(...[xpert.agent, ...(xpert.agents ?? [])].map((_) => {
    return {
      type: 'agent',
      key: _.key,
      position: xpert.options?.agent?.[_.key]?.position ?? {x: 0, y: 0},
      size: xpert.options?.agent?.[_.key]?.size,
      entity: _
    } as TXpertTeamNode
  }))

  // External experts
  xpert.executors?.forEach((executor) => {
    const position = xpert.options?.xpert?.[executor.id]?.position ?? {x: 0, y: 0}
    const executorGraph = createXpertNodes(executor, position)
    nodes.push({
      type: 'xpert',
      key: executor.id,
      position,
      size: executorGraph.size,
      entity: executor,
      nodes: executorGraph.nodes
    } as TXpertTeamNode)
  })

  // knowledgebases
  nodes.push(...(xpert.knowledgebases ?? []).map((x) => {
    return {
      key: x.id,
      type: 'knowledge',
      position: xpert.options?.knowledge?.[x.id]?.position ?? {x: 0, y: 0},
      size: xpert.options?.knowledge?.[x.id]?.size,
      entity: x,
    } as TXpertTeamNode
  }))

  // Toolsets
  nodes.push(...(xpert.toolsets ?? []).map((x) => {
    return {
      key: x.id,
      type: 'toolset',
      position: xpert.options?.toolset?.[x.id]?.position ?? {x: 0, y: 0},
      size: xpert.options?.toolset?.[x.id]?.size,
      entity: x,
    } as TXpertTeamNode
  }))


  // Extract the area by positions of all nodes
  const positions = nodes.map((node) => node.position)
  const x0Positions = positions.map((pos) => pos.x)
  const x1Positions = nodes.map((node) => node.position.x + (node.size?.width ?? 240)) // Node width min 240
  const y0Positions = positions.map((pos) => pos.y)
  const y1Positions = nodes.map((node) => node.position.y + (node.size?.height ?? 70)) // Node height min 70

  const xRange = {
    min: Math.min(...x0Positions),
    max: Math.max(...x1Positions)
  }

  const yRange = {
    min: Math.min(...y0Positions),
    max: Math.max(...y1Positions)
  }

  const size = {
    width: xRange.max - xRange.min + 50, 
    height: yRange.max - yRange.min + 80
  }

  nodes.forEach((node) => {
    node.position = {
      x: position.x + (node.position?.x ? node.position.x - xRange.min : 0) + 10,
      y: position.y + (node.position?.y ? node.position.y - yRange.min : 0) + 40,
    }
  })

  return { nodes, size }
}

export function createAgentConnections(agent: IXpertAgent, collaborators: IXpert[]) {
  const connections = []
  const from = agent.leaderKey
  const to = agent.key
  if (from && to) {
    connections.push({
      type: 'agent',
      key: from + '/' + to,
      from,
      to
    })
  }

  // collaborators
  agent.collaboratorNames?.forEach((name) => {
    const collaborator = collaborators.find((_) => _.name === name)
    if (collaborator) {
      const from = agent.key
      const to = collaborator.id
      connections.push({
        type: 'xpert',
        key: from + '/' + to,
        from,
        to
      })
    }
  })

  // knowledgebases
  agent.knowledgebaseIds?.forEach((knowledgebaseId) => {
    const from = agent.key
    const to = knowledgebaseId
    connections.push({
      type: 'knowledge',
      key: from + '/' + to,
      from,
      to
    })
  })

  // toolsets
  agent.toolsetIds?.forEach((toolsetId) => {
    const from = agent.key
    const to = toolsetId
    connections.push({
      type: 'toolset',
      key: from + '/' + to,
      from,
      to
    })
  })

  return connections
}

export function replaceAgentInDraft(draft: TXpertTeamDraft, key: string, agent: IXpertAgent) {
  const index = draft.nodes.findIndex((_) => _.type === 'agent' && _.key === key)
  if (index > -1) {
    draft.nodes[index] = {
      ...draft.nodes[index],
      type: 'agent',
      key: agent.key,
      entity: agent
    }
  } else {
    throw new Error(`Can't found agent for key: ${key}`)
  }

  // Replace agent in connections
  if (key !== agent.key) {
    draft.connections.forEach((conn) => {
      if (conn.from === key) {
        conn.from = agent.key
        conn.key = `${conn.from}/${conn.to}`
      } else if (conn.to === key) {
        conn.to = agent.key
        conn.key = `${conn.from}/${conn.to}`
      }
    })
  }

  return draft
}