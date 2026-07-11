import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleDestroy,
    OnModuleInit,
    Optional
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { IUser } from '@xpert-ai/contracts'
import {
    CollaborationDocumentProviderRegistry,
    type ApplyCollaborationUpdateInput,
    type ApplyCollaborationUpdateResult,
    type CollaborationApi,
    type CollaborationDocumentRecord,
    type CollaborationDocumentState,
    type CollaborationPresencePatch,
    type CollaborationProviderContext,
    type CollaborationRuntimeActor,
    type CollaborationScope,
    type CollaborationSessionDescriptor,
    type CreateCollaborationSessionInput,
    type EnsureCollaborationDocumentInput,
    type GetCollaborationDocumentInput,
    type GetCollaborationDocumentStateInput,
    type ICollaborationActor,
    type ICollaborationPresence,
    MANAGED_QUEUE_SERVICE_TOKEN,
    type ManagedQueueService,
    RequestContext,
    type UpsertVirtualPresenceInput
} from '@xpert-ai/plugin-sdk'
import { environment } from '@xpert-ai/server-config'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import { Repository } from 'typeorm'
import * as Y from 'yjs'
import { CollaborationDocument, CollaborationUpdate } from './entities'

const SESSION_TTL_SECONDS = 600
const PRESENCE_TTL_SECONDS = 30
const PRESENCE_STALE_MS = 15_000
const MAX_UPDATE_BYTES = 2 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024
const MAX_PRESENCE_BYTES = 16 * 1024
const UPDATE_RETENTION_COUNT = 200
const UPDATE_RETENTION_MS = 24 * 60 * 60 * 1000
const COLLABORATION_NAMESPACE = '/api/collaboration'
const BROADCAST_CHANNEL = 'xpert:collaboration:broadcast'
const MATERIALIZATION_PLUGIN = '@xpert-ai/platform'

/** Identity and scope inherited by a runtime-scoped Collaboration API instance. */
export type CollaborationRuntimeDefaults = CollaborationScope & {
    conversationId?: string | null
    agentKey?: string | null
    xpertName?: string | null
    executionId?: string | null
}

/** Server-side session record; only the hash of `clientKey` is retained. */
export type CollaborationSession = CollaborationScope & {
    sessionId: string
    clientKeyHash: string
    documentId: string
    providerKey: string
    resourceId: string
    access: 'read' | 'write'
    actor: ICollaborationActor
    expiresAt: number
}

/** Cross-node message envelope shared through Redis and the local gateway event bus. */
export type CollaborationBroadcast =
    | { nodeId: string; type: 'update'; documentId: string; payload: Record<string, unknown> }
    | { nodeId: string; type: 'presence'; documentId: string; payload: Record<string, unknown> }
    | { nodeId: string; type: 'presence-remove'; documentId: string; payload: Record<string, unknown> }

/**
 * Owns authoritative Yjs state, scoped access, browser sessions, presence, and materialization.
 * Plugin providers own resource authorization and projection into business entities.
 */
