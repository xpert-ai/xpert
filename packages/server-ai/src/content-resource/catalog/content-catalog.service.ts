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
    type ContentDocumentScope,
    type ContentResourceReference,
    type ContentSourceInput
} from '@xpert-ai/plugin-sdk'
import type { ContentCatalogItem, ContentResourceSnapshot } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { ContentIdentityService } from '../content-identity.service'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { ContentResourceEntry } from './content-entry.entity'
import { contentSnapshotSchema, contentProjectionSchema } from './catalog.schema'
import { ContentOperations } from './content-operations.service'

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

    private async check(scope: ContentDocumentScope, write = false) {
        const { actor } = scope
        if (
            (RequestContext.currentTenantId() && RequestContext.currentTenantId() !== actor.tenantId) ||
            (RequestContext.getOrganizationId() && RequestContext.getOrganizationId() !== actor.organizationId) ||
            (RequestContext.currentUserId() && RequestContext.currentUserId() !== actor.userId)
        )
            throw this.denied()
        await this.identities.principal(actor)
        const access = scope.assistantId
            ? await this.projects.assertAssistant({ ...scope, assistantId: scope.assistantId })
            : (await this.projects.listReadable({ actor, projectIds: [scope.projectId] }))[0]
        if (!access) throw this.denied()
        const canWrite = !access.archived && ['owner', 'manager', 'editor'].includes(access.role)
        if (write && !canWrite) throw this.denied()
        return { canWrite }
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
        return this.providers
            .listRegistrations(scope.actor.organizationId)
            .flatMap(({ type, strategy }) =>
                (strategy.catalog?.types ?? []).map((item) => ({ ...item, providerKey: type }))
            )
            .sort((a, b) => a.typeId.localeCompare(b.typeId) || a.implementationKey.localeCompare(b.implementationKey))
    }
    private async describe(scope: ContentDocumentScope, source: ContentResourceReference, write = false) {
        const access = await this.check(scope, write)
        const { provider, catalog } = this.provider(source.providerKey, scope)
        const principal = await this.identities.principal(scope.actor)
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
            !catalog.types.some(
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
                    sourceUpdatedAt: new Date(snapshot.updatedAt),
                    deleted: snapshot.deleted,
                    offlineSnapshot: snapshot.offlineAccess === 'project' ? snapshot : null
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
        await this.check(input)
        const entry = await this.entries.findOneBy({ ...this.where(input), id: input.contentId })
        if (!entry) throw this.denied()
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
        const { snapshot, canWrite } = await this.describe(input, source)
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
        const projection = contentProjectionSchema.parse(
            await catalog.extract({ ...input, sourceResourceId: item.resourceRef.resourceId })
        )
        const current = await this.get(input)
        if (
            projection.revision !== input.expectedRevision ||
            current.revision !== input.expectedRevision ||
            current.deleted ||
            current.bindingRevision !== item.bindingRevision
        )
            throw new ConflictException(t('server-ai:Error.ContentVersionConflict'))
        if (
            projection.sections.reduce((sum, section) => sum + section.text.length, 0) > 1_000_000 ||
            new Set(projection.sections.map((section) => JSON.stringify(section.anchor))).size !==
                projection.sections.length
        )
            throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
        return projection as import('@xpert-ai/contracts').ContentSearchProjection
    }
    async list(input: Parameters<ContentCatalogApi['list']>[0]) {
        await this.check(input)
        // Reconciliation covers creation from tools and independent Views, including missed browser events.
        for (const { type, strategy } of this.providers.listRegistrations(input.actor.organizationId)) {
            // Exclusion applies to discovery as well as returned rows. Consumers that
            // already own a provider's tree must not scan/register that tree again.
            if (
                !strategy.catalog ||
                input.excludedProviderKeys?.includes(type) ||
                (input.typeId && !strategy.catalog.types.some((item) => item.typeId === input.typeId))
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
        const available = new Set(
            this.providers
                .listRegistrations(input.actor.organizationId)
                .filter(({ strategy }) => strategy.catalog)
                .map(({ type }) => type)
        )
        const rows = await this.entries.find({ where: this.where(input) })
        const items: ContentCatalogItem[] = []
        const selectedIds = input.contentIds ? new Set(input.contentIds) : undefined
        for (const row of rows) {
            if (input.excludedProviderKeys?.includes(row.providerKey)) continue
            if (selectedIds && !selectedIds.has(row.id)) continue
            // An uninstalled plugin retains its binding and source, but cannot reveal stale cached titles.
            if (!available.has(row.providerKey) && row.offlineSnapshot?.offlineAccess !== 'project') continue
            try {
                const item = await this.get({ ...input, contentId: row.id })
                if (item.deleted !== !!input.deleted || (input.typeId && item.typeId !== input.typeId)) continue
                if (input.search && !item.title.toLocaleLowerCase().includes(input.search.toLocaleLowerCase())) continue
                items.push(item)
            } catch (error) {
                if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error
            }
        }
        items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.contentId.localeCompare(b.contentId))
        const offset = Math.max(0, input.offset ?? 0),
            limit = Math.min(100, Math.max(1, input.limit ?? 50))
        return { items: items.slice(offset, offset + limit), hasMore: items.length > offset + limit }
    }
    async create(input: Parameters<ContentCatalogApi['create']>[0]) {
        await this.check(input, true)
        const { catalog } = this.provider(input.providerKey, input)
        const implementation = catalog.types.find(
            (type) => type.implementationKey === input.implementationKey && type.creatable !== false
        )
        if (
            !implementation ||
            (input.templateId && !implementation.templates?.some((template) => template.id === input.templateId))
        )
            throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
        const operation = await this.operations.retain({ kind: 'create', input })
        try {
            const source = await catalog.create(input)
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
