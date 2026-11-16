import {
    toRecord,
    collaborationScopeKey,
    scopeColumns,
    documentScope,
    scopedDocumentIdWhere,
    providerContext,
    createUserActor,
    createRuntimeActor,
    createVirtualActor,
    actorToRuntime,
    parsePresence,
    sessionKey,
    presenceIndexKey,
    presenceEntryKey,
    hashSecret,
    timingSafeHashEqual,
    parseSession,
    collaborationConnectionUrl,
    errorMessage
} from './collaboration-records'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { t } from 'i18next'
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
import { RuntimeCapabilityProvider } from '../shared/runtime/runtime-capability-provider.decorator'
import {
    CollaborationDocumentProviderRegistry,
    CollaborationRuntimeCapability,
    type ApplyCollaborationUpdateInput,
    type MigrateCollaborationDocumentInput,
    type ApplyCollaborationUpdateResult,
    type CollaborationApi,
    type CollaborationEngine,
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
import { closeRedisSubscriber, REDIS_CLIENT } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import { Repository } from 'typeorm'
import * as Y from 'yjs'
import { CollaborationDocument, CollaborationUpdate } from './entities'
import { sanitizePresence } from './collaboration-presence'
import { optionalBase64, optionalText, positiveInteger, requiredText } from './collaboration-input'
import { runWithCapturedRequestContext } from '../shared/request-context'
import { decodeDocument, encodeDocument, parseBase64 } from './collaboration-state'

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
    schemaVersion?: number
    engine?: CollaborationEngine
    documentId: string
    providerKey: string
    resourceId: string
    access: 'read' | 'write'
    actor: ICollaborationActor
    expiresAt: number
}

/** Cross-node message envelope shared through Redis and the local gateway event bus. */
export type CollaborationBroadcast =
    | { nodeId: string; type: 'revision'; documentId: string; payload: { documentId: string; revision: number } }
    | { nodeId: string; type: 'update'; documentId: string; payload: Record<string, unknown> }
    | { nodeId: string; type: 'presence'; documentId: string; payload: Record<string, unknown> }
    | { nodeId: string; type: 'presence-remove'; documentId: string; payload: Record<string, unknown> }

/**
 * Owns authoritative Yjs state, scoped access, browser sessions, presence, and materialization.
 * Plugin providers own resource authorization and projection into business entities.
 */
