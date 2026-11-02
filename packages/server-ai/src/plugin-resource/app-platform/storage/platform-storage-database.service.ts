// Invariants: relation registration inventories billable data without installing row guards.
// A single collector per account refreshes approximate snapshots; application writes do not wait on its lock.
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { getConfig } from '@xpert-ai/server-config'
import { getEntitiesFromPlugins, registerAccountStorageRelations } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { FileArtifact, FileChunk, FileEmbedding } from '../../../file-understanding/entities'
import { KnowledgeDocument } from '../../../knowledge-document/document.entity'
import { KnowledgeDocumentChunk } from '../../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentPage } from '../../../knowledge-document/page/document-page.entity'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { PlatformStorageUsageService, STORAGE_REFRESH_INTERVAL_MS } from './platform-storage-usage.service'

@Injectable()
export class PlatformStorageDatabaseService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(PlatformStorageDatabaseService.name)
    private timer?: ReturnType<typeof setInterval>
    private running?: Promise<void>
    private stopping = false
    constructor(
        private readonly database: DataSource,
        private readonly usage: PlatformStorageUsageService
    ) {}

    async onApplicationBootstrap() {
        const entities = [
            ...getEntitiesFromPlugins(getConfig().plugins),
            FileArtifact,
            FileChunk,
            FileEmbedding,
            KnowledgeDocument,
            KnowledgeDocumentChunk,
            KnowledgeDocumentPage
        ]
        // ORM metadata identifies scoped tables; plugin names do not determine ownership.
        const metadata = entities.map((entity) => this.database.getMetadata(entity))
        await registerAccountStorageRelations(this.database, metadata)
        // These SQL-managed content tables are not included in the ORM entity list.
        for (const table of [
            'content_document',
            'content_revision',
            'content_proposal',
            'content_comment',
            'content_location_change'
        ])
            await this.database.query('SELECT xpert_app_storage_register_relation($1::regclass)', [table])
        // Vector rows carry tenant and organization identity inside their metadata JSON.
        await this.database.query(
            "SELECT xpert_app_storage_register_relation('knowledge_document_vector'::regclass,'metadata')"
        )
        this.timer = setInterval(() => this.schedule(), STORAGE_REFRESH_INTERVAL_MS)
        this.timer.unref()
        this.schedule()
    }

    private schedule() {
        if (this.running || this.stopping) return
        this.running = this.reconcile()
            .catch(() => {
                this.logger.warn('Account storage snapshot collection failed; retrying on the next interval')
            })
            .finally(() => {
                this.running = undefined
            })
    }

    /** Pagination and per-account failure isolation keep one large or broken account from blocking the rest. */
    async reconcile() {
        let skip = 0
        for (;;) {
            const accounts = await this.database
                .getRepository(AppPlatformDelivery)
                .find({ order: { id: 'ASC' }, skip, take: 100 })
            for (const account of accounts) {
                if (this.stopping) return
                try {
                    if (this.usage.needsRefresh(account, await this.usage.snapshot(account)))
                        await this.usage.refresh(account)
                } catch {
                    this.logger.warn('An account storage snapshot could not be refreshed; previous usage is retained')
                }
            }
            if (accounts.length < 100) return
            skip += accounts.length
        }
    }

    async onApplicationShutdown() {
        this.stopping = true
        if (this.timer) clearInterval(this.timer)
        await this.running
    }
}
