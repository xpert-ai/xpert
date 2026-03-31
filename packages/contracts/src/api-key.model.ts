import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { IUser } from './user.model'

/**
 * Represents an API key used for authentication and authorization.
 */
export interface IApiKey extends IBasePerTenantAndOrganizationEntityModel {
  token: string
  name?: string
  /**
   * Stable binding kind for resolving the technical principal behind this key.
   */
  type?: ApiKeyBindingType
  /**
   * Stable binding target id/code. Examples:
   * - assistant => xpertId
   * - integration => integrationId
   * - client => clientCode
   */
  entityId?: string
  validUntil?: Date
  expired?: boolean
  lastUsedAt?: Date
  /**
   * Explicit technical principal bound to this apiKey.
   * When set, it takes precedence over type/entityId resolution.
   */
  userId?: string
  user?: IUser
}

/**
 * Optional request header used by third-party callers to explicitly set the
 * business user represented by the current request context.
 */
export const API_PRINCIPAL_USER_ID_HEADER = 'x-principal-user-id'

/**
 * Stable binding kinds used to resolve long-lived technical principals.
 */
export enum ApiKeyBindingType {
  ASSISTANT = 'assistant',
  INTEGRATION = 'integration',
  CLIENT = 'client',
  /**
   * @deprecated legacy type, do not use for new keys. Will be resolved as assistant for backward compatibility.
   */
  KNOWLEDGEBASE = 'knowledgebase'
}

export type ApiPrincipalType = 'api_key' | 'client_secret'

export interface IApiPrincipal extends IUser {
  apiKey: IApiKey
  principalType: ApiPrincipalType
  /**
   * Resource owner / key creator. Used for audit and ownership metadata.
   */
  ownerUserId?: string | null
  /**
   * Technical principal resolved from apiKey.userId or stable type/entityId binding.
   */
  apiKeyUserId?: string | null
  /**
   * Explicit business user id requested by the caller via x-principal-user-id.
   */
  requestedUserId?: string | null
  /**
   * Original organization context requested by the caller before api-key
   * authentication normalized the request into tenant scope.
   */
  requestedOrganizationId?: string | null
}