@Injectable()
@RuntimeCapabilityProvider(CollaborationRuntimeCapability)
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
        await closeRedisSubscriber('collaboration.redis', this.subscriber)
    }

    /** Bind runtime identity and scope once so plugins cannot provide arbitrary tenant context per call. */
    createScopedApi(defaults: CollaborationRuntimeDefaults = {}): CollaborationApi {
        return {
            notifyRevision: (input) => this.notifyRevisionWithScope(input, this.resolveScope(defaults)),
            ensureDocument: (input) => this.ensureDocumentWithScope(input, this.resolveScope(defaults)),
            getDocument: (input) => this.getDocumentWithScope(input, this.resolveScope(defaults)),
            getDocumentState: (input) => this.getDocumentStateWithScope(input, this.resolveScope(defaults)),
            migrateDocument: (input) => this.migrateDocumentWithScope(input, this.resolveScope(defaults)),
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
            restoreDocument: (input) => this.setDocumentStatus(input, 'active', this.resolveScope(defaults)),
            deleteDocument: (input) => this.deleteDocumentWithScope(input, this.resolveScope(defaults))
        }
    }

    notifyRevision(input: GetCollaborationDocumentInput) {
        return this.notifyRevisionWithScope(input, this.resolveScope({}))
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
    migrateDocument(input: MigrateCollaborationDocumentInput) {
        return this.api.migrateDocument(input)
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
    restoreDocument(input: GetCollaborationDocumentInput & { expectedSequence?: number }) {
        return this.api.restoreDocument(input)
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

    /** Operation documents have no CRDT bytes. Reconnect always reads the domain head. */
    async getRevisionForSession(session: CollaborationSession) {
        await this.assertSessionReadable(session)
        return this.readOperationRevision({ documentId: session.documentId }, session)
    }

    private async readOperationRevision(input: GetCollaborationDocumentInput, scope: CollaborationScope) {
        const document = await this.requireDocument(input, scope)
        await this.authorize(document, scope, 'read')
        const provider = this.providers.get(document.providerKey, scope.organizationId ?? undefined)
        if (document.engine !== 'operations' || provider.engine !== 'operations')
            throw new BadRequestException(t('server-ai:Error.CollaborationEngineMismatch'))
        const revision = await provider.getRevision(
            providerContext(document.providerKey, document.resourceId, scope, 'read', document.id)
        )
        if (!Number.isSafeInteger(revision) || revision < 0)
            throw new BadRequestException(t('server-ai:Error.CollaborationInvalidRevision'))
        await this.authorize(document, scope, 'read')
        return { documentId: document.id, revision }
    }

    private async notifyRevisionWithScope(input: GetCollaborationDocumentInput, scope: CollaborationScope) {
        const result = await this.readOperationRevision(input, scope)
        await this.publishBroadcast({
            nodeId: this.nodeId,
            type: 'revision',
            documentId: result.documentId,
            payload: result
        })
        return result
    }

    async getStateForSession(session: CollaborationSession, stateVectorBase64?: string | null) {
        await this.assertSessionReadable(session)
        return this.getDocumentStateWithScope({ documentId: session.documentId, stateVectorBase64 }, session)
    }

    /** Recheck live membership before sending any bytes to an already-connected client. */
    async assertSessionReadable(session: CollaborationSession) {
        if (session.expiresAt <= Date.now()) throw new ForbiddenException('Collaboration session expired.')
        const document = await this.requireDocument({ documentId: session.documentId }, session)
        await this.authorize(document, session, 'read')
        if (document.engine !== (session.engine ?? 'yjs'))
            throw new ForbiddenException(t('server-ai:Error.CollaborationEngineMismatch'))
        if (document.schemaVersion !== (session.schemaVersion ?? 1))
            throw new ForbiddenException(t('server-ai:Error.CollaborationSchemaChanged'))
    }

    async applyUpdateForSession(session: CollaborationSession, input: ApplyCollaborationUpdateInput) {
        await this.assertSessionReadable(session)
        if (session.access !== 'write') throw new ForbiddenException('Collaboration session is read-only.')
        return this.applyUpdateWithScope(
            {
                ...input,
                documentId: session.documentId,
                expectedSchemaVersion: session.schemaVersion ?? 1,
                actor: actorToRuntime(session.actor)
            },
            session,
            session.actor
        )
    }

    async listPresenceForSession(session: CollaborationSession) {
        await this.assertSessionReadable(session)
        return this.listPresenceWithScope(session.documentId, session)
    }

    async upsertPresenceForSession(session: CollaborationSession, clientId: string, patch: CollaborationPresencePatch) {
        await this.assertSessionReadable(session)
        return this.persistPresence(session.documentId, clientId, session.actor, patch, session)
    }

    async removePresenceForSession(session: CollaborationSession, clientId: string) {
        return this.removePresence(session.documentId, clientId, session)
    }

    /** Retry projection of the latest authoritative state; stale intermediate jobs are harmless. */
    async retryMaterialization(documentId: string) {
        const document = await this.documentRepository.findOne({ where: { id: documentId } })
        if (
            !document ||
            document.status !== 'active' ||
            (document.materializationStatus === 'ready' && document.materializedSequence >= document.sequenceNumber)
        )
            return
        // A worker must reject failed work so the queue uses its bounded backoff.
        // Enqueuing the same active job and resolving it would silently lose the retry.
        // Background scans have no HTTP context. Resolve tenant-global providers
        // using the persisted document scope, never an unrelated caller's scope.
        const ready = await runWithCapturedRequestContext(
            {
                user: null,
                headers: {
                    'tenant-id': document.tenantId,
                    ...(document.organizationId ? { 'organization-id': document.organizationId } : {})
                }
            },
            () => this.materialize(document, null, 'platform:materialization-retry', false)
        )
        if (!ready) throw new Error(document.lastMaterializationError ?? t('server-ai:Error.ContentProjectionFailed'))
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
        const initialized =
            provider.engine === 'operations'
                ? {
                      stateBase64: '',
                      schemaVersion: provider.schemaVersion,
                      initialSequence: await provider.getRevision(context),
                      metadata: null
                  }
                : await provider.initializeDocument(context)
        let encoded = { stateBase64: '', stateVectorBase64: '' }
        if (provider.engine !== 'operations') {
            const state = parseBase64(initialized.stateBase64, 'initial collaboration state', MAX_DOCUMENT_BYTES)
            const ydoc = new Y.Doc()
            try {
                if (state.byteLength) Y.applyUpdate(ydoc, state)
                encoded = encodeDocument(ydoc)
            } finally {
                ydoc.destroy()
            }
        }
        if (
            provider.engine === 'operations' &&
            (!Number.isSafeInteger(initialized.initialSequence) || initialized.initialSequence! < 0)
        )
            throw new BadRequestException(t('server-ai:Error.CollaborationInvalidRevision'))
        const sequenceNumber = positiveInteger(initialized.initialSequence, 0)
        const document = await this.documentRepository.save(
            this.documentRepository.create({
                ...scopeColumns(scope),
                scopeKey,
                providerKey,
                resourceId,
                engine: provider.engine ?? 'yjs',
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

    /** Preserve document identity while replacing the CRDT schema under the same lock as edits. */
    private async migrateDocumentWithScope(input: MigrateCollaborationDocumentInput, scope: CollaborationScope) {
        if (
            !Number.isInteger(input.expectedSequence) ||
            input.expectedSequence < 0 ||
            !Number.isInteger(input.expectedSchemaVersion) ||
            !Number.isInteger(input.targetSchemaVersion) ||
            input.expectedSchemaVersion < 1 ||
            input.targetSchemaVersion <= input.expectedSchemaVersion
        )
            throw new BadRequestException(t('server-ai:Error.CollaborationMigrationInvalid'))
        const migrated = await this.documentRepository.manager.transaction(async (manager) => {
            const documents = manager.getRepository(CollaborationDocument)
            const document = await documents.findOne({
                where: scopedDocumentIdWhere(input.documentId, scope),
                lock: { mode: 'pessimistic_write' }
            })
            if (!document || document.status !== 'active')
                throw new NotFoundException('Collaboration document was not found.')
            await this.authorize(document, scope, 'manage')
            if (
                document.sequenceNumber !== input.expectedSequence ||
                document.schemaVersion !== input.expectedSchemaVersion
            )
                throw new BadRequestException(t('server-ai:Error.CollaborationSchemaChanged'))
            const provider = this.providers.get(document.providerKey, scope.organizationId ?? undefined)
            if (document.engine !== 'yjs' || provider.engine === 'operations' || !provider.migrateDocument)
                throw new BadRequestException(t('server-ai:Error.CollaborationMigrationInvalid'))
            const context = providerContext(document.providerKey, document.resourceId, scope, 'manage', document.id)
            const next = await provider.migrateDocument({
                ...context,
                stateBase64: document.stateBase64,
                schemaVersion: document.schemaVersion,
                targetSchemaVersion: input.targetSchemaVersion
            })
            if (next.schemaVersion !== input.targetSchemaVersion)
                throw new BadRequestException(t('server-ai:Error.CollaborationMigrationInvalid'))
            parseBase64(next.stateBase64, 'migrated state', MAX_DOCUMENT_BYTES)
            const doc = decodeDocument(next.stateBase64)
            const encoded = encodeDocument(doc)
            doc.destroy()
            await provider.validateDocument?.({
                ...context,
                stateBase64: encoded.stateBase64,
                schemaVersion: input.targetSchemaVersion
            })
            await this.authorize(document, scope, 'manage')
            document.schemaVersion = next.schemaVersion
            document.sequenceNumber += 1
            document.updateCount += 1
            document.stateBase64 = encoded.stateBase64
            document.stateVectorBase64 = encoded.stateVectorBase64
            document.materializationStatus = 'pending'
            const updates = manager.getRepository(CollaborationUpdate)
            // A schema upgrade is a distinct event even when its content bytes match an
            // ordinary update or an earlier migration. Keep ordinary byte deduplication intact.
            const updateHash = createHash('sha256')
                .update(`platform:schema-migration:${input.targetSchemaVersion}:`)
                .update(Buffer.from(encoded.stateBase64, 'base64'))
                .digest('hex')
            await updates.save(
                updates.create({
                    ...scopeColumns(scope),
                    documentId: document.id,
                    sequenceNumber: document.sequenceNumber,
                    updateBase64: encoded.stateBase64,
                    updateHash,
                    origin: `platform:schema-migration:${input.expectedSchemaVersion}:${input.targetSchemaVersion}`,
                    actorType: 'user',
                    userId: scope.userId ?? null,
                    createdById: scope.userId ?? undefined
                })
            )
            return documents.save(document)
        })
        await this.publishBroadcast({
            nodeId: this.nodeId,
            type: 'update',
            documentId: migrated.id,
            payload: {
                documentId: migrated.id,
                sequenceNumber: migrated.sequenceNumber,
                updateBase64: migrated.stateBase64,
                origin: 'platform:schema-migration'
            }
        })
        await this.materialize(migrated, null, 'platform:schema-migration')
        return toRecord(migrated)
    }

    /** Return metadata and asynchronously repair a lagging plugin projection. */
    private async getDocumentWithScope(input: GetCollaborationDocumentInput, scope: CollaborationScope) {
        const document = await this.requireDocument(input, scope)
        await this.authorize(document, scope, 'read')
        if (document.engine === 'yjs' && document.materializedSequence < document.sequenceNumber)
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
        if (document.engine !== 'yjs') throw new BadRequestException(t('server-ai:Error.CollaborationEngineMismatch'))
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
            if (input.expectedSchemaVersion != null && document.schemaVersion !== input.expectedSchemaVersion)
                throw new BadRequestException(t('server-ai:Error.CollaborationSchemaChanged'))
            const updateHash = createHash('sha256').update(update).digest('hex')
            const duplicate = await updates.findOne({ where: { documentId: document.id, updateHash } })
            if (duplicate) return { document, duplicate, saved: duplicate }
            if (
                input.expectedSequence !== undefined &&
                input.expectedSequence !== null &&
                document.sequenceNumber !== input.expectedSequence
            ) {
                throw new BadRequestException(
                    `Collaboration sequence conflict. Current sequence is ${document.sequenceNumber}.`
                )
            }
            const provider = this.providers.get(document.providerKey, scope.organizationId ?? undefined)
            if (document.engine !== 'yjs' || provider.engine === 'operations')
                throw new BadRequestException(t('server-ai:Error.CollaborationEngineMismatch'))
            const doc = decodeDocument(document.stateBase64)
            Y.applyUpdate(doc, update, input.origin ?? 'platform.collaboration')
            const encoded = encodeDocument(doc)
            doc.destroy()
            if (Buffer.byteLength(encoded.stateBase64, 'base64') > MAX_DOCUMENT_BYTES)
                throw new BadRequestException('Collaboration document exceeds the platform size limit.')
            await provider.validateDocument?.({
                ...providerContext(document.providerKey, document.resourceId, scope, 'write', document.id, actor),
                stateBase64: encoded.stateBase64,
                schemaVersion: document.schemaVersion
            })
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
            schemaVersion: document.schemaVersion,
            engine: document.engine,
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
            engine: document.engine,
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
        input: GetCollaborationDocumentInput & { expectedSequence?: number },
        status: 'active' | 'archived',
        scope: CollaborationScope
    ) {
        const document = await this.requireDocument(input, scope)
        await this.authorize(document, scope, 'manage')
        // Serialize retirement with writes. Saving a previously read entity could otherwise
        // overwrite the last accepted state while an editor is being migrated.
        const saved = await this.documentRepository.manager.transaction(async (manager) => {
            const repository = manager.getRepository(CollaborationDocument)
            const current = await repository.findOneOrFail({
                where: { id: document.id },
                lock: { mode: 'pessimistic_write' }
            })
            await this.authorize(current, scope, 'manage')
            if (input.expectedSequence !== undefined && current.sequenceNumber !== input.expectedSequence)
                throw new BadRequestException('Collaboration sequence conflict.')
            // Restoring is a new revision boundary even though the Yjs bytes are unchanged.
            // Otherwise a pre-archive CAS could succeed after archive + restore (ABA).
            // Repeated restore requests remain idempotent and do not advance again.
            if (status === 'active' && current.status === 'archived') {
                current.sequenceNumber += 1
                current.materializationStatus = 'pending'
            }
            current.status = status
            return repository.save(current)
        })
        if (status === 'active' && saved.materializationStatus === 'pending')
            await this.materialize(saved, null, 'platform:restored')
        return toRecord(saved)
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
    private async materialize(
        document: CollaborationDocument,
        updateBase64: string | null,
        origin: string | null,
        enqueueRetry = true
    ) {
        try {
            const provider = this.providers.get(document.providerKey, document.organizationId ?? undefined)
            if (provider.engine === 'operations') return true
            const scope = documentScope(document)
            const acceptedUpdate = await this.updateRepository.findOne({
                where: { documentId: document.id, sequenceNumber: document.sequenceNumber }
            })
            await provider.materializeDocument({
                ...providerContext(document.providerKey, document.resourceId, scope, 'materialize', document.id),
                userId: acceptedUpdate?.userId ?? scope.userId,
                documentId: document.id,
                stateBase64: document.stateBase64,
                stateVectorBase64: document.stateVectorBase64,
                sequenceNumber: document.sequenceNumber,
                updateBase64,
                origin
            })
            await this.documentRepository.update(
                { id: document.id, sequenceNumber: document.sequenceNumber },
                {
                    materializedSequence: document.sequenceNumber,
                    materializationStatus: 'ready',
                    lastMaterializationError: null
                }
            )
            document.materializedSequence = document.sequenceNumber
            document.materializationStatus = 'ready'
            document.lastMaterializationError = null
            return true
        } catch (error) {
            const message = errorMessage(error).slice(0, 2_000)
            document.materializationStatus = 'failed'
            document.lastMaterializationError = message
            await this.documentRepository.update(
                { id: document.id, sequenceNumber: document.sequenceNumber },
                {
                    materializationStatus: 'failed',
                    lastMaterializationError: message
                }
            )
            this.logger.warn(`Collaboration materialization failed for ${document.id}: ${message}`)
            if (enqueueRetry)
                await this.enqueueMaterialization(document).catch((queueError) =>
                    this.logger.warn(`Failed to enqueue collaboration materialization: ${errorMessage(queueError)}`)
                )
            return false
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