@Injectable()
export class CollaborationService implements CollaborationApi, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CollaborationService.name)
    private readonly nodeId = randomUUID()
    private readonly events = new EventEmitter()
    private readonly localSessions = new Map<string, CollaborationSession>()
    private subscriber?: RedisClientType
    readonly api: CollaborationApi = this.createScopedApi()

    constructor(
        @InjectRepository(CollaborationDocument) private readonly documentRepository: Repository<CollaborationDocument>,
        @InjectRepository(CollaborationUpdate) private readonly updateRepository: Repository<CollaborationUpdate>,
        private readonly providers: CollaborationDocumentProviderRegistry,
        @Optional() @Inject(REDIS_CLIENT) private readonly redis?: RedisClientType,
        @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService
    ) {}

    /** Start a dedicated subscriber so broadcasts reach gateways on every API node. */
    async onModuleInit() {
        if (!this.redis) return
        try {
            this.subscriber = this.redis.duplicate()
            await this.subscriber.connect()
            await this.subscriber.subscribe(BROADCAST_CHANNEL, (message) => this.receiveBroadcast(message))
        } catch (error) {
            this.logger.warn(`Collaboration Redis subscriber is unavailable: ${errorMessage(error)}`)
        }
    }

    async onModuleDestroy() {
        try {
            if (this.subscriber?.isOpen) {
                await this.subscriber.unsubscribe(BROADCAST_CHANNEL)
                await this.subscriber.quit()
            }
        } catch (error) {
            this.logger.warn(`Failed to close collaboration subscriber: ${errorMessage(error)}`)
        }
    }

    /** Bind runtime identity and scope once so plugins cannot provide arbitrary tenant context per call. */
    createScopedApi(defaults: CollaborationRuntimeDefaults = {}): CollaborationApi {
        return {
            ensureDocument: (input) => this.ensureDocumentWithScope(input, this.resolveScope(defaults)),
            getDocument: (input) => this.getDocumentWithScope(input, this.resolveScope(defaults)),
            getDocumentState: (input) => this.getDocumentStateWithScope(input, this.resolveScope(defaults)),
            applyUpdate: (input) => this.applyUpdateWithScope(input, this.resolveScope(defaults)),
            createSession: (input) => this.createSessionWithScope(input, this.resolveScope(defaults)),
            listPresence: (input) => this.listPresenceWithScope(input.documentId, this.resolveScope(defaults)),
            upsertVirtualPresence: (input) =>
                this.upsertVirtualPresenceWithScope(input, this.resolveScope(defaults), defaults),
            removeVirtualPresence: (input) =>
                this.removeVirtualPresenceWithScope(
                    input.documentId,
                    input.presenceId,
                    input.actorKey,
                    this.resolveScope(defaults),
                    defaults
                ),
            archiveDocument: (input) => this.setDocumentStatus(input, 'archived', this.resolveScope(defaults)),
            deleteDocument: (input) => this.deleteDocumentWithScope(input, this.resolveScope(defaults))
        }
    }

    ensureDocument(input: EnsureCollaborationDocumentInput) {
        return this.api.ensureDocument(input)
    }
    getDocument(input: GetCollaborationDocumentInput) {
        return this.api.getDocument(input)
    }
    getDocumentState(input: GetCollaborationDocumentStateInput) {
        return this.api.getDocumentState(input)
    }
    applyUpdate(input: ApplyCollaborationUpdateInput) {
        return this.api.applyUpdate(input)
    }
    createSession(input: CreateCollaborationSessionInput) {
        return this.api.createSession(input)
    }
    listPresence(input: { documentId: string }) {
        return this.api.listPresence(input)
    }
    upsertVirtualPresence(input: UpsertVirtualPresenceInput) {
        return this.api.upsertVirtualPresence(input)
    }
    removeVirtualPresence(input: { documentId: string; presenceId?: string | null; actorKey?: string | null }) {
        return this.api.removeVirtualPresence(input)
    }
    archiveDocument(input: GetCollaborationDocumentInput) {
        return this.api.archiveDocument(input)
    }
    deleteDocument(input: GetCollaborationDocumentInput) {
        return this.api.deleteDocument(input)
    }

    /** Subscribe the WebSocket gateway to both local and Redis-originated broadcasts. */
    onBroadcast(listener: (event: CollaborationBroadcast) => void) {
        this.events.on('broadcast', listener)
        return () => this.events.off('broadcast', listener)
    }

    /** Resolve and timing-safely validate a single-document browser session. */
    async resolveSession(
        sessionId?: string,
        clientKey?: string,
        documentId?: string
    ): Promise<CollaborationSession | null> {
        if (!sessionId || !clientKey || !documentId) return null
        this.cleanupSessions()
        let session = this.localSessions.get(sessionId)
        if (!session && this.redis) {
            const raw = await this.redis.get(sessionKey(sessionId)).catch(() => null)
            session = raw ? (parseSession(raw) ?? undefined) : undefined
            if (session) this.localSessions.set(sessionId, session)
        }
        if (!session || session.documentId !== documentId || session.expiresAt < Date.now()) return null
        if (!timingSafeHashEqual(session.clientKeyHash, hashSecret(clientKey))) return null
        return session
    }

    async getStateForSession(session: CollaborationSession, stateVectorBase64?: string | null) {
        return this.getDocumentStateWithScope({ documentId: session.documentId, stateVectorBase64 }, session)
    }

    async applyUpdateForSession(session: CollaborationSession, input: ApplyCollaborationUpdateInput) {
        if (session.access !== 'write') throw new ForbiddenException('Collaboration session is read-only.')
        return this.applyUpdateWithScope(
            { ...input, documentId: session.documentId, actor: actorToRuntime(session.actor) },
            session,
            session.actor
        )
    }

    async listPresenceForSession(session: CollaborationSession) {
        return this.listPresenceWithScope(session.documentId, session)
    }

    async upsertPresenceForSession(session: CollaborationSession, clientId: string, patch: CollaborationPresencePatch) {
        return this.persistPresence(session.documentId, clientId, session.actor, patch, session)
    }

    async removePresenceForSession(session: CollaborationSession, clientId: string) {
        return this.removePresence(session.documentId, clientId, session)
    }

    /** Retry projection of the latest authoritative state; stale intermediate jobs are harmless. */
    async retryMaterialization(documentId: string) {
        const document = await this.documentRepository.findOne({ where: { id: documentId } })
        if (!document || document.status === 'deleted') return
        await this.materialize(document, null, 'platform:materialization-retry')
    }

    /** Lazily initialize exactly one collaboration document per scope/provider/resource tuple. */
    private async ensureDocumentWithScope(input: EnsureCollaborationDocumentInput, scope: CollaborationScope) {
        const providerKey = requiredText(input.providerKey, 'providerKey', 160)
        const resourceId = requiredText(input.resourceId, 'resourceId', 256)
        const scopeKey = collaborationScopeKey(scope)
        const existing = await this.documentRepository.findOne({ where: { scopeKey, providerKey, resourceId } })
        if (existing) {
            await this.authorize(existing, scope, 'read')
            return toRecord(existing)
        }
        const provider = this.providers.get(providerKey, scope.organizationId ?? undefined)
        const context = providerContext(providerKey, resourceId, scope, 'initialize')
        if (!(await provider.authorize(context)))
            throw new ForbiddenException('Collaboration document access was denied.')
        const initialized = await provider.initializeDocument(context)
        const state = parseBase64(initialized.stateBase64, 'initial collaboration state', MAX_DOCUMENT_BYTES)
        const ydoc = new Y.Doc()
        if (state.byteLength) Y.applyUpdate(ydoc, state)
        const encoded = encodeDocument(ydoc)
        const sequenceNumber = positiveInteger(initialized.initialSequence, 0)
        const document = await this.documentRepository.save(
            this.documentRepository.create({
                ...scopeColumns(scope),
                scopeKey,
                providerKey,
                resourceId,
                engine: 'yjs',
                schemaVersion: positiveInteger(input.schemaVersion ?? initialized.schemaVersion, 1),
                status: 'active',
                stateBase64: encoded.stateBase64,
                stateVectorBase64: encoded.stateVectorBase64,
                sequenceNumber,
                updateCount: 0,
                materializedSequence: sequenceNumber,
                materializationStatus: 'ready',
                metadata: input.metadata ?? initialized.metadata ?? null
            })
        )
        return toRecord(document)
    }

    /** Return metadata and asynchronously repair a lagging plugin projection. */
    private async getDocumentWithScope(input: GetCollaborationDocumentInput, scope: CollaborationScope) {
        const document = await this.requireDocument(input, scope)
        await this.authorize(document, scope, 'read')
        if (document.materializedSequence < document.sequenceNumber)
            void this.materialize(document, null, 'platform:read-repair')
        return toRecord(document)
    }

    /** Encode full state or the minimal Yjs delta relative to the caller's state vector. */
    private async getDocumentStateWithScope(
        input: GetCollaborationDocumentStateInput,
        scope: CollaborationScope
    ): Promise<CollaborationDocumentState> {
        const document = await this.requireDocument(input, scope)
        await this.authorize(document, scope, 'read')
        const doc = decodeDocument(document.stateBase64)
        const vector = input.stateVectorBase64
            ? parseBase64(input.stateVectorBase64, 'Yjs state vector', MAX_UPDATE_BYTES)
            : undefined
        return {
            document: toRecord(document),
            updateBase64: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64'),
            stateVectorBase64: document.stateVectorBase64,
            sequenceNumber: document.sequenceNumber
        }
    }

    /**
     * Accept one update under a pessimistic document lock, deduplicate it by byte hash,
     * advance the sequence, then broadcast and materialize after the transaction commits.
     */
    private async applyUpdateWithScope(
        input: ApplyCollaborationUpdateInput,
        scope: CollaborationScope,
        actorOverride?: ICollaborationActor
    ): Promise<ApplyCollaborationUpdateResult> {
        const update = parseBase64(input.updateBase64, 'Yjs update', MAX_UPDATE_BYTES)
        if (!update.byteLength) throw new BadRequestException('Collaboration update is empty.')
        const actor = actorOverride ?? createRuntimeActor(scope, input.actor)
        const persisted = await this.documentRepository.manager.transaction(async (manager) => {
            const documents = manager.getRepository(CollaborationDocument)
            const updates = manager.getRepository(CollaborationUpdate)
            const document = await documents.findOne({
                where: scopedDocumentIdWhere(input.documentId, scope),
                lock: { mode: 'pessimistic_write' }
            })
            if (!document || document.status !== 'active')
                throw new NotFoundException('Collaboration document was not found.')
            await this.authorize(document, scope, 'write', actor)
            if (
                input.expectedSequence !== undefined &&
                input.expectedSequence !== null &&
                document.sequenceNumber !== input.expectedSequence
            ) {
                throw new BadRequestException(
                    `Collaboration sequence conflict. Current sequence is ${document.sequenceNumber}.`
                )
            }
            const updateHash = createHash('sha256').update(update).digest('hex')
            const duplicate = await updates.findOne({ where: { documentId: document.id, updateHash } })
            if (duplicate) return { document, duplicate, saved: duplicate }
            const doc = decodeDocument(document.stateBase64)
            Y.applyUpdate(doc, update, input.origin ?? 'platform.collaboration')
            const encoded = encodeDocument(doc)
            if (Buffer.byteLength(encoded.stateBase64, 'base64') > MAX_DOCUMENT_BYTES)
                throw new BadRequestException('Collaboration document exceeds the platform size limit.')
            document.sequenceNumber += 1
            document.updateCount += 1
            document.stateBase64 = encoded.stateBase64
            document.stateVectorBase64 = encoded.stateVectorBase64
            document.materializationStatus = 'pending'
            const saved = await updates.save(
                updates.create({
                    ...scopeColumns(scope),
                    documentId: document.id,
                    sequenceNumber: document.sequenceNumber,
                    updateBase64: input.updateBase64,
                    updateHash,
                    origin: optionalText(input.origin, 256),
                    actorType: actor.actorType,
                    presenceId: actor.presenceId,
                    userId: scope.userId ?? null,
                    createdById: scope.userId ?? undefined
                })
            )
            await documents.save(document)
            return { document, duplicate: null, saved }
        })
        if (!persisted.duplicate) {
            await this.publishBroadcast({
                nodeId: this.nodeId,
                type: 'update',
                documentId: persisted.document.id,
                payload: {
                    documentId: persisted.document.id,
                    updateBase64: input.updateBase64,
                    sequenceNumber: persisted.document.sequenceNumber,
                    origin: optionalText(input.origin, 256),
                    presenceId: actor.presenceId
                }
            })
            await this.materialize(persisted.document, input.updateBase64, input.origin ?? null)
            void this.pruneUpdates(persisted.document.id, persisted.document.sequenceNumber)
        }
        const latest = await this.documentRepository.findOneByOrFail({ id: persisted.document.id })
        return {
            documentId: latest.id,
            duplicate: Boolean(persisted.duplicate),
            updateId: persisted.saved.id,
            sequenceNumber: latest.sequenceNumber,
            stateVectorBase64: latest.stateVectorBase64,
            materializationStatus: latest.materializationStatus
        }
    }

    /** Issue random browser credentials without exposing platform authentication or scope ids. */
    private async createSessionWithScope(
        input: CreateCollaborationSessionInput,
        scope: CollaborationScope
    ): Promise<CollaborationSessionDescriptor> {
        const document = await this.requireDocument({ documentId: input.documentId }, scope)
        const access = input.access === 'read' ? 'read' : 'write'
        await this.authorize(document, scope, access)
        const sessionId = randomBytes(32).toString('base64url')
        const clientKey = randomBytes(24).toString('base64url')
        const actor = createUserActor(RequestContext.currentUser() ?? null, scope.userId, sessionId)
        const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000
        const session: CollaborationSession = {
            ...scope,
            sessionId,
            clientKeyHash: hashSecret(clientKey),
            documentId: document.id,
            providerKey: document.providerKey,
            resourceId: document.resourceId,
            access,
            actor,
            expiresAt
        }
        this.localSessions.set(sessionId, session)
        if (this.redis)
            await this.redis
                .set(sessionKey(sessionId), JSON.stringify(session), { EX: SESSION_TTL_SECONDS })
                .catch(() => undefined)
        return {
            sessionId,
            clientKey,
            documentId: document.id,
            namespace: COLLABORATION_NAMESPACE,
            connectionUrl: collaborationConnectionUrl(),
            access,
            actor,
            expiresAt
        }
    }

    private async listPresenceWithScope(documentId: string, scope: CollaborationScope) {
        const document = await this.requireDocument({ documentId }, scope)
        await this.authorize(document, scope, 'read')
        return this.readPresence(document.id)
    }

    /** Publish Agent/system activity through the same ephemeral presence channel as users. */
    private async upsertVirtualPresenceWithScope(
        input: UpsertVirtualPresenceInput,
        scope: CollaborationScope,
        defaults: CollaborationRuntimeDefaults
    ) {
        const document = await this.requireDocument({ documentId: input.documentId }, scope)
        await this.authorize(document, scope, 'write')
        const actor = createVirtualActor(document.id, scope, defaults, input.actor)
        return this.persistPresence(document.id, actor.presenceId, actor, input.presence, scope)
    }

    private async removeVirtualPresenceWithScope(
        documentId: string,
        presenceId: string | null | undefined,
        actorKey: string | null | undefined,
        scope: CollaborationScope,
        defaults: CollaborationRuntimeDefaults
    ) {
        const document = await this.requireDocument({ documentId }, scope)
        await this.authorize(document, scope, 'write')
        const resolved = presenceId ?? createVirtualActor(document.id, scope, defaults, { actorKey }).presenceId
        await this.removePresence(document.id, resolved, scope)
    }

    private async setDocumentStatus(
        input: GetCollaborationDocumentInput,
        status: 'archived',
        scope: CollaborationScope
    ) {
        const document = await this.requireDocument(input, scope)
        await this.authorize(document, scope, 'manage')
        document.status = status
        return toRecord(await this.documentRepository.save(document))
    }

    private async deleteDocumentWithScope(input: GetCollaborationDocumentInput, scope: CollaborationScope) {
        const document = await this.requireDocument(input, scope)
        await this.authorize(document, scope, 'manage')
        document.status = 'deleted'
        const saved = await this.documentRepository.save(document)
        const provider = this.providers.get(document.providerKey, scope.organizationId ?? undefined)
        await provider.onDocumentDeleted?.(
            providerContext(document.providerKey, document.resourceId, scope, 'delete', document.id)
        )
        return toRecord(saved)
    }

    private async authorize(
        document: CollaborationDocument,
        scope: CollaborationScope,
        operation: 'read' | 'write' | 'manage',
        actor?: ICollaborationActor
    ) {
        const provider = this.providers.get(document.providerKey, scope.organizationId ?? undefined)
        const allowed = await provider.authorize(
            providerContext(document.providerKey, document.resourceId, scope, operation, document.id, actor)
        )
        if (!allowed) throw new ForbiddenException('Collaboration document access was denied.')
    }

    /**
     * Project authoritative state into the plugin model. A projection failure never rejects an
     * already committed CRDT update; it marks the document failed and schedules retry instead.
     */
    private async materialize(document: CollaborationDocument, updateBase64: string | null, origin: string | null) {
        try {
            const provider = this.providers.get(document.providerKey, document.organizationId ?? undefined)
            const scope = documentScope(document)
            await provider.materializeDocument({
                ...providerContext(document.providerKey, document.resourceId, scope, 'materialize', document.id),
                documentId: document.id,
                stateBase64: document.stateBase64,
                stateVectorBase64: document.stateVectorBase64,
                sequenceNumber: document.sequenceNumber,
                updateBase64,
                origin
            })
            await this.documentRepository.update(document.id, {
                materializedSequence: document.sequenceNumber,
                materializationStatus: 'ready',
                lastMaterializationError: null
            })
            document.materializedSequence = document.sequenceNumber
            document.materializationStatus = 'ready'
            document.lastMaterializationError = null
        } catch (error) {
            const message = errorMessage(error).slice(0, 2_000)
            document.materializationStatus = 'failed'
            document.lastMaterializationError = message
            await this.documentRepository.update(document.id, {
                materializationStatus: 'failed',
                lastMaterializationError: message
            })
            this.logger.warn(`Collaboration materialization failed for ${document.id}: ${message}`)
            await this.enqueueMaterialization(document).catch((queueError) =>
                this.logger.warn(`Failed to enqueue collaboration materialization: ${errorMessage(queueError)}`)
            )
        }
    }

    private async enqueueMaterialization(document: CollaborationDocument) {
        if (!this.queue) return
        await this.queue.enqueue({
            pluginName: MATERIALIZATION_PLUGIN,
            queueName: 'collaboration',
            jobName: 'materialize',
            payload: { documentId: document.id },
            tenantId: document.tenantId,
            organizationId: document.organizationId,
            scopeKey: document.organizationId ?? null,
            jobId: `collaboration-materialize-${document.id}-${document.sequenceNumber}`,
            attempts: 3,
            backoffMs: { type: 'exponential', delay: 1_000 },
            removeOnComplete: true
        })
    }

    /** Sanitize, TTL-store, and broadcast bounded presence without writing document history. */
    private async persistPresence(
        documentId: string,
        clientId: string,
        actor: ICollaborationActor,
        patch: CollaborationPresencePatch,
        scope: CollaborationScope
    ) {
        const presence = sanitizePresence({ clientId, ...actor, ...patch, updatedAt: Date.now() })
        if (Buffer.byteLength(JSON.stringify(presence)) > MAX_PRESENCE_BYTES)
            throw new BadRequestException('Collaboration presence exceeds the platform size limit.')
        if (this.redis) {
            const indexKey = presenceIndexKey(scope, documentId)
            await Promise.all([
                this.redis.set(presenceEntryKey(scope, documentId, clientId), JSON.stringify(presence), {
                    EX: PRESENCE_TTL_SECONDS
                }),
                this.redis.sAdd(indexKey, clientId)
            ])
            await this.redis.expire(indexKey, PRESENCE_TTL_SECONDS * 2)
        }
        await this.publishBroadcast({ nodeId: this.nodeId, type: 'presence', documentId, payload: { ...presence } })
        return presence
    }

    private async removePresence(documentId: string, clientId: string, scope: CollaborationScope) {
        if (this.redis)
            await Promise.all([
                this.redis.del(presenceEntryKey(scope, documentId, clientId)),
                this.redis.sRem(presenceIndexKey(scope, documentId), clientId)
            ]).catch(() => undefined)
        await this.publishBroadcast({ nodeId: this.nodeId, type: 'presence-remove', documentId, payload: { clientId } })
    }

    /** Return active presence and opportunistically remove entries whose heartbeat is stale. */
    private async readPresence(documentId: string): Promise<ICollaborationPresence[]> {
        if (!this.redis) return []
        const document = await this.documentRepository.findOneBy({ id: documentId })
        if (!document) return []
        const scope = documentScope(document)
        const indexKey = presenceIndexKey(scope, documentId)
        const clientIds = await this.redis.sMembers(indexKey).catch(() => [])
        const values = await Promise.all(
            clientIds.map(async (clientId) => ({
                clientId,
                raw: await this.redis?.get(presenceEntryKey(scope, documentId, clientId)).catch(() => null)
            }))
        )
        const cutoff = Date.now() - PRESENCE_STALE_MS
        const active: ICollaborationPresence[] = []
        const stale: string[] = []
        for (const { clientId, raw } of values) {
            const parsed = raw ? parsePresence(raw) : null
            if (!parsed || parsed.updatedAt < cutoff) stale.push(clientId)
            else active.push(parsed)
        }
        if (stale.length) {
            await Promise.all(
                stale.flatMap((clientId) => [
                    this.redis!.del(presenceEntryKey(scope, documentId, clientId)),
                    this.redis!.sRem(indexKey, clientId)
                ])
            ).catch(() => undefined)
            for (const clientId of stale)
                await this.publishBroadcast({
                    nodeId: this.nodeId,
                    type: 'presence-remove',
                    documentId,
                    payload: { clientId }
                })
        }
        return active
    }

    /** Emit locally first for low latency, then publish for other API nodes. */
    private async publishBroadcast(event: CollaborationBroadcast) {
        this.events.emit('broadcast', event)
        if (this.redis) await this.redis.publish(BROADCAST_CHANNEL, JSON.stringify(event)).catch(() => undefined)
    }

    private receiveBroadcast(message: string) {
        try {
            const event = JSON.parse(message) as CollaborationBroadcast
            if (!event || event.nodeId === this.nodeId || !event.documentId) return
            this.events.emit('broadcast', event)
        } catch (error) {
            this.logger.warn(`Invalid collaboration broadcast: ${errorMessage(error)}`)
        }
    }

    /** Resolve a document only inside the hash-derived tenant/organization boundary. */
    private async requireDocument(input: GetCollaborationDocumentInput, scope: CollaborationScope) {
        const where =
            'documentId' in input && input.documentId
                ? scopedDocumentIdWhere(input.documentId, scope)
                : {
                      scopeKey: collaborationScopeKey(scope),
                      providerKey: input.providerKey,
                      resourceId: input.resourceId
                  }
        const document = await this.documentRepository.findOne({ where })
        if (!document || document.status === 'deleted')
            throw new NotFoundException('Collaboration document was not found.')
        return document
    }

    private resolveScope(defaults: CollaborationRuntimeDefaults): CollaborationScope {
        return {
            tenantId: defaults.tenantId ?? RequestContext.currentTenantId() ?? null,
            organizationId: defaults.organizationId ?? RequestContext.getOrganizationId() ?? null,
            workspaceId: defaults.workspaceId ?? null,
            projectId: defaults.projectId ?? null,
            xpertId: defaults.xpertId ?? null,
            userId: defaults.userId ?? RequestContext.currentUserId() ?? null
        }
    }

    private cleanupSessions() {
        const now = Date.now()
        for (const [key, value] of this.localSessions.entries())
            if (value.expiresAt < now) this.localSessions.delete(key)
    }

    private async pruneUpdates(documentId: string, sequenceNumber: number) {
        const sequenceCutoff = Math.max(0, sequenceNumber - UPDATE_RETENTION_COUNT)
        const dateCutoff = new Date(Date.now() - UPDATE_RETENTION_MS)
        await this.updateRepository
            .createQueryBuilder()
            .delete()
            .where('documentId = :documentId', { documentId })
            .andWhere('sequenceNumber <= :sequenceCutoff', { sequenceCutoff })
            .andWhere('createdAt < :dateCutoff', { dateCutoff })
            .execute()
    }
}

