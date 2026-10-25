import { Injectable } from '@nestjs/common'
import { ContentResourceProviderRegistry, type ContentDocumentInput } from '@xpert-ai/plugin-sdk'
import { ContentDocumentService, contentDocumentDescriptor } from './document.service'
import { ContentResourceService } from '../content-resource.service'

/** Authorization stays on the platform; only source-specific page metadata/creation is delegated. */
@Injectable()
export class ContentDocumentHierarchy {
  constructor(private readonly documents: ContentDocumentService,
    private readonly resources: ContentResourceService, private readonly providers: ContentResourceProviderRegistry) {}
  private async source(input: ContentDocumentInput, write = false) {
    const result = await this.documents.require(input, write)
    await this.resources.authorize({ actor: input.actor, providerKey: result.document.sourceProvider,
      resourceId: result.document.sourceId, operation: write ? 'write' : 'read' })
    return { ...result, provider: this.providers.get(result.document.sourceProvider, input.actor.organizationId) }
  }
  async hierarchy(input: ContentDocumentInput) {
    const { document, provider, canWrite } = await this.source(input)
    if (!provider.pages?.pageHierarchy) return { supported: false, canCreate: false, parent: null, children: [], hasMore: false }
    const result = await provider.pages?.pageHierarchy({ ...input, sourceResourceId: document.sourceId })
    return { ...result, canCreate: canWrite && result.canCreate && !!provider.pages?.createChildPage }
  }
  async createChild(input: ContentDocumentInput & { title: string; requestId: string }) {
    const { document, provider } = await this.source(input, true)
    if (!provider.pages?.createChildPage) this.documents.access.denied()
    const child = await provider.pages?.createChildPage({ ...input, sourceResourceId: document.sourceId })
    // A provider cannot navigate the caller into a different project or an unregistered file.
    const result = await this.source({ ...input, resourceId: child.documentId })
    return contentDocumentDescriptor(result.document)
  }
}
