import { Runnable } from '@langchain/core/runnables'
import { BaseChannel } from '@langchain/langgraph'
import {
  IEnvironment,
  IWorkflowNode,
  TWorkflowNodeMeta,
  TXpertGraph,
  TXpertParameter,
  TXpertTeamNode
} from '@metad/contracts'

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
  }): TWorkflowNodeResult

  outputVariables(entity: IWorkflowNode): TXpertParameter[]
}
