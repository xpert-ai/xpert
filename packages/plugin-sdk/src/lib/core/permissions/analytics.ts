import type { BasePermission } from './general'

export type AnalyticsPermissionOperation = 'dscore' | 'query' | 'model' | 'indicator' | 'create_indicator'

/**
 * Analytics Permission
 * Example: { type: 'analytics', operations: ['dscore'] }
 */
export interface AnalyticsPermission extends BasePermission {
  type: 'analytics'
  operations?: AnalyticsPermissionOperation[]
  scope?: string[]
}

/**
 * System token for resolving analytics permission service from plugin context.
 */
export const ANALYTICS_PERMISSION_SERVICE_TOKEN = 'XPERT_PLUGIN_ANALYTICS_PERMISSION_SERVICE'

export interface AnalyticsResolvedChatBIModel {
  chatbiModelId: string
  modelId: string
  modelKey?: string
  cubeName: string
  entityCaption?: string
  entityDescription?: string
  prompts?: string[]
}

export interface AnalyticsDSCoreInput {
  modelIds?: string[]
  indicatorDraft?: boolean
  semanticModelDraft?: boolean
}

export interface AnalyticsIndicatorValidationInput {
  modelIds?: string[]
  semanticModelId: string
  modelKey?: string
  statement: string
}

/**
 * Analytics service exposed to plugins under permission control.
 */
export interface AnalyticsPermissionService<TDSCoreService = unknown> {
  resolveChatBIModels(modelIds: string[]): Promise<AnalyticsResolvedChatBIModel[]>
  getDSCoreService(input?: AnalyticsDSCoreInput): Promise<TDSCoreService>
  visitChatBIModel(modelId: string, cubeName: string): Promise<void>
  ensureCreateIndicatorAccess(): Promise<void>
  validateIndicatorStatement(input: AnalyticsIndicatorValidationInput): Promise<void>
}
