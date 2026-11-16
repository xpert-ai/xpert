import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
    Injectable
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    ContentResourceProviderRegistry,
    RequestContext,
    type ContentCatalogApi,
    type ContentPrincipal,
    type ContentDocumentScope,
    type ContentResourceReference,
    type ContentSourceInput,
    type IContentResourceProvider
} from '@xpert-ai/plugin-sdk'
import type { ContentCatalogItem, ContentResourceSnapshot, ContentTransferSnapshot } from '@xpert-ai/contracts'
import { In, Not, Repository } from 'typeorm'
import { catalogCursor, parseCatalogCursor, type CatalogListInput } from './catalog-pagination'
import { contentCoverageSchema } from './catalog-coverage.schema'
import { t } from 'i18next'
import { ContentIdentityService } from '../content-identity.service'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { ContentResourceEntry } from './content-entry.entity'
import { contentSnapshotSchema, contentProjectionSchema } from './catalog.schema'
import { ContentOperations } from './content-operations.service'
import { contentTransferReferenceSchema, parseContentTransfer } from './content-transfer.schema'

/** Invariants: directory IDs grant no rights; discovery and direct links reauthorize the live source.
 * A binding is unique within its Project. Plugin metadata never chooses the authenticated actor. */
@Injectable()
export class ContentCatalogService implements ContentCatalogApi {
    constructor(
        @InjectRepository(ContentResourceEntry) private readonly entries: Repository<ContentResourceEntry>,
        private readonly providers: ContentResourceProviderRegistry,
        private readonly identities: ContentIdentityService,
        private readonly projects: ProjectAccessRuntimeService,
        private readonly operations: ContentOperations
    ) {}

    private readonly refreshes = new Map<string, Promise<void>>()

    private async check(scope: ContentDocumentScope, write = false) {
        const { actor } = scope
        if (
            (RequestContext.currentTenantId() && RequestContext.currentTenantId() !== actor.tenantId) ||
            (RequestContext.getOrganizationId() && RequestContext.getOrganizationId() !== actor.organizationId) ||
            (RequestContext.currentUserId() && RequestContext.currentUserId() !== actor.userId)
        )
            throw this.denied()
        const principal = await this.identities.principal(actor)
        const access = scope.assistantId
            ? await this.projects.assertAssistant({ ...scope, assistantId: scope.assistantId })
            : (await this.projects.listReadable({ actor, projectIds: [scope.projectId] }))[0]
        if (!access) throw this.denied()
        const canWrite = !access.archived && ['owner', 'manager', 'editor'].includes(access.role)
        if (write && !canWrite) throw this.denied()
        return { canWrite, principal }
    }
    private where(scope: ContentDocumentScope) {
        return {
            tenantId: scope.actor.tenantId,
            organizationId: scope.actor.organizationId,
            projectId: scope.projectId
        }
    }
    private provider(key: string, scope: ContentDocumentScope) {
        // Missing plugins are an expected lifecycle state. Do not leak the registry's
        // internal "strategy not found" error as a 500 for stale client actions.
        const provider = this.providers
            .listRegistrations(scope.actor.organizationId)
            .find(({ type }) => type === key)?.strategy
        if (!provider?.catalog) throw new BadRequestException(t('server-ai:Error.ContentEditorUnavailable'))
        return { provider, catalog: provider.catalog }
    }
    async types(scope: ContentDocumentScope) {
        await this.check(scope)
        const types = await Promise.all(
            this.providers.listRegistrations(scope.actor.organizationId).map(async ({ type, strategy }) =>
                (strategy.catalog ? await this.catalogTypes(strategy.catalog, scope) : []).map((item) => ({
                    ...item,
                    providerKey: type
                }))
            )
        )
        return types
            .flat()
            .sort((a, b) => a.typeId.localeCompare(b.typeId) || a.implementationKey.localeCompare(b.implementationKey))
    }
    private async catalogTypes(catalog: NonNullable<IContentResourceProvider['catalog']>, scope: ContentDocumentScope) {
        return [...catalog.types, ...((await catalog.listTypes?.(scope)) ?? [])]
    }
    private async describe(
        scope: ContentDocumentScope,
        source: ContentResourceReference,
        write = false,
        checked?: { canWrite: boolean; principal: ContentPrincipal }
    ) {
        const access = checked ?? (await this.check(scope, write))
        const { provider, catalog } = this.provider(source.providerKey, scope)
        const principal = access.principal
        const permissions = await provider.authorize({
            ...source,
            actor: scope.actor,
            principal,
            operation: write ? 'write' : 'read'
        })
        const input: ContentSourceInput = { ...scope, sourceResourceId: source.resourceId }
        // The runtime schema is the trust boundary; TS with strictNullChecks disabled widens Zod object fields.
        const snapshot = contentSnapshotSchema.parse(await catalog.describe(input)) as ContentResourceSnapshot
        if (snapshot.projectId !== scope.projectId) throw this.denied()
        if (
            !(await this.catalogTypes(catalog, scope)).some(
                (type) =>
                    type.typeId === snapshot.typeId &&
                    type.modelId === snapshot.modelId &&
                    type.schemaVersion === snapshot.schemaVersion
            )
        )
            throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
        const canWrite = access.canWrite && permissions.canWrite
        if (write && !canWrite) throw this.denied()
        return { snapshot: { ...snapshot, allowedActions: canWrite ? snapshot.allowedActions : [] }, canWrite }
    }
    async register(input: ContentDocumentScope & { source: ContentResourceReference }): Promise<ContentCatalogItem> {
        await this.describe(input, input.source)
        const where = { ...this.where(input), ...input.source }
        // A concurrent discovery may win insertion. Ignore only that unique binding conflict.
        // TypeORM merges RETURNING fields into the inserted object. Never reuse that mutated
        // object as a lookup predicate (generated timestamps/IDs break conflict retries).
        await this.entries
            .createQueryBuilder()
            .insert()
            .values({ ...where })
            .orIgnore()
            .execute()
        const item = await this.entries.manager.transaction(async (manager) => {
            const entries = manager.getRepository(ContentResourceEntry)
            // Serialize projections, then describe again under the directory lock. Revisions are
            // provider-defined opaque strings: comparing them numerically or using wall clocks
            // would allow a delayed old response to overwrite a newer title/tombstone.
            const entry = await entries.findOneOrFail({ where, lock: { mode: 'pessimistic_write' } })
            const source = { providerKey: entry.providerKey, resourceId: entry.resourceId }
            const { snapshot, canWrite } = await this.describe(input, source)
            await entries.update(
                { id: entry.id, bindingRevision: entry.bindingRevision },
                {
                    typeId: snapshot.typeId,
                    modelId: snapshot.modelId,
                    schemaVersion: snapshot.schemaVersion,
                    title: snapshot.title,
                    sourceRevision: snapshot.revision,
                    sourceLocation: snapshot.source,
                    containedPaths: snapshot.containedPaths ?? [],
                    sourceUpdatedAt: new Date(snapshot.updatedAt),
                    deleted: snapshot.deleted,
                    // Retain write restrictions even for private sources; get/list still require explicit offlineAccess.
                    offlineSnapshot:
                        snapshot.offlineAccess === 'project' || snapshot.writeOwnership === 'provider' ? snapshot : null
                }
            )
            return {
                ...snapshot,
                contentId: entry.id,
                bindingRevision: entry.bindingRevision,
                resourceRef: source,
                canWrite
            }
        })
        if (item.canWrite && !item.deleted)
            await this.operations.retain({
                kind: 'refresh',
                input: {
                    actor: input.actor,
                    projectId: input.projectId,
                    assistantId: input.assistantId,
                    contentId: item.contentId
                }
            })
        return item
    }
    /** Reauthorize the persisted human and Assistant; never substitute installation ownership. */
    async reconcile(input: ContentDocumentScope & { contentId: string }) {
        const item = await this.get(input)
        await this.check(input, true)
        const { catalog } = this.provider(item.resourceRef.providerKey, input)
        if (!item.deleted) await catalog.reconcile?.({ ...input, sourceResourceId: item.resourceRef.resourceId })
        const current = await this.register({ ...input, source: item.resourceRef })
        for (const { strategy } of this.providers.listRegistrations(input.actor.organizationId))
            await strategy.catalog?.onResourceReconciled?.({ ...input, item: current })
        return current
    }

    async get(input: ContentDocumentScope & { contentId: string }): Promise<ContentCatalogItem> {
        const access = await this.check(input)
        const entry = await this.entries.findOneBy({ ...this.where(input), id: input.contentId })
        if (!entry) throw this.denied()
        return this.readEntry(input, entry, access)
    }
    private async readEntry(
        input: ContentDocumentScope,
        entry: ContentResourceEntry,
        access: { canWrite: boolean; principal: ContentPrincipal }
    ): Promise<ContentCatalogItem> {
        const source = { providerKey: entry.providerKey, resourceId: entry.resourceId }
        const available = this.providers
            .listRegistrations(input.actor.organizationId)
            .some(({ type, strategy }) => type === entry.providerKey && !!strategy.catalog)
        if (!available) {
            const snapshot = entry.offlineSnapshot && contentSnapshotSchema.parse(entry.offlineSnapshot)
            // The native provider explicitly delegated source reading to the Project ACL.
            // Other resources stay fail-closed: installation status cannot reveal cached titles.
            if (!snapshot || snapshot.offlineAccess !== 'project' || snapshot.projectId !== input.projectId)
                throw this.denied()
            return {
                ...snapshot,
                contentId: entry.id,
                bindingRevision: entry.bindingRevision,
                resourceRef: source,
                canWrite: false,
                allowedActions: [],
                availability: 'provider-unavailable'
            } as ContentCatalogItem
        }
        const { snapshot, canWrite } = await this.describe(input, source, false, access)
        return {
            ...snapshot,
            contentId: entry.id,
            bindingRevision: entry.bindingRevision,
            resourceRef: source,
            canWrite
        }
    }
    async projectText(input: Parameters<ContentCatalogApi['projectText']>[0]) {
        const item = await this.get(input)
        if (item.deleted) throw this.denied()
        if (item.revision !== input.expectedRevision)
            throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
        const { catalog } = this.provider(item.resourceRef.providerKey, input)
        if (!catalog.extract) return null
        const parsed = contentProjectionSchema.safeParse(
            await catalog.extract({ ...input, sourceResourceId: item.resourceRef.resourceId })
        )
        if (!parsed.success) throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
        const projection = parsed.data
        const current = await this.get(input)
        if (
            projection.revision !== input.expectedRevision ||
            current.revision !== input.expectedRevision ||
            current.deleted ||
            current.bindingRevision !== item.bindingRevision
        )
            throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
        return projection as import('@xpert-ai/contracts').ContentSearchProjection
    }
    async refresh(input: Parameters<ContentCatalogApi['refresh']>[0] & { typeId?: string }) {
        await this.check(input)
        const key = JSON.stringify([
            input.actor,
            input.projectId,
            input.assistantId,
            input.typeId,
            [...(input.excludedProviderKeys ?? [])].sort()
        ])
        const existing = this.refreshes.get(key)
        if (existing) return existing
        const work = this.refreshProviders(input)
        this.refreshes.set(key, work)
        try {
            await work
        } finally {
            if (this.refreshes.get(key) === work) this.refreshes.delete(key)
        }
    }
    private async refreshProviders(input: Parameters<ContentCatalogApi['refresh']>[0] & { typeId?: string }) {
        // Reconciliation covers creation from tools and independent Views, including missed browser events.
        for (const { type, strategy } of this.providers.listRegistrations(input.actor.organizationId)) {
            // Exclusion applies to discovery as well as returned rows. Consumers that
            // already own a provider's tree must not scan/register that tree again.
            if (
                !strategy.catalog ||
                input.excludedProviderKeys?.includes(type) ||
                (input.typeId &&
                    !(await this.catalogTypes(strategy.catalog, input)).some((item) => item.typeId === input.typeId))
            )
                continue
            let cursor: string | undefined
            const seen = new Set<string>()
            do {
                const page = await strategy.catalog.discover({ ...input, cursor })
                for (const resourceId of page.resourceIds) {
                    try {
                        await this.register({ ...input, source: { providerKey: type, resourceId } })
                    } catch (error) {
                        if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error
                    }
                }
                cursor = page.nextCursor
                if (cursor && (seen.has(cursor) || seen.size >= 1000))
                    throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
                if (cursor) seen.add(cursor)
            } while (cursor)
        }
    }
    async coverage(input: Parameters<ContentCatalogApi['coverage']>[0]) {
        await this.check(input)
        const rows = await this.entries.find({
            where: {
                ...this.where(input),
                ...(input.excludedProviderKeys?.length ? { providerKey: Not(In(input.excludedProviderKeys)) } : {})
            },
            select: { sourceLocation: true, containedPaths: true }
        })
        // Suppression is deliberately independent of native read grants: a private or
        // trashed resource must never reappear as an ordinary file in the library.
        return rows.flatMap((row) => {
            const { source, containedPaths } = contentCoverageSchema.parse({
                source: row.sourceLocation ?? { kind: 'managed' },
                containedPaths: row.containedPaths ?? []
            })
            return [
                ...(containedPaths ?? []).map(({ path, recursive }) => ({ path, recursive })),
                ...(source.kind === 'file'
                    ? [{ path: source.path, recursive: false }]
                    : source.kind === 'bundle'
                      ? [{ path: source.rootPath, recursive: true }]
                      : [])
            ]
        })
    }
    async list(input: CatalogListInput) {
        const access = await this.check(input)
        let after = parseCatalogCursor(input)
        if (input.discovery !== 'indexed') await this.refresh(input)
        if (input.contentIds?.length === 0) return { items: [], hasMore: false }
        const limit = Math.min(100, Math.max(1, input.limit ?? 50))
        let skip = input.cursor ? 0 : Math.max(0, input.offset ?? 0)
        const items: ContentCatalogItem[] = []
        let nextCursor: string | undefined
        for (;;) {
            const query = this.entries
                .createQueryBuilder('entry')
                .where(this.where(input))
                .andWhere('entry.deleted = :deleted', { deleted: !!input.deleted })
                .orderBy('entry.sourceUpdatedAt', 'DESC', 'NULLS LAST')
                .addOrderBy('entry.id', 'ASC')
                .take(limit + 1)
            if (input.excludedProviderKeys?.length)
                query.andWhere('entry.providerKey NOT IN (:...excluded)', { excluded: input.excludedProviderKeys })
            if (input.contentIds) query.andWhere('entry.id IN (:...ids)', { ids: input.contentIds })
            if (input.typeId) query.andWhere('entry.typeId = :type', { type: input.typeId })
            if (input.search)
                query.andWhere('POSITION(LOWER(:search) IN LOWER(entry.title)) > 0', { search: input.search })
            if (after)
                query.andWhere(
                    after.at === null
                        ? '(entry.sourceUpdatedAt IS NULL AND entry.id > :id)'
                        : '(entry.sourceUpdatedAt < :at OR entry.sourceUpdatedAt IS NULL OR (entry.sourceUpdatedAt = :at AND entry.id > :id))',
                    after
                )
            const rows = await query.getMany()
            // Bounded concurrency keeps the candidate page ordered without serial N+1 waits.
            // Only Project identity is reused within this request; every source still authorizes live.
            for (let index = 0; index < rows.length; index += 4) {
                const resolved = await Promise.all(
                    rows.slice(index, index + 4).map(async (row) => {
                        try {
                            return { row, item: await this.readEntry(input, row, access) }
                        } catch (error) {
                            if (!(error instanceof ForbiddenException || error instanceof NotFoundException))
                                throw error
                            return { row, item: null }
                        }
                    })
                )
                for (const { row, item } of resolved) {
                    after = { key: '', at: row.sourceUpdatedAt?.toISOString() ?? null, id: row.id }
                    if (!item || item.deleted !== !!input.deleted || (input.typeId && item.typeId !== input.typeId))
                        continue
                    if (input.search && !item.title.toLocaleLowerCase().includes(input.search.toLocaleLowerCase()))
                        continue
                    if (skip > 0) {
                        skip--
                        continue
                    }
                    if (items.length === limit) return { items, hasMore: true, nextCursor }
                    items.push(item)
                    nextCursor = catalogCursor(input, row)
                }
            }
            if (rows.length < limit + 1) return { items, hasMore: false }
        }
    }
    async create(request: Parameters<ContentCatalogApi['create']>[0]) {
        const transfer =
            request.transferFrom === undefined
                ? undefined
                : contentTransferReferenceSchema.safeParse(request.transferFrom)
        if (transfer && !transfer.success) throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
        // Persist only the create intent. Caller-supplied content and extra fields must not enter retries or providers.
        const input: Parameters<ContentCatalogApi['create']>[0] = {
            actor: {
                tenantId: request.actor.tenantId,
                organizationId: request.actor.organizationId,
                userId: request.actor.userId
            },
            projectId: request.projectId,
            assistantId: request.assistantId,
            providerKey: request.providerKey,
            implementationKey: request.implementationKey,
            requestId: request.requestId,
            title: request.title,
            templateId: request.templateId,
            ...(transfer?.success
                ? {
                      transferFrom: {
                          contentId: transfer.data.contentId,
                          expectedRevision: transfer.data.expectedRevision
                      }
                  }
                : {})
        }
        await this.check(input, true)
        const { catalog } = this.provider(input.providerKey, input)
        const implementation = (await this.catalogTypes(catalog, input)).find(
            (type) => type.implementationKey === input.implementationKey && type.creatable !== false
        )
        if (
            !implementation ||
            (input.templateId && !implementation.templates?.some((template) => template.id === input.templateId))
        )
            throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
        const operation = await this.operations.retain({ kind: 'create', input })
        try {
            let initialContent: ContentTransferSnapshot | undefined
            let sourceBindingRevision: number | undefined
            if (input.transferFrom) {
                const sourceInput = {
                    actor: input.actor,
                    projectId: input.projectId,
                    assistantId: input.assistantId,
                    contentId: input.transferFrom.contentId,
                    expectedRevision: input.transferFrom.expectedRevision
                }
                const item = await this.get(sourceInput)
                if (item.deleted || item.revision !== sourceInput.expectedRevision)
                    throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
                // A catalog binding can move while the provider's opaque revision string stays unchanged.
                sourceBindingRevision = item.bindingRevision
                const origin = this.provider(item.resourceRef.providerKey, input).catalog
                const acceptedSchemas = [...(catalog.acceptedTransferSchemas ?? [])]
                if (!acceptedSchemas.length) throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
                if (origin.transfer) {
                    initialContent = parseContentTransfer(
                        await origin.transfer({
                            ...sourceInput,
                            sourceResourceId: item.resourceRef.resourceId,
                            acceptedSchemas
                        }),
                        input.projectId
                    )
                } else {
                    // Providers without a native exporter contribute only their authorized text projection.
                    if (!acceptedSchemas.includes('xpert.content-transfer@1'))
                        throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
                    const projection = await this.projectText(sourceInput)
                    if (!projection) throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
                    initialContent = parseContentTransfer(
                        {
                            schema: 'xpert.content-transfer@1',
                            source: { ...item.resourceRef, revision: projection.revision, title: item.title },
                            sections: projection.sections
                        },
                        input.projectId
                    )
                }
                if (
                    !catalog.acceptedTransferSchemas?.includes(initialContent.schema) ||
                    initialContent.source.providerKey !== item.resourceRef.providerKey ||
                    initialContent.source.resourceId !== item.resourceRef.resourceId ||
                    initialContent.source.revision !== item.revision
                )
                    throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
                const current = await this.get(sourceInput)
                if (
                    current.deleted ||
                    current.revision !== item.revision ||
                    current.bindingRevision !== item.bindingRevision
                )
                    throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
            }
            // Extraction can outlive an edit grant or plugin instance. Recheck both immediately before writing.
            await this.check(input, true)
            if (this.provider(input.providerKey, input).catalog !== catalog)
                throw new BadRequestException(t('server-ai:Error.ContentEditorUnavailable'))
            const { transferFrom: _transferFrom, ...targetInput } = input
            const source = await catalog.create({ ...targetInput, initialContent })
            // A native write is not a cross-provider transaction; deny delivery if source access changed while it ran.
            if (input.transferFrom) {
                const current = await this.get({ ...input, contentId: input.transferFrom.contentId })
                if (
                    current.deleted ||
                    current.revision !== input.transferFrom.expectedRevision ||
                    current.bindingRevision !== sourceBindingRevision
                )
                    throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
            }
            if (source.providerKey !== input.providerKey) throw this.denied()
            const item = await this.register({ ...input, source })
            await this.operations.finish(operation)
            return item
        } catch (error) {
            await this.operations.finish(operation, error)
            throw error
        }
    }
    async mutate(input: Parameters<ContentCatalogApi['mutate']>[0]) {
        await this.check(input, true)
        const item = await this.get(input)
        if (!item.canWrite || !item.allowedActions.includes(input.change.action)) throw this.denied()
        await this.describe(input, item.resourceRef, true)
        if (item.revision !== input.expectedRevision)
            throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
        const { catalog } = this.provider(item.resourceRef.providerKey, input)
        if (!catalog.mutate) throw this.denied()
        // Create and duplicate share one request namespace. Retrying an identity for a
        // different origin/template must never return or overwrite an unrelated resource.
        const operation =
            input.change.action === 'duplicate'
                ? await this.operations.retain({
                      kind: 'duplicate',
                      input: { ...input, providerKey: item.resourceRef.providerKey, requestId: input.change.requestId }
                  })
                : null
        try {
            const source = await catalog.mutate({ ...input, sourceResourceId: item.resourceRef.resourceId })
            if (source.providerKey !== item.resourceRef.providerKey) throw this.denied()
            const result = await this.register({ ...input, source })
            if (operation) await this.operations.finish(operation)
            return result
        } catch (error) {
            if (operation) await this.operations.finish(operation, error)
            throw error
        }
    }
    private denied() {
        return new ForbiddenException(t('server-ai:Error.ContentAccessDenied'))
    }
}
