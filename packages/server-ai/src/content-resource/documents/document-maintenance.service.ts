import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ContentResourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ContentDocumentService } from './document.service'
import { ContentDocumentLocations } from './document-location.service'

/** Durable pending flags make publication and derived projections recoverable after process restart. */
@Injectable()
export class ContentDocumentMaintenance implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentDocumentMaintenance.name)
  private timer: ReturnType<typeof setInterval> | undefined
  private running = false
  constructor(private readonly documents: ContentDocumentService, private readonly sources: ContentResourceProviderRegistry, private readonly locations: ContentDocumentLocations) {}
  onModuleInit() { this.timer = setInterval(() => void this.repair(), 15000); this.timer.unref() }
  onModuleDestroy() { clearInterval(this.timer) }
  async repair() {
    if (this.running) return
    this.running = true
    try {
      await this.locations.repair()
      const rows = await this.documents.store.documents.find({ where: [{ status: 'pending' }, { status: 'ready', projectionPending: true }],
        order: { updatedAt: 'ASC' }, take: 30 })
      for (const document of rows) try {
        if (document.status === 'pending') await this.documents.recover(document)
        if (!document.headRevisionId) continue
        const revision = await this.documents.store.revisions.findOneByOrFail({ id: document.headRevisionId })
        const provider = this.sources.get(document.sourceProvider, document.organizationId)
        await provider.publication?.onDocumentPublished?.({ actor: { tenantId: document.tenantId, organizationId: document.organizationId,
          userId: revision.createdById }, projectId: document.projectId, sourceResourceId: document.sourceId,
          path: document.path, hash: document.fileHash, revisionId: revision.id, sequence: document.sequence })
        await this.documents.store.documents.update({ id: document.id, headRevisionId: revision.id }, { projectionPending: false })
      } catch { this.logger.debug(`Content recovery deferred for ${document.id}`) }
    } catch { this.logger.warn('Content recovery scan deferred') }
    finally { this.running = false }
  }
}
