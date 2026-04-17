import { IWorkflowNode, WorkflowNodeTypeEnum } from "./xpert-workflow.model"
import { I18nObject, IconDefinition, letterStartSUID } from "../types"
import { TXpertFeatureKey, TXpertGraph, TXpertTeamNode } from "./xpert.model"
import { JsonSchemaObjectType } from "./types"

export const LEGACY_SANDBOX_COMPRESSION_MIDDLEWARE_NAME = 'SandboxCompressionMiddleware'
export const CONTEXT_COMPRESSION_MIDDLEWARE_NAME = 'ContextCompressionMiddleware'

export interface IWFNMiddleware extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.MIDDLEWARE
  provider: string
  options?: Record<string, any>
  tools?: Record<string, TMiddlewareToolConfig | boolean>
}

export type TMiddlewareToolConfig = {
  enabled?: boolean
}

export function isMiddlewareToolEnabled(config?: TMiddlewareToolConfig | boolean) {
  if (typeof config === 'boolean') {
    return config
  }
  return config?.enabled !== false
}

export function genXpertMiddlewareKey() {
  return letterStartSUID('Middleware_')
}

export function normalizeMiddlewareProvider(provider?: string | null): string {
  if (provider === LEGACY_SANDBOX_COMPRESSION_MIDDLEWARE_NAME) {
    return CONTEXT_COMPRESSION_MIDDLEWARE_NAME
  }

  return provider ?? ''
}

export function normalizeMiddlewareNode<T extends TXpertTeamNode>(node: T): T {
  if (node?.type !== 'workflow' || node.entity?.type !== WorkflowNodeTypeEnum.MIDDLEWARE) {
    return node
  }

  const entity = node.entity as IWFNMiddleware
  const provider = normalizeMiddlewareProvider(entity.provider)
  if (provider === entity.provider) {
    return node
  }

  return {
    ...node,
    entity: {
      ...entity,
      provider
    }
  } as T
}

export function normalizeMiddlewareNodes<T extends TXpertTeamNode>(nodes?: T[] | null): T[] {
  return (nodes ?? []).map((node) => normalizeMiddlewareNode(node))
}

export type TAgentMiddlewareMeta = {
  name: string
  label: I18nObject
  icon?: IconDefinition
  description?: I18nObject
  configSchema?: JsonSchemaObjectType
  features?: TXpertFeatureKey[]
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
