import type { ContentReferenceProvider } from './reference'
import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { STRATEGY_META_KEY } from '../types'
import { createRuntimeCapability } from '../core/runtime-capability'

import type { OrganizationRuntimeActor } from '../runtime/actor'

export type ContentActor = OrganizationRuntimeActor
export interface ContentPrincipal extends ContentActor {
  groupIds: string[]
}
export type ContentOperation = 'read' | 'comment' | 'write' | 'manage'
export interface ContentResourceReference {
  providerKey: string
  resourceId: string
}
export interface ContentResourceRequest extends ContentResourceReference {
  actor: ContentActor
  operation: ContentOperation
  /** Relative immutable file path. Providers must validate its owning item. */
  filePath?: string
}
export interface ContentResourceDescriptor extends ContentResourceReference {
  title: string
  role: string
  canWrite: boolean
  canManage: boolean
}
/** Source hook scope uses the provider's identifier; it is never a platform document id. */
export type ContentSourceInput = import('./document').ContentDocumentScope & { sourceResourceId: string }
export interface ContentPageProvider {
  pageHierarchy(input: ContentSourceInput): Promise<import('@xpert-ai/contracts').ContentPageHierarchy>
  /** Retry requestId after unknown outcomes. Return the registered platform document id. */
  createChildPage(input: ContentSourceInput & { title: string; requestId: string }): Promise<{ documentId: string }>
}
export interface ContentPublicationObserver {
  /** Retryable projection: compare the supplied head before updating derived data. */
  onDocumentPublished(
    input: ContentSourceInput & {
      path: string
      hash: string
      revisionId: string
      sequence: number
    }
  ): Promise<void>
}
export interface ContentLocationProvider {
  validateLocationChange(input: import('./document').ContentLocationChangeInput): Promise<void>
  onLocationPrepared?(input: import('./document').ContentLocationChangeInput & { operationId: string }): Promise<void>
  onLocationChanged(input: import('./document').ContentLocationChangeInput & { operationId: string }): Promise<void>
}
/** Resource authorization is mandatory. Content extensions are explicitly composed, never inferred. */
export interface IContentResourceProvider {
  readonly title: string
  authorize(input: ContentResourceRequest & { principal: ContentPrincipal }): Promise<ContentResourceDescriptor>
  readonly editor?: import('./editor').ContentResourceEditor
  readonly references?: ContentReferenceProvider
  readonly pages?: ContentPageProvider
  readonly publication?: ContentPublicationObserver
  readonly locations?: ContentLocationProvider
  readonly catalog?: import('./catalog').ContentCatalogProvider
}
export const CONTENT_RESOURCE_PROVIDER = 'XPERT_CONTENT_RESOURCE_PROVIDER'
export const ContentResourceProvider = (key: string) =>
  applyDecorators(
    SetMetadata(CONTENT_RESOURCE_PROVIDER, key),
    SetMetadata(STRATEGY_META_KEY, CONTENT_RESOURCE_PROVIDER)
  )
@Injectable()
export class ContentResourceProviderRegistry extends BaseStrategyRegistry<IContentResourceProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(CONTENT_RESOURCE_PROVIDER, discovery, reflector)
  }
}
export interface ContentIdentitiesApi {
  /** Checks current active organization membership, then resolves current groups. */
  principal(actor: ContentActor): Promise<ContentPrincipal>
  directory(actor: ContentActor, query: string): Promise<Array<{ id: string; type: 'user' | 'group'; label: string }>>
}
export interface ContentResourcesApi {
  readonly identities: ContentIdentitiesApi
  authorize(input: ContentResourceRequest): Promise<ContentResourceDescriptor>
  readonly catalog: import('./catalog').ContentCatalogApi
}
export const ContentResourcesRuntimeCapability = createRuntimeCapability<ContentResourcesApi>(
  'platform.content.resources',
  { description: 'Current organization identities and plugin-owned content authorization.' }
)
export * from './document'

export * from './reference'

export * from './editor'
export * from './catalog'
