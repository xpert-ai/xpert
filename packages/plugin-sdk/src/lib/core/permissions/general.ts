import type { IIntegration } from '@metad/contracts'

/**
 * Base Permission type
 */
export interface BasePermission {
  type: string
  description?: string
}

export type IntegrationPermissionOperation = 'read' | 'write' | 'update' | 'delete'

/**
 * 1. LLM Permission
 * Example: { type: 'llm', provider: 'openai', capability: 'vision' }
 */
export interface LLMPermission extends BasePermission {
  type: 'llm'
  provider?: string
  capability: 'text' | 'chat' | 'vision' | 'embedding'
  scope?: string[]
  maxTokens?: number
  rateLimit?: { rps: number }
}

/**
 * 2. Vector Store Permission
 * Example: { type: 'vectorstore', provider: 'pinecone', operations: ['insert', 'query'] }
 */
export interface VectorStorePermission extends BasePermission {
  type: 'vectorstore'
  provider: string
  operations: Array<'insert' | 'query' | 'delete'>
  scope?: string[]
}

/**
 * 3. Knowledge Base Permission
 * Example: { type: 'knowledge', operations: ['read', 'write'], scope: ['kb_123'] }
 */
export interface KnowledgePermission extends BasePermission {
  type: 'knowledge'
  operations: Array<'read' | 'write' | 'update' | 'delete'>
  scope?: string[]
}

/**
 * 4. File System Permission
 * Example: { type: 'filesystem', operations: ['read', 'write'], scope: ['/documents', '/images'] }
 */
export interface FileSystemPermission extends BasePermission {
  type: 'filesystem'
  operations: Array<'read' | 'write' | 'delete' | 'list'>
  scope?: string[]
}

/**
 * 5. Integration Permission
 * Example: { type: 'integration', service: 'feishu', operations: ['read', 'write'] }
 */
export interface IntegrationPermission extends BasePermission {
  type: 'integration'
  service: string
  operations?: IntegrationPermissionOperation[]
  scope?: string[]
}

/**
 * System token for resolving integration read service from plugin context.
 */
export const INTEGRATION_PERMISSION_SERVICE_TOKEN = 'XPERT_PLUGIN_INTEGRATION_PERMISSION_SERVICE'

/**
 * Read-only integration permission service exposed to plugins.
 */
export interface IntegrationPermissionService {
  read<TIntegration = IIntegration>(id: string, options?: Record<string, any>): Promise<TIntegration | null>
}
