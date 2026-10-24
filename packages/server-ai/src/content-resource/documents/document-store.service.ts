import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import type { ContentDocumentScope, WorkspaceStorage } from '@xpert-ai/plugin-sdk'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../../shared/volume'
import { VolumeWorkspaceStorage } from '../../shared/volume/workspace-storage'
import { assertPublicWorkspacePath } from '../../shared/volume/workspace-managed-path'
import { withWorkspaceLock } from '../../shared/volume/workspace-storage-lock'
import { ContentDocument, ContentRevision } from './entities'
import { ContentDocumentAccess } from './document-access.service'
import { CollaborationDocument } from '../../collaboration/entities/collaboration-document.entity'

export const documentHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')

/** Invariants: durable intent precedes file publication; immutable candidates survive crashes.
 * A shared-filesystem lease fences every Volume mutation, including late/expired workers.
 * The published head advances only after the exact candidate bytes reach the Project path. */
@Injectable()
export class ContentDocumentStore {
    constructor(
        @Inject(VOLUME_CLIENT) private readonly volumes: Pick<VolumeClient, 'resolve'>,
        @InjectRepository(ContentDocument) readonly documents: Repository<ContentDocument>,
        @InjectRepository(ContentRevision) readonly revisions: Repository<ContentRevision>,
        private readonly access: ContentDocumentAccess
    ) {}

    storage(document: Pick<ContentDocument, 'tenantId' | 'projectId'>): WorkspaceStorage {
        return new VolumeWorkspaceStorage(
            async () =>
                this.volumes.resolve({
                    tenantId: document.tenantId,
                    projectId: document.projectId,
                    catalog: 'projects'
                }),
            'content'
        )
    }

    async locked<T>(document: Pick<ContentDocument, 'id' | 'tenantId' | 'projectId'>, work: () => Promise<T>) {
        return this.storage(document).withLock(`resources/${document.id}`, work)
    }

    async disk(document: ContentDocument) {
        const volume = await this.volumes.resolve({
            tenantId: document.tenantId,
            projectId: document.projectId,
            catalog: 'projects'
        })
        const buffer = await new VolumeSubtreeClient(volume, { allowRootWorkspace: true }).readBuffer('', document.path)
        return { buffer, hash: documentHash(buffer) }
    }

    bytes(document: ContentDocument, revision: ContentRevision) {
        return this.storage(document).read(`versions/${document.id}/${revision.id}.md`)
    }
    state(document: ContentDocument, revision: ContentRevision) {
        return this.storage(document)
            .read(`versions/${document.id}/${revision.id}.yjs`)
            .then((b) => b.toString('base64'))
    }

