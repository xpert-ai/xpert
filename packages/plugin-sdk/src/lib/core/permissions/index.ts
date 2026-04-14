/**
 * ===============================
 * Unified Permissions Definition
 * ===============================
 * Used by Agent / Plugin developers to declare required capabilities.
 * Core system will check and inject allowed resources accordingly.
 */

export * from './general'
export * from './analytics'
export * from './operation'
export * from './handoff'
export * from './user'

import type {
  FileSystemPermission,
  IntegrationPermission,
  KnowledgePermission,
  LLMPermission,
  VectorStorePermission
} from './general'
import type { AnalyticsPermission } from './analytics'
import type { HandoffPermission } from './handoff'
import type { UserPermission } from './user'

/**
 * Union type for all permissions
 */
export type Permission =
  | LLMPermission
  | VectorStorePermission
  | KnowledgePermission
  | FileSystemPermission
  | IntegrationPermission
  | AnalyticsPermission
  | UserPermission
  | HandoffPermission

/**
 * Permissions array type
 */
export type Permissions = Permission[]