function toRecord(document: CollaborationDocument): CollaborationDocumentRecord {
    return {
        id: document.id,
        providerKey: document.providerKey,
        resourceId: document.resourceId,
        engine: document.engine,
        schemaVersion: document.schemaVersion,
        status: document.status,
        sequenceNumber: document.sequenceNumber,
        updateCount: document.updateCount,
        materializedSequence: document.materializedSequence,
        materializationStatus: document.materializationStatus,
        lastMaterializationError: document.lastMaterializationError ?? null,
        tenantId: document.tenantId ?? null,
        organizationId: document.organizationId ?? null,
        workspaceId: document.workspaceId ?? null,
        projectId: document.projectId ?? null,
        xpertId: document.xpertId ?? null,
        userId: document.userId ?? null,
        metadata: document.metadata ?? null,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt
    }
}

function encodeDocument(doc: Y.Doc) {
    return {
        stateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
        stateVectorBase64: Buffer.from(Y.encodeStateVector(doc)).toString('base64')
    }
}

function decodeDocument(stateBase64: string) {
    const doc = new Y.Doc()
    if (stateBase64) Y.applyUpdate(doc, Buffer.from(stateBase64, 'base64'))
    return doc
}

function parseBase64(value: string, label: string, maxBytes: number) {
    if (!value || !/^[A-Za-z0-9+/=_-]+$/.test(value)) throw new BadRequestException(`${label} is invalid.`)
    const buffer = Buffer.from(value, 'base64')
    if (buffer.byteLength > maxBytes) throw new BadRequestException(`${label} exceeds the platform size limit.`)
    return buffer
}

/** Stable storage boundary that deliberately excludes public business identifiers. */
function collaborationScopeKey(scope: CollaborationScope) {
    return createHash('sha256')
        .update([scope.tenantId ?? '-', scope.organizationId ?? '-'].join(':'))
        .digest('hex')
}

function scopeColumns(scope: CollaborationScope) {
    return {
        tenantId: scope.tenantId ?? null,
        organizationId: scope.organizationId ?? null,
        workspaceId: scope.workspaceId ?? null,
        projectId: scope.projectId ?? null,
        xpertId: scope.xpertId ?? null,
        userId: scope.userId ?? null
    }
}

function documentScope(document: CollaborationDocument): CollaborationScope {
    return scopeColumns(document)
}

function scopedDocumentIdWhere(id: string, scope: CollaborationScope) {
    return { id, scopeKey: collaborationScopeKey(scope) }
}

function providerContext(
    providerKey: string,
    resourceId: string,
    scope: CollaborationScope,
    operation: CollaborationProviderContext['operation'],
    documentId?: string,
    actor?: ICollaborationActor
): CollaborationProviderContext {
    return { ...scope, providerKey, resourceId, operation, documentId: documentId ?? null, actor: actor ?? null }
}

function createUserActor(
    user: IUser | null,
    userId: string | null | undefined,
    sessionId: string
): ICollaborationActor {
    const displayName = userDisplayName(user) ?? 'Collaborator'
    const identity = userId ?? sessionId
    return {
        presenceId: `user_${createHash('sha256').update(identity).digest('base64url').slice(0, 22)}`,
        actorType: 'user',
        displayName: displayName.slice(0, 64),
        color: actorColor(identity),
        avatarUrl: optionalText(user?.imageUrl, 2_048) ?? null
    }
}

