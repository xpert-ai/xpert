import { IWorkflowNode, WorkflowNodeTypeEnum } from "./xpert-workflow.model"
import { I18nObject, IconDefinition, letterStartSUID } from "../types"
import { TXpertGraph, TXpertTeamNode } from "./xpert.model"
import { JsonSchemaObjectType } from "./types"

export interface IWFNMiddleware extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.MIDDLEWARE
  provider: string
  options?: Record<string, any>
}

export function genXpertMiddlewareKey() {
  return letterStartSUID('Middleware_')
}

export type TAgentMiddlewareMeta = {
  name: string
  label: I18nObject
  icon?: IconDefinition
  description?: I18nObject
  configSchema?: JsonSchemaObjectType
}

const normalizeNodeKey = (key: string) => key?.split('/')?.[0]

export function getAgentMiddlewareNodes(graph: TXpertGraph, agentKey: string): TXpertTeamNode[] {
  const middlewares = graph.connections?.filter((conn) => conn.type === 'workflow' && conn.from === agentKey)
        .map(conn => {
            const to = normalizeNodeKey(conn.to)
            return graph.nodes?.find(node => node.key === to)
        }).filter(node => (node?.entity as unknown as IWorkflowNode).type === WorkflowNodeTypeEnum.MIDDLEWARE) ?? []
  return middlewares
}