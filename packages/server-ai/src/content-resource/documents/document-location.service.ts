import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { ContentResourceProviderRegistry, type ContentLocationChangeInput } from '@xpert-ai/plugin-sdk'
import { ContentDocument, ContentLocationChange } from './entities'
import { ContentDocumentService } from './document.service'
import { CollaborationDocument } from '../../collaboration/entities/collaboration-document.entity'
import { ProjectFilesRuntimeService } from '../../xpert-project/services/project-files-runtime.service'
import { assertPublicWorkspacePath } from '../../shared/volume/workspace-managed-path'

/** Persist the entire rename intent before touching files. Retired rooms fence late writes. */
@Injectable()
export class ContentDocumentLocations {
    constructor(
        private readonly documents: ContentDocumentService,
        private readonly providers: ContentResourceProviderRegistry,
        private readonly files: ProjectFilesRuntimeService,
        @InjectRepository(ContentLocationChange) private readonly changes: Repository<ContentLocationChange>
    ) {}

    async move(input: ContentLocationChangeInput) {
        await this.documents.access.check(input, true)
        assertPublicWorkspacePath(input.path)
        assertPublicWorkspacePath(input.destination)
        if (!input.path || !input.destination || input.destination.startsWith(`${input.path}/`))
            this.documents.conflict()
        const provider = this.providers.get(input.source.providerKey, input.actor.organizationId)
        if (!provider.locations?.validateLocationChange || !provider.locations?.onLocationChanged)
            this.documents.conflict()
        await this.documents.store
            .storage({ tenantId: input.actor.tenantId, projectId: input.projectId })
            .withLock('locations', async () => {
                const existing = (
                    await this.changes.find({
                        where: {
                            tenantId: input.actor.tenantId,
                            organizationId: input.actor.organizationId,
                            projectId: input.projectId,
                            status: Not('projected')
                        }
                    })
                ).find((change) => this.sameSource(change.input, input))
                if (existing) {
                    if (
                        existing.input.path !== input.path ||
                        existing.input.destination !== input.destination ||
                        existing.input.expectedSourceVersion !== input.expectedSourceVersion ||
                        existing.input.title !== input.title ||
                        existing.input.parentResourceId !== input.parentResourceId ||
                        existing.input.deleted !== input.deleted
                    )
                        this.documents.conflict()
                    await this.finish(existing)
                    return
                }
                await provider.locations?.validateLocationChange(input)
                const candidates = await this.documents.store.documents.find({
                    where: {
                        tenantId: input.actor.tenantId,
                        organizationId: input.actor.organizationId,
                        projectId: input.projectId
                    },
                    order: { id: 'ASC' }
                })
                const documents = await this.selectDocuments(candidates, input)
                if (!documents.length) this.documents.conflict()
                await this.lockAll(documents, async () => {
                    // Reject common name collisions before retiring any live room. The file step rechecks
                    // the target under the workspace lease; a later external race remains recoverable.
                    await this.files.assertMoveAvailable(input)
                    const operation = this.changes.create({
                        id: randomUUID(),
                        tenantId: input.actor.tenantId,
                        organizationId: input.actor.organizationId,
                        projectId: input.projectId,
                        input,
                        documents: [],
                        status: 'prepared'
                    })
                    await this.changes.manager.transaction(async (manager) => {
                        for (const candidate of documents) {
                            const rows = manager.getRepository(ContentDocument),
                                rooms = manager.getRepository(CollaborationDocument)
                            const current = await rows.findOneByOrFail({ id: candidate.id })
                            if (!['ready', 'deleted'].includes(current.status)) this.documents.conflict()
                            const file = await this.files.read({
                                actor: input.actor,
                                projectId: input.projectId,
                                path: current.path
                            })
                            if (file.sha256 !== current.fileHash) this.documents.conflict()
                            if (current.collaborationId) {
                                const room = await rooms.findOneOrFail({
                                    where: { id: current.collaborationId },
                                    lock: { mode: 'pessimistic_write' }
                                })
                                // Refuse the move before any bytes change if accepted edits are still awaiting publication.
                                if (room.sequenceNumber !== current.sequence) this.documents.conflict()
                                await rooms.update(room.id, { status: 'archived' })
                            }
                            operation.documents.push({
                                id: current.id,
                                from: current.path,
                                to: input.destination + current.path.slice(input.path.length),
                                hash: current.fileHash,
                                epoch: current.epoch + 1
                            })
                            await rows.update(current.id, {
                                status: 'moving',
                                epoch: current.epoch + 1,
                                collaborationId: null
                            })
                        }
                        await manager.getRepository(ContentLocationChange).save(operation)
                    })
                    await this.finish(operation)
                })
            })
    }
    private sameSource(left: ContentLocationChangeInput, right: ContentLocationChangeInput) {
        return (
            left.source.providerKey === right.source.providerKey && left.source.resourceId === right.source.resourceId
        )
    }