function createRuntimeActor(scope: CollaborationScope, input?: CollaborationRuntimeActor | null): ICollaborationActor {
    const actorType = input?.actorType === 'system' ? 'system' : input?.actorType === 'user' ? 'user' : 'agent'
    const key = input?.actorKey ?? scope.xpertId ?? scope.userId ?? randomUUID()
    return {
        presenceId: `${actorType}_${createHash('sha256').update(key).digest('base64url').slice(0, 22)}`,
        actorType,
        displayName:
            optionalText(input?.displayName, 64) ??
            (actorType === 'agent' ? 'Xpert Agent' : actorType === 'system' ? 'System' : 'Collaborator'),
        color: actorColor(key),
        avatarUrl: optionalText(input?.avatarUrl, 2_048) ?? null
    }
}

/** Build a stable Agent identity per xpert/agent/conversation/document combination. */
function createVirtualActor(
    documentId: string,
    scope: CollaborationScope,
    defaults: CollaborationRuntimeDefaults,
    input?: CollaborationRuntimeActor | null
) {
    const actorType = input?.actorType === 'system' ? 'system' : 'agent'
    const actorKey =
        input?.actorKey ??
        [
            defaults.xpertId ?? scope.xpertId ?? '-',
            defaults.agentKey ?? '-',
            defaults.conversationId ?? '-',
            documentId
        ].join(':')
    return createRuntimeActor(scope, {
        actorType,
        actorKey,
        displayName:
            input?.displayName ??
            defaults.xpertName ??
            defaults.agentKey ??
            (actorType === 'agent' ? 'Xpert Agent' : 'System'),
        avatarUrl: input?.avatarUrl
    })
}

