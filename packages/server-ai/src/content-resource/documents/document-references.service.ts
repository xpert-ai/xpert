import { Inject, Injectable } from '@nestjs/common'
import { ContentReferencesRuntimeCapability, ContentResourceProviderRegistry, type ContentReferencesApi,
  type ContentDocumentInput } from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../shared/runtime'
import { ContentDocumentService } from './document.service'
import { ContentResourceService } from '../content-resource.service'

/** Every request reauthorizes the containing document and the referenced resource.
 * Provider hooks enforce project ownership; the file gateway rechecks again when bytes are fetched.
 */
@Injectable()
@RuntimeCapabilityProvider(ContentReferencesRuntimeCapability)
export class ContentDocumentReferences implements ContentReferencesApi {
  constructor(@Inject(ContentDocumentService) private readonly documents: ContentDocumentService, @Inject(ContentResourceService) private readonly resources: ContentResourceService,
    @Inject(ContentResourceProviderRegistry) private readonly providers: ContentResourceProviderRegistry) {}
  private async source(input: ContentDocumentInput, write = false) {
    const { document } = await this.documents.require(input, write)
    await this.resources.authorize({ actor: input.actor, providerKey: document.sourceProvider,
      resourceId: document.sourceId, operation: write ? 'write' : 'read' })
    return { resourceId: document.sourceId, provider: this.providers.get(document.sourceProvider, input.actor.organizationId) }
  }
  list: ContentReferencesApi['list'] = async (input) => {
    const source = await this.source(input)
    if (!source.provider.references?.listReferences) return { items: [], nextCursor: null }
    return source.provider.references?.listReferences({ ...input, sourceResourceId: source.resourceId })
  }
  upload: ContentReferencesApi['upload'] = async (input) => {
    const source = await this.source(input, true)
    if (!source.provider.references?.uploadReference) this.documents.access.denied()
    return source.provider.references?.uploadReference({ ...input, sourceResourceId: source.resourceId })
  }
  resolve: ContentReferencesApi['resolve'] = async (input) => {
    const source = await this.source(input)
    await this.resources.authorize({ actor: input.actor, ...input.target, operation: 'read' })
    if (!source.provider.references?.resolveReference) this.documents.access.denied()
    return source.provider.references?.resolveReference({ ...input, sourceResourceId: source.resourceId })
  }
}
