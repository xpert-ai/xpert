import { Injectable } from '@nestjs/common'
import {
  CollaborationDocumentProvider, type CollaborationProviderContext,
  type CollaborationMaterializationEvent, type ICollaborationDocumentProvider
} from '@xpert-ai/plugin-sdk'
import { ContentDocumentService, CONTENT_DOCUMENT_COLLABORATION } from './document.service'

@Injectable()
@CollaborationDocumentProvider(CONTENT_DOCUMENT_COLLABORATION)
export class ContentDocumentCollaborationProvider implements ICollaborationDocumentProvider {
  constructor(private readonly documents: ContentDocumentService) {}
  async resolve(context: CollaborationProviderContext) {
    const [id, epoch, extra] = context.resourceId.split(':')
    if (extra || !id || !/^[1-9][0-9]*$/.test(epoch ?? '')) this.documents.access.denied()
    const document = await this.documents.store.documents.findOneByOrFail({ id,
      tenantId: context.tenantId ?? '', organizationId: context.organizationId ?? '' })
    if (document.epoch !== Number(epoch) || document.status === 'deleted' || document.status === 'moving') this.documents.access.denied()
    return document
  }
  async authorize(context: CollaborationProviderContext) {
    try {
      const document = await this.resolve(context)
      if (context.projectId !== document.projectId || !context.userId) return false
      await this.documents.access.check({ actor: { tenantId: document.tenantId, organizationId: document.organizationId,
        userId: context.userId }, projectId: document.projectId, assistantId: context.xpertId ?? undefined },
        context.operation !== 'read' && context.operation !== 'initialize')
      if (context.operation === 'write') {
        const disk = await this.documents.store.disk(document)
        if (disk.hash !== document.fileHash || document.status === 'conflict') return false
      }
      return true
    } catch { return false }
  }
  async initializeDocument(context: CollaborationProviderContext) {
    const document = await this.resolve(context)
    if (!document.headRevisionId) this.documents.conflict()
    const revision = await this.documents.store.revisions.findOneByOrFail({ id: document.headRevisionId })
    return { stateBase64: await this.documents.store.state(document, revision), schemaVersion: document.schemaVersion,
      initialSequence: document.sequence }
  }
  async validateDocument(context: CollaborationProviderContext & { stateBase64: string }) {
    const document = await this.resolve(context)
    this.documents.models.getTextModel(document.modelKey, document.organizationId).validate(context.stateBase64)
  }
  async materializeDocument(event: CollaborationMaterializationEvent) {
    const document = await this.resolve(event)
    await this.documents.store.locked(document, async () => {
      const current = await this.resolve(event)
      if (current.sequence >= event.sequenceNumber) return
      const model = this.documents.models.getTextModel(current.modelKey, current.organizationId)
      const content = model.read(event.stateBase64)
      await this.documents.store.publish(current, { mutationId: `crdt:${current.epoch}:${event.sequenceNumber}`,
        markdown: content.markdown, stateBase64: event.stateBase64, sequence: event.sequenceNumber,
        createdById: event.userId ?? undefined,
        label: event.origin?.startsWith('content:proposal:') ? 'Assistant proposal' : 'Collaborative edit' })
    })
  }
}