function actorToRuntime(actor: ICollaborationActor): CollaborationRuntimeActor {
    return {
        actorType: actor.actorType,
        actorKey: actor.presenceId,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl
    }
}

function userDisplayName(user: IUser | null) {
    if (!user) return null
    const candidate = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    return optionalText(candidate || user.name || user.email, 64) ?? null
}

function actorColor(identity: string) {
    const hue = (createHash('sha256').update(identity).digest()[0] / 255) * 330
    return hslToHex(hue, 72, 46)
}

function hslToHex(h: number, s: number, l: number) {
    const saturation = s / 100
    const lightness = l / 100
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = lightness - chroma / 2
    const [r, g, b] =
        h < 60
            ? [chroma, x, 0]
            : h < 120
              ? [x, chroma, 0]
              : h < 180
                ? [0, chroma, x]
                : h < 240
                  ? [0, x, chroma]
                  : h < 300
                    ? [x, 0, chroma]
                    : [chroma, 0, x]
    return `#${[r, g, b]
        .map((value) =>
            Math.round((value + m) * 255)
                .toString(16)
                .padStart(2, '0')
        )
        .join('')}`
}

/** Enforce presence size semantics before data reaches Redis or another client. */
function sanitizePresence(value: ICollaborationPresence): ICollaborationPresence {
    return {
        clientId: requiredText(value.clientId, 'clientId', 128),
        presenceId: requiredText(value.presenceId, 'presenceId', 128),
        actorType: value.actorType,
        displayName: requiredText(value.displayName, 'displayName', 64),
        color: requiredText(value.color, 'color', 32),
        avatarUrl: optionalText(value.avatarUrl, 2_048) ?? null,
        pageId: optionalText(value.pageId, 256) ?? null,
        pointer:
            value.pointer && Number.isFinite(value.pointer.x) && Number.isFinite(value.pointer.y)
                ? {
                      pageId: optionalText(value.pointer.pageId, 256) ?? null,
                      x: clamp(value.pointer.x, 0, 1),
                      y: clamp(value.pointer.y, 0, 1),
                      visible: value.pointer.visible !== false
                  }
                : null,
        focus: value.focus
            ? {
                  kind: requiredText(value.focus.kind, 'focus kind', 64),
                  key: optionalText(value.focus.key, 512) ?? null,
                  pageId: optionalText(value.focus.pageId, 256) ?? null,
                  elementId: optionalText(value.focus.elementId, 256) ?? null,
                  fieldKey: optionalText(value.focus.fieldKey, 512) ?? null
              }
            : null,
        selection: sanitizeSelection(value.selection),
        viewport:
            value.viewport &&
            Number.isFinite(value.viewport.zoom) &&
            Number.isFinite(value.viewport.width) &&
            Number.isFinite(value.viewport.height)
                ? {
                      zoom: clamp(value.viewport.zoom, 0.05, 16),
                      width: clamp(value.viewport.width, 1, 100_000),
                      height: clamp(value.viewport.height, 1, 100_000)
                  }
                : null,
        mode: optionalText(value.mode, 64) ?? null,
        status: value.status ?? null,
        toolName: optionalText(value.toolName, 160) ?? null,
        operationLabel: optionalText(value.operationLabel, 256) ?? null,
        updatedAt: Date.now()
    }
}

