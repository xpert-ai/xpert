import { ITag } from '../tag-entity.model'
import { IUser } from '../user.model'
import { ICopilotModel } from './copilot-model.model'
import { IKnowledgebase } from './knowledgebase.model'
import { TAvatar } from '../types'
import { IXpertAgent } from './xpert-agent.model'
import { IXpertToolset } from './xpert-toolset.model'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'

/**
 * Digital Expert
 */
export interface IXpert extends IBasePerWorkspaceEntityModel {
  slug: string
  name: string
  type: XpertTypeEnum
  title?: string
  titleCN?: string
  description?: string

  active?: boolean
  avatar?: TAvatar

  /**
   * 对话开场白
   */
  starters?: string[]

  /**
   * More configuration
   */
  options?: TXpertOptions

  /**
   * Version of role: '1' '2' '2.1' '2.2'...
   */
  version?: string
  /**
   * Is latest version
   */
  latest?: boolean

  /**
   * 当前版本上的草稿
   */
  draft?: TXpertTeamDraft

  agent?: IXpertAgent

  // Many to one
  // Used copilot model
  copilotModel?: ICopilotModel
  copilotModelId?: string

  // One to many
  agents?: IXpertAgent[]

  // Many to many relationships

  /**
   * 子专家, 执行具体任务的 Digital Expert, 专注于完成被分配的工作
   */
  executors?: IXpert[]
  /**
   * 调用此专家的任务协调者
   */
  leaders?: IXpert[]

  knowledgebases?: IKnowledgebase[]
  toolsets?: IXpertToolset[]

  /**
   * The corresponding person in charge, whose has the authority to execute this digital expert
   */
  managers?: IUser[]

  tags?: ITag[]
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

export enum XpertTypeEnum {
  Agent = 'agent',
  Copilot = 'copilot'
}

export enum XpertParameterTypeEnum {
  TEXT = 'text',
  PARAGRAPH = 'paragraph',
  SELECT = 'select',
  NUMBER = 'number',
}

export type TXpertParameter = {
  type: XpertParameterTypeEnum
  name: string
  title?: string
  description?: string
  optional?: boolean
  maximum?: number
  options?: string[]
}


// Xpert team draft types

export type TXpertTeamDraft = {
  team: Partial<IXpert>

  savedAt?: Date
  nodes: TXpertTeamNode[]
  connections: TXpertTeamConnection[]
}

export type TXpertTeamNodeType = 'agent' | 'knowledge' | 'toolset' | 'xpert'

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
)

export interface IPoint {
  x: number
  y: number
}

export interface ISize {
  width: number
  height: number
}

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
  type: TXpertTeamNodeType
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
  ON_TOOL_START = 'on_tool_start',
  ON_TOOL_END = 'on_tool_end',
  ON_TOOL_ERROR = 'on_tool_error',
  ON_AGENT_START = 'on_agent_start',
  ON_AGENT_END = 'on_agent_end',
  ON_RETRIEVER_START = 'on_retriever_start',
  ON_RETRIEVER_END = 'on_retriever_end',
  ON_RETRIEVER_ERROR = 'on_retriever_error',
  ON_ERROR = 'on_error'
}

export type TChatRequest = {
  input: {
    input?: string
    [key: string]: unknown
  }
  xpertId: string
  conversationId?: string
  id?: string
  language?: string
}

export type TChatOptions = {
  knowledgebases?: string[]
  toolsets?: string[]
}

// Helpers
export function omitXpertRelations(xpert: Partial<IXpert>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { draft, agent, agents, executors, leaders, knowledgebases, toolsets, managers, ...rest } = xpert ?? {}
  return rest
}
