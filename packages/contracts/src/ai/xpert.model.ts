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
   * Config for every agent
   */
  agentConfig?: TXpertAgentConfig

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


/**
 * Create agents nodes of xpert and it's area size
 * 
 * @param xpert 
 * @returns 
 */
export function createXpertNodes(xpert: IXpert, position: IPoint) {
  const nodes: TXpertTeamNode[] = []
  nodes.push(...[xpert.agent, ...(xpert.agents ?? [])].map((_) => {
    return {
      type: 'agent',
      key: _.key,
      position: xpert.options?.agent?.[_.key]?.position ?? {x: 0, y: 0},
      size: xpert.options?.agent?.[_.key]?.size,
      entity: _
    } as TXpertTeamNode
  }))

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
    width: xRange.max - xRange.min + 20, 
    height: yRange.max - yRange.min + 20
  }

  nodes.forEach((node) => {
    node.position = {
      x: position.x + (node.position?.x ? node.position.x - xRange.min : 0) + 10,
      y: position.y + (node.position?.y ? node.position.y - yRange.min : 0) + 10,
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