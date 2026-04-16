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
export * from './account-binding'
export * from './auth-login'
export * from './bound-identity-login'
export * from './sso-binding'
export * from './user'

import type {
  FileSystemPermission,
  IntegrationPermission,
  KnowledgePermission,
  LLMPermission,
  VectorStorePermission
} from './general'
import type { AnalyticsPermission } from './analytics'
import type { AccountBindingPermission } from './account-binding'
import type { BoundIdentityLoginPermission } from './bound-identity-login'
import type { HandoffPermission } from './handoff'
import type { SsoBindingPermission } from './sso-binding'
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
  | AccountBindingPermission
  | BoundIdentityLoginPermission
  | SsoBindingPermission
  | UserPermission
  | HandoffPermission

/**
 * Permissions array type
 */
export type Permissions = Permission[]
