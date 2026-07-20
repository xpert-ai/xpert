import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'

/**
 * Selects how an opaque client secret is authorized and how entityId is
 * interpreted. createdById only records provenance; it does not distinguish
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
  /** entityId is a public Xpert id and public-app access rules apply. */
  PUBLIC_XPERT = 'public_xpert'
}

export interface ISecretToken extends IBasePerTenantAndOrganizationEntityModel {
  /** Polymorphic binding id; interpret it only through type. */
  entityId?: string
  /** Explicit grant/binding semantics for this opaque token. */
  type?: SecretTokenBindingType
  token: string
  validUntil?: Date
  expired?: boolean
}

export interface ISecretTokenFindInput extends IBasePerTenantAndOrganizationEntityModel {
  entityId?: string
  type?: SecretTokenBindingType
  token?: string
}
