import { Runnable, RunnableToolLike } from '@langchain/core/runnables'
import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools'
import { ToolInputSchemaBase } from '@langchain/core/dist/tools/types'
import { InteropZodType } from '@langchain/core/utils/types'
import { BaseChannel } from '@langchain/langgraph'
import {
  IEnvironment,
  IWorkflowNode,
  TWorkflowNodeMeta,
  TVariableAssigner,
  TXpertGraph,
  TWorkflowVarGroup,
  TXpertParameter,
  TXpertTeamNode
} from '@xpert-ai/contracts'
import { PromiseOrValue } from '../../types'

export type TWorkflowNodeParams<TConfig = any> = {
  xpertId: string
  agentKey?: string
  node: TXpertTeamNode
  config: TConfig
}

export type TWorkflowNodeResult = {
  name?: string
  graph: Runnable
  ends: string[]
  channel?: {
    name: string
    annotation: BaseChannel
  }
  navigator?: (state, config) => Promise<any>
  caller?: string
  toolset?: {
    provider: string
    title: string
    id?: string
  }
  tool?:
    | DynamicStructuredTool<ToolInputSchemaBase, any, any>
    | StructuredToolInterface<ToolInputSchemaBase, any, any>
    | RunnableToolLike<InteropZodType, unknown>
  variables?: TVariableAssigner[]
}

/**
 * Workflow Node Strategy interface
 */
export interface IWorkflowNodeStrategy<TConfig = any, TResult = any> {
  /**
   * Metadata describing the node (type, label, description, config schema, etc.)
   */
  meta: TWorkflowNodeMeta

  /**
   * Create the node subgraph
   */
  create(payload: {
    graph: TXpertGraph
    node: TXpertTeamNode & { type: 'workflow' }
    xpertId: string
    environment: IEnvironment
    isDraft: boolean
    leaderKey?: string
    conversationId?: string
  }): PromiseOrValue<TWorkflowNodeResult>

  inputVariables?(entity: IWorkflowNode, variables?: TWorkflowVarGroup[]): TXpertParameter[]

  outputVariables(entity: IWorkflowNode): TXpertParameter[]
}