    private async selectDocuments(candidates: ContentDocument[], input: ContentLocationChangeInput) {
        const atPath = candidates.filter(
            (document) => document.path === input.path || document.path.startsWith(`${input.path}/`)
        )
        // Deleted rows do not own their old path. A folder restore must use the exact
        // document identities and epochs recorded by its accepted deletion operation.
        const history = atPath.some((document) => document.status === 'deleted')
            ? await this.changes.find({
                  where: {
                      tenantId: input.actor.tenantId,
                      organizationId: input.actor.organizationId,
                      projectId: input.projectId,
                      status: 'projected'
                  },
                  order: { createdAt: 'DESC' }
              })
            : []
        const deletion = history.find(
            (change) =>
                this.sameSource(change.input, input) && change.input.deleted && change.input.destination === input.path
        )
        return atPath.filter(
            (document) =>
                document.status !== 'deleted' ||
                (document.path === input.path &&
                    document.sourceProvider === input.source.providerKey &&
                    document.sourceId === input.source.resourceId) ||
                deletion?.documents.some(
                    (entry) => entry.id === document.id && entry.to === document.path && entry.epoch === document.epoch
                )
        )
    }

    private async lockAll<T>(documents: ContentDocument[], work: () => Promise<T>): Promise<T> {
        const [document, ...rest] = documents
        return document ? this.documents.store.locked(document, () => this.lockAll(rest, work)) : work()
    }
    async repair() {
        const operations = await this.changes.find({
            where: { status: Not('projected') },
            order: { createdAt: 'ASC' },
            take: 30
        })
        for (const operation of operations) {
            try {
                await this.documents.store.storage(operation).withLock('locations', () => this.finish(operation))
            } catch {
                /* Durable intent stays pending; source metadata is projected only after matching file hashes. */
            }
        }
    }
    private async finish(operation: ContentLocationChange) {
        const current = await this.changes.findOneByOrFail({ id: operation.id })
        const input = current.input
        if (current.status === 'prepared') {
            await this.providers
                .get(input.source.providerKey, current.organizationId)
                .locations?.onLocationPrepared?.({ ...input, operationId: current.id })
            if (input.path !== input.destination) {
                try {
                    await this.files.moveAccepted({
                        actor: input.actor,
                        projectId: input.projectId,
                        path: input.path,
                        destination: input.destination
                    })
                } catch (error) {
                    // Only an absent source can mean the atomic rename already completed before a crash.
                    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
                        throw error
                }
            }
            for (const document of current.documents) {
                const file = await this.files.readAccepted({
                    tenantId: current.tenantId,
                    projectId: current.projectId,
                    path: document.to
                })
                if (file.sha256 !== document.hash) this.documents.conflict()
            }
            await this.changes.manager.transaction(async (manager) => {
                for (const document of current.documents)
                    await manager
                        .getRepository(ContentDocument)
                        .update(
                            { id: document.id, epoch: document.epoch, status: 'moving' },
                            {
                                path: document.to,
                                ...(document.from === input.path ? { title: input.title } : {}),
                                status: input.deleted ? 'deleted' : 'ready',
                                projectionPending: !input.deleted
                            }
                        )
                await manager.getRepository(ContentLocationChange).update(current.id, { status: 'committed' })
            })
        }
        if (current.status !== 'projected') {
            const provider = this.providers.get(input.source.providerKey, current.organizationId)
            if (!provider.locations?.onLocationChanged) this.documents.conflict()
            await provider.locations?.onLocationChanged({ ...input, operationId: current.id })
            await this.changes.update(current.id, { status: 'projected' })
        }
    }
}
