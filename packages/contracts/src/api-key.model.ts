import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { SecretTokenBindingType, TEnterpriseH5TokenScope } from './secret-token.model'
import { IUser } from './user.model'

/**
 * Represents an API key used for authentication and authorization.
 */
export interface IApiKey extends IBasePerTenantAndOrganizationEntityModel {
  token: string
  name?: string
  /**
   * Stable persisted binding kind for resolving the technical principal behind this key.
   * @deprecated Reading IApiPrincipal.apiKey.type for resource authorization is deprecated;
   * use IApiPrincipal.resourceScope.kind. This persisted identity discriminator remains supported.
   */
  type?: ApiKeyBindingType
  /**
   * Persistence/technical-identity binding only. Examples:
   * - assistant => xpertId
   * - workspace => workspaceId
   * - integration => integrationId
   * - client => clientCode
   * @deprecated Business authorization via IApiPrincipal.apiKey.entityId is deprecated;
   * consume the authentication-normalized IApiPrincipal.resourceScope instead.
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
  WORKSPACE = 'workspace',
  INTEGRATION = 'integration',
  CLIENT = 'client',
  /**
   * @deprecated legacy type, do not use for new keys. Will be resolved as assistant for backward compatibility.
   */
  KNOWLEDGEBASE = 'knowledgebase'
}

export type ApiPrincipalType = 'api_key' | 'client_secret'

/**
 * Credential-bound resource audience restored by authentication. This is not a
 * permission grant: tenant/organization, membership and operation checks still apply.
 * Only explicit persisted bindings may produce a scope; request parameters cannot widen it.
 */
export type ApiPrincipalResourceScope =
  /** One digital expert; thread/file operations must additionally match that expert. */
  | { kind: 'assistant'; xpertId: string }
  /** One workspace; membership and operation policy determine which resources are accessible. */
  | { kind: 'workspace'; workspaceId: string }
  /** One shared conversation; never grants direct access to members' Assistant runtime threads. */
  | { kind: 'conversation'; conversationId: string }

export interface IApiPrincipal extends IUser {
  principalType: ApiPrincipalType
  /**
   * Backing credential metadata. Real API keys retain their persistence binding.
   * @deprecated Reading apiKey.type/entityId for resource authorization, or using
   * a synthetic API key as an audience, is deprecated. Use resourceScope instead.
   * Synthetic Assistant keys remain temporarily for existing metadata consumers.
   */
  apiKey?: IApiKey
  /**
   * Binding target kind for short-lived client_secret principals.
   * This is an authorization discriminator, not creator metadata: ownerUserId/
   * createdById can be present for every binding type and must not be used to
   * infer how secret_token.entityId should be resolved.
   * Examples:
   * - api_key => secret_token.entityId is the backing ApiKey id
   * - user_xpert => secret_token.entityId is the user-authorized xpert id
   * - public_xpert => secret_token.entityId is the public xpert id
   */
  clientSecretBindingType?: SecretTokenBindingType | null
  clientSecretId?: string | null
  /** Canonical resource audience. Undefined means no normalized resource binding, not unrestricted permission. */
  resourceScope?: ApiPrincipalResourceScope
  /** Absolute expiry for long-lived streams to recheck after the initial authentication. */
  clientSecretExpiresAt?: Date
  /** Exact enterprise H5 channel carried by an enterprise client secret. */
  enterpriseH5Scope?: TEnterpriseH5TokenScope | null
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
