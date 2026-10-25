import { Injectable } from '@nestjs/common'
import type { ContentDocumentsApi, ContentDocumentInput } from '@xpert-ai/plugin-sdk'
import { ContentDocumentService, contentDocumentDescriptor } from './document.service'
import { CollaborationDocument } from '../../collaboration/entities/collaboration-document.entity'
import { ContentDocument } from './entities'

/** Resets retire a room and publish a new epoch. Old updates can never enter the new model. */
@Injectable()
export class ContentDocumentLifecycle {
  constructor(private readonly documents: ContentDocumentService) {}

  async restore(input: Parameters<ContentDocumentsApi['restore']>[0]) {
    const preview = await this.documents.preview(input)
    return this.reset(input, preview.markdown, `restore:${input.revisionId}:${input.epoch}`, 'Restored version')
  }
  async reconcile(input: Parameters<ContentDocumentsApi['reconcile']>[0]) {
    const state = await this.documents.get(input)
    const { document } = await this.documents.require(input, true)
    const disk = await this.documents.store.disk(document)
    if (disk.hash !== input.expectedHash) this.documents.conflict()
    // Keep the external bytes before either choice. They are never silently discarded.
    await this.documents.store.storage(document).write(`external/${document.id}/${disk.hash}.md`, disk.buffer)
    return this.reset(input, input.choice === 'file' ? disk.buffer.toString('utf8') : state.markdown,
      `reconcile:${input.epoch}:${disk.hash}:${input.choice}`, 'Reconciled file', disk.hash)
  }
  private async reset(input: ContentDocumentInput & { expectedSequence: number; epoch: number }, markdown: string,
    mutationId: string, label: string, externalHash?: string) {
    const { document } = await this.documents.require(input, true)
    const model = this.documents.models.getTextModel(document.modelKey, document.organizationId)
    const state = await this.documents.get(input)
    const stateBase64 = model.initialize(markdown, state.blocks)
    return this.documents.store.locked(document, async () => {
      const { document: current } = await this.documents.require(input, true)
      if (current.epoch !== input.epoch || !current.collaborationId) this.documents.conflict()
      const disk = await this.documents.store.disk(current)
      if (disk.hash !== (externalHash ?? current.fileHash)) this.documents.conflict()
      const retire = { documentId: current.collaborationId, expectedSequence: input.expectedSequence }
      current.epoch++
      current.collaborationId = null
      current.fileHash = disk.hash
      await this.documents.store.publish(current, { mutationId, markdown, stateBase64,
        sequence: input.expectedSequence + 1, label, scope: input, retire })
      return contentDocumentDescriptor(current)
    })
  }
  async setDeleted(input: Parameters<ContentDocumentsApi['setDeleted']>[0]) {
    await this.documents.access.check(input, true)
    const document = await this.documents.store.documents.findOneBy({ id: input.resourceId,
      tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, projectId: input.projectId })
    if (!document) return
    await this.documents.store.locked(document, async () => {
      await this.documents.access.check(input, true)
      await this.documents.store.documents.manager.transaction(async (manager) => {
        const records = manager.getRepository(ContentDocument)
        const current = await records.findOneByOrFail({ id: document.id })
        if ((current.status === 'deleted') === input.deleted) return
        if (current.collaborationId && input.deleted) {
          const rooms = manager.getRepository(CollaborationDocument)
          const room = await rooms.findOneOrFail({ where: { id: current.collaborationId }, lock: { mode: 'pessimistic_write' } })
          if (room.sequenceNumber !== current.sequence) this.documents.conflict()
          await rooms.update(room.id, { status: 'archived' })
        }
        await records.update(current.id, { status: input.deleted ? 'deleted' : 'ready',
          epoch: current.epoch + 1, collaborationId: null })
      })
    })
  }
}