function sanitizeSelection(selection: ICollaborationPresence['selection']) {
    if (!selection) return null
    return {
        kind: selection.kind,
        fieldKey: optionalText(selection.fieldKey, 512) ?? null,
        elementIds: selection.elementIds?.slice(0, 128).map((item) => requiredText(item, 'elementId', 256)) ?? null,
        anchorRelativeBase64: optionalBase64(selection.anchorRelativeBase64, 8_192),
        headRelativeBase64: optionalBase64(selection.headRelativeBase64, 8_192)
    }
}

function parsePresence(raw: string): ICollaborationPresence | null {
    try {
        const value = JSON.parse(raw) as ICollaborationPresence
        return value && typeof value.updatedAt === 'number' ? value : null
    } catch {
        return null
    }
}

function sessionKey(sessionId: string) {
    return `xpert:collaboration:session:${hashSecret(sessionId)}`
}
function presenceKey(scope: CollaborationScope, documentId: string) {
    return `xpert:collaboration:presence:${collaborationScopeKey(scope)}:${documentId}`
}
function presenceIndexKey(scope: CollaborationScope, documentId: string) {
    return `${presenceKey(scope, documentId)}:index`
}
function presenceEntryKey(scope: CollaborationScope, documentId: string, clientId: string) {
    return `${presenceKey(scope, documentId)}:entry:${createHash('sha256').update(clientId).digest('base64url')}`
}
function hashSecret(value: string) {
    return createHash('sha256').update(value).digest('hex')
}
function timingSafeHashEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function parseSession(raw: string): CollaborationSession | null {
    try {
        const value = JSON.parse(raw) as CollaborationSession
        return value?.sessionId && value?.documentId && value?.clientKeyHash ? value : null
    } catch {
        return null
    }
}

function collaborationConnectionUrl() {
    const base = optionalText(environment.baseUrl, 2_048) ?? 'http://localhost:3000'
    return new URL(COLLABORATION_NAMESPACE, base.endsWith('/') ? base : `${base}/`).toString().replace(/\/$/, '')
}

function requiredText(value: unknown, label: string, max: number) {
    const text = optionalText(value, max)
    if (!text) throw new BadRequestException(`${label} is required.`)
    return text
}
function optionalText(value: unknown, max: number) {
    return typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : undefined
}
function optionalBase64(value: unknown, max: number) {
    const text = optionalText(value, max)
    return text && /^[A-Za-z0-9+/=_-]+$/.test(text) ? text : null
}
function positiveInteger(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback
}
function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}
function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}
