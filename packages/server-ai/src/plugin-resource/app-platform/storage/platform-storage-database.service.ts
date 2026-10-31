/**
 * Invariants: register database guards before reconciling managed account usage.
 * Database rows and external files share one account budget; both totals must be refreshed.
 * Registration or reconciliation failures abort bootstrap rather than enable incomplete accounting.
 */
import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { getConfig } from '@xpert-ai/server-config'
import {
    getEntitiesFromPlugins,
    registerAccountStorageRelations,
    WithStorageBudgetCommand
} from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { FileArtifact, FileChunk, FileEmbedding } from '../../../file-understanding/entities'
import { KnowledgeDocument } from '../../../knowledge-document/document.entity'
import { KnowledgeDocumentChunk } from '../../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentPage } from '../../../knowledge-document/page/document-page.entity'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'

@Injectable()
export class PlatformStorageDatabaseService implements OnApplicationBootstrap {
    constructor(
        private readonly database: DataSource,
        private readonly commands: CommandBus
    ) {}

    /** Install idempotent relation guards and rebuild usage for existing account deliveries. */
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
        // Bound startup memory while visiting deliveries in a deterministic order.
        let skip = 0
        for (;;) {
            const accounts = await this.database
                .getRepository(AppPlatformDelivery)
                .find({ order: { id: 'ASC' }, skip, take: 100 })
            for (const account of accounts) {
                // Rebuild SQL usage first; the command then measures files and tracked objects
                // under the account lock. Refresh performs no new business-data write.
                await this.database.query('SELECT xpert_app_storage_reconcile_account($1,$2)', [
                    account.tenantId,
                    account.userId
                ])
                await this.commands.execute(
                    new WithStorageBudgetCommand(
                        {
                            kind: 'refresh',
                            owner: {
                                tenantId: account.tenantId!,
                                organizationId: account.organizationId,
                                userId: account.userId
                            }
                        },
                        async () => undefined
                    )
                )
            }
            if (accounts.length < 100) break
            skip += accounts.length
        }
    }
}
