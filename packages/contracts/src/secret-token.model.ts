import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import type { TEnterpriseH5Platform } from './ai/xpert.model'

/** Enterprise channel and integration to which an H5 session token is bound. */
export type TEnterpriseH5TokenScope = {
  platform: TEnterpriseH5Platform
  integrationId: string
}

/**
 * Selects how an opaque client secret is authorized and how entityId is
 * interpreted. createdById alone does not distinguish
 * an API-key grant, a delegated user session, or a public assistant session.
 */
export enum SecretTokenBindingType {
  /** entityId is an ApiKey id and the request runs as that API principal. */
  API_KEY = 'api_key',
  /**
   * entityId is the only Xpert this session may access; createdById is loaded
   * as the acting business user for the interactive ChatKit run.
   */
  USER_XPERT = 'user_xpert',
  /**
   * entityId is one conversation, initially a group. createdById is the real
   * authenticated human. This grant never authorizes unrelated conversations,
   * direct Assistant APIs or session issuance; live domain access still applies.
   */
  USER_CONVERSATION = 'user_conversation',
  /**
   * entityId is the only Xpert this verified enterprise identity may access;
   * createdById is the AccountBinding-resolved Xpert user.
   */
  ENTERPRISE_XPERT = 'enterprise_xpert',
  /** entityId is a public Xpert id and public-app access rules apply. */
  PUBLIC_XPERT = 'public_xpert'
}

export interface ISecretToken extends IBasePerTenantAndOrganizationEntityModel {
  /** Polymorphic binding id; interpret it only through type. */
  entityId?: string
  /** Explicit grant/binding semantics for this opaque token. */
  type?: SecretTokenBindingType
  /** Stored representation: existing opaque secret or sha256:<digest> written by createHashed. Never send a digest as a bearer secret. */
  token: string
  /** Exact enterprise channel that issued an ENTERPRISE_XPERT token. */
  enterpriseH5Scope?: TEnterpriseH5TokenScope | null
  validUntil?: Date
  expired?: boolean
}

export interface ISecretTokenFindInput extends IBasePerTenantAndOrganizationEntityModel {
  entityId?: string
  type?: SecretTokenBindingType
  token?: string
}