    /** Caller holds the resource lease; persisted sequence and hash guard replay/order. */
    async publish(
        document: ContentDocument,
        input: {
            mutationId: string
            markdown: string
            stateBase64: string
            sequence: number
            label: string
            scope?: ContentDocumentScope
            createdById?: string
            retire?: { documentId: string; expectedSequence: number }
        }
    ) {
        if (input.scope) await this.access.check(input.scope, true)
        if (document.status === 'deleted') this.access.denied()
        const buffer = Buffer.from(input.markdown, 'utf8'),
            hash = documentHash(buffer)
        const stateHash = documentHash(Buffer.from(input.stateBase64, 'base64'))
        if (buffer.length > 1024 * 1024) throw new ConflictException(t('server-ai:Error.ContentDocumentTooLarge'))
        let revision = await this.revisions.findOneBy({
            resourceId: document.id,
            mutationId: input.mutationId,
            tenantId: document.tenantId,
            organizationId: document.organizationId
        })
        if (
            revision &&
            (revision.hash !== hash ||
                revision.stateHash !== stateHash ||
                revision.sequence !== input.sequence ||
                revision.epoch !== document.epoch)
        )
            throw new ConflictException(t('server-ai:Error.ContentMutationConflict'))
        if (revision?.status === 'committed') return revision
        if (document.sequence > input.sequence) throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
        if (!revision) {
            const id = randomUUID()
            await this.storage(document).write(`versions/${document.id}/${id}.md`, buffer)
            await this.storage(document).write(
                `versions/${document.id}/${id}.yjs`,
                Buffer.from(input.stateBase64, 'base64')
            )
            revision = this.revisions.create({
                id,
                tenantId: document.tenantId,
                organizationId: document.organizationId,
                resourceId: document.id,
                parentId: document.headRevisionId,
                mutationId: input.mutationId,
                hash,
                stateHash,
                baseHash: document.fileHash,
                epoch: document.epoch,
                sequence: input.sequence,
                label: input.label,
                createdById: input.scope?.actor.userId ?? input.createdById ?? document.createdById,
                status: 'prepared'
            })
            await this.documents.manager.transaction(async (manager) => {
                if (input.retire) {
                    const rooms = manager.getRepository(CollaborationDocument)
                    const room = await rooms.findOneOrFail({
                        where: {
                            id: input.retire.documentId,
                            tenantId: document.tenantId,
                            organizationId: document.organizationId,
                            projectId: document.projectId
                        },
                        lock: { mode: 'pessimistic_write' }
                    })
                    if (
                        room.providerKey !== 'platform.content.document' ||
                        room.resourceId !== `${document.id}:${document.epoch - 1}` ||
                        room.sequenceNumber !== input.retire.expectedSequence ||
                        room.status !== 'active'
                    )
                        this.conflict()
                    await rooms.update(room.id, { status: 'archived' })
                }
                await manager.getRepository(ContentRevision).save(revision)
                await manager.getRepository(ContentDocument).update(document.id, {
                    status: 'pending',
                    epoch: document.epoch,
                    schemaVersion: document.schemaVersion,
                    collaborationId: document.collaborationId
                })
            })
        }
        await this.documents.update(document.id, { status: 'pending' })
        return this.finish(document, revision, input.scope)
    }

    /** Recovery after a lost acknowledgement uses candidate bytes and the recorded base hash. */
    async finish(document: ContentDocument, revision: ContentRevision, scope?: ContentDocumentScope) {
        const volume = await this.volumes.resolve({
            tenantId: document.tenantId,
            projectId: document.projectId,
            catalog: 'projects'
        })
        await volume.ensureRoot()
        return withWorkspaceLock(
            volume.serverRoot,
            async () => {
                const current = await this.documents.findOneByOrFail({ id: document.id })
                if (current.status === 'deleted' || current.status === 'moving') this.access.denied()
                if (current.headRevisionId === revision.id) return revision
                if (current.headRevisionId !== revision.parentId || current.epoch !== revision.epoch) this.conflict()
                const candidate = await this.bytes(document, revision)
                if (documentHash(candidate) !== revision.hash) this.conflict()
                assertPublicWorkspacePath(current.path)
                const verify = async () => {
                    if (scope) await this.access.check(scope, true)
                    const row = await this.documents.findOneByOrFail({ id: document.id })
                    if (
                        row.status === 'deleted' ||
                        row.status === 'moving' ||
                        row.epoch !== revision.epoch ||
                        row.headRevisionId !== revision.parentId
                    )
                        this.conflict()
                    const disk = await this.disk(current)
                    if (disk.hash !== revision.baseHash && disk.hash !== revision.hash) {
                        await this.documents.update(document.id, { status: 'conflict' })
                        await this.revisions.update(revision.id, { status: 'conflict' })
                        this.conflict()
                    }
                    return disk.hash
                }
                const hash = await verify()
                if (hash !== revision.hash)
                    await volume.writeFile(current.path, candidate, {
                        beforeCommit: async () => {
                            await verify()
                        }
                    })
                await this.documents.manager.transaction(async (manager) => {
                    await manager.getRepository(ContentRevision).update(revision.id, { status: 'committed' })
                    await manager.getRepository(ContentDocument).update(document.id, {
                        headRevisionId: revision.id,
                        fileHash: revision.hash,
                        sequence: revision.sequence,
                        status: 'ready',
                        projectionPending: true
                    })
                })
                revision.status = 'committed'
                Object.assign(document, {
                    headRevisionId: revision.id,
                    fileHash: revision.hash,
                    sequence: revision.sequence,
                    status: 'ready'
                })
                return revision
            },
            5000
        )
    }

    conflict(): never {
        throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
    }
}
