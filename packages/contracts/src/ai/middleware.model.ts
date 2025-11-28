import { IWorkflowNode, WorkflowNodeTypeEnum } from "./xpert-workflow.model"
import { I18nObject, IconDefinition, letterStartSUID } from "../types"

export interface IWFNMiddleware extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.MIDDLEWARE
  provider: string
  options?: Record<string, any>
  /**
   * Ordered agent middleware plugin names
   */
  middlewares?: string[]
}

export function genXpertMiddlewareKey() {
  return letterStartSUID('Middleware_')
}

export type TAgentMiddlewareMeta = {
  name: string
  label: I18nObject
  icon?: IconDefinition
  description?: I18nObject
  configSchema?: any
}