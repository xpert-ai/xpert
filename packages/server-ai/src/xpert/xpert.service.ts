import {
    ChecklistItem,
    convertToUrlPath,
    DEFAULT_XPERT_WORKSPACE_DATA_SCOPE,
    ICopilotStore,
    IPagination,
    ITagXpertUsage,
    IUser,
    IXpertPrincipalReference,
    IXpertAgentExecution,
    LongTermMemoryTypeEnum,
    normalizeMiddlewareNodes,
    normalizeXpertAgentConfig,
    TagCategoryEnum,
    OrderTypeEnum,
    TFile,
    TFileDirectory,
    TMemoryQA,
    TMemoryUserProfile,
    TXpertPublishMarketplaceInput,
    TXpertTeamDraft
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import {
    OptionParams,
    PaginationParams,
    RequestContext,
    Tag,
    transformWhere,
    UserGroupService
} from '@xpert-ai/server-core'
import {
    BadRequestException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
    NotFoundException
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { t } from 'i18next'
import { InjectRepository } from '@nestjs/typeorm'
import { WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import { assign, uniq, uniqBy } from 'lodash'
import { DeepPartial, FindOneOptions, FindOptionsWhere, In, IsNull, Like, Not, Repository } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { CopilotStoreBulkPutCommand } from '../copilot-store'
import { CopilotStoreService } from '../copilot-store/copilot-store.service'
import { SandboxService } from '../sandbox/sandbox.service'
import { resolveXpertDataVolumeScope, VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { MyXpertWorkspaceQuery, XpertWorkspaceAccessService, XpertWorkspaceBaseService } from '../xpert-workspace'
import type { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { XpertPublishCommand } from './commands'
import { XpertIdentiDto } from './dto'
import { GetXpertMemoryEmbeddingsQuery } from './queries'
import { EventNameXpertValidate, XpertDraftValidateEvent } from './types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
import { FreeNodeValidator } from './validators'
import { Xpert } from './xpert.entity'
import { assertValidTagAssociations } from '../shared/tag-associations'

const XPERT_MEMORY_WORKSPACE_PATH = '.xpert/memory'

@Injectable()
export class XpertService extends XpertWorkspaceBaseService<Xpert> {
    constructor(
        @InjectRepository(Xpert)
        public readonly repository: Repository<Xpert>,
        workspaceAccessService: XpertWorkspaceAccessService,
        private readonly storeService: CopilotStoreService,
        private readonly userGroupService: UserGroupService,
        protected readonly commandBus: CommandBus,
        protected readonly queryBus: QueryBus,
        private readonly eventEmitter: EventEmitter2,
        private readonly triggerRegistry: WorkflowTriggerRegistry,
        private readonly sandboxService: SandboxService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {
        super(repository, workspaceAccessService)
    }

    /**
     * To solve the problem that Update cannot create OneToOne relation, it is uncertain whether using save to update might pose risks
     */
    // Isolate TypeORM's recursive update type; business callers use the shallow method to keep ts-node inference bounded.
    async update(id: string, entity: QueryDeepPartialEntity<Xpert> & Partial<Xpert>) {
        return this.updateXpert(id, entity)
    }

    async updateXpert(id: string, entity: Partial<Xpert>) {
        const _entity = await super.findOne(id)
        const { workspaceDataScope, ...mutableEntity } = entity
        if (
            workspaceDataScope !== undefined &&
            workspaceDataScope !== (_entity.workspaceDataScope ?? DEFAULT_XPERT_WORKSPACE_DATA_SCOPE)
        ) {
            throw new BadRequestException(
                t('server-ai:Error.XpertWorkspaceDataScopeImmutable', {
                    defaultValue: 'Workspace data isolation cannot be changed after the Xpert is created.'
                })
            )
        }
        assign(_entity, mutableEntity)
        await this.validateTagAssociations(_entity)
        return await super.save(_entity)
    }

    async findByPrincipalUserId(userId: string): Promise<IXpertPrincipalReference | null> {
        const xpert = await this.repository.findOne({
            where: {
                tenantId: RequestContext.currentTenantId(),
                userId
            },
            relations: {
                organization: true,
                tenant: true,
                workspace: true
            },
            order: {
                latest: 'DESC',
                createdAt: 'DESC'
            }
        })

        if (!xpert) {
            return null
        }

        return {
            id: xpert.id,
            name: xpert.name,
            title: xpert.title,
            organizationName: xpert.organization?.name,
            tenantName: xpert.tenant?.name,
            workspaceName: xpert.workspace?.name
        }
    }

    async getTagUsage(tagId: string, skip = 0): Promise<IPagination<ITagXpertUsage>> {
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !userId) throw new ForbiddenException()
        if (!Number.isSafeInteger(skip) || skip < 0) {
            throw new BadRequestException(
                t('server-ai:Error.InvalidTagUsagePage', {
                    defaultValue: 'Invalid tag usage page.'
                })
            )
        }
        const sharedTagScope = { id: tagId, tenantId, organizationId: IsNull() }
        const tag = await this.repository.manager.getRepository(Tag).findOne({
            where: organizationId ? [sharedTagScope, { ...sharedTagScope, organizationId }] : sharedTagScope,
            select: ['id']
        })
        if (!tag) throw new NotFoundException()

        // Catalog access alone does not authorize disclosure of private expert names.
        const workspaces = await this.workspaceAccessService.findAccessibleWorkspaces(undefined, {
            includeOrganizationWorkspacesInTenantScope: !organizationId
        })
        const workspaceIds = workspaces
            .filter(
                (workspace) =>
                    workspace.tenantId === tenantId && (!organizationId || workspace.organizationId === organizationId)
            )
            .map((workspace) => workspace.id)
        const scope: FindOptionsWhere<Xpert> = {
            tenantId,
            ...(organizationId ? { organizationId } : {}),
            tags: { id: tagId }
        }
        const where: FindOptionsWhere<Xpert>[] = [{ ...scope, workspaceId: IsNull(), createdById: userId }]
        if (workspaceIds.length) where.push({ ...scope, workspaceId: In(workspaceIds) })
        const [experts, total] = await this.repository.findAndCount({
            where,
            select: ['id', 'name', 'title', 'version', 'latest', 'deletedAt', 'createdAt'],
            withDeleted: true,
            order: { name: 'ASC', latest: 'DESC', createdAt: 'DESC', id: 'ASC' },
            take: 20,
            skip
        })
        return {
            items: experts.map((expert) => ({
                id: expert.id,
                name: expert.title?.trim() || expert.name || '',
                version: expert.version || null,
                latest: expert.latest !== false,
                deleted: !!expert.deletedAt
            })),
            total
        }
    }

    async create(entity: DeepPartial<Xpert>, ...options: unknown[]) {
        await this.validateTagAssociations(entity)
        return await super.create(
            {
                ...entity,
                workspaceDataScope: entity.workspaceDataScope ?? DEFAULT_XPERT_WORKSPACE_DATA_SCOPE,
                agentConfig: normalizeXpertAgentConfig(entity.agentConfig)
            },
            ...options
        )
    }

    /**
     * Verify the uniqueness of the slug generated by Name in the system to ensure that it is unique across the entire database
     *
     * @param name
     * @returns
     */
    async validateName(name: string) {
        const slug = convertToUrlPath(name)
        if (slug.length < 5) {
            return false
        }
        const count = await this.repository.count({
            where: {
                slug,
                latest: true
            }
        })

        return !count
    }

    async getAllByWorkspace(workspaceId: string, data: PaginationParams<Xpert>, published: boolean, user: IUser) {
        const { select, relations, order, take } = data ?? {}
        let { where } = data ?? {}
        where = transformWhere(where ?? {})
        if (workspaceId === 'null' || workspaceId === 'undefined' || !workspaceId) {
            where = {
                ...(<FindOptionsWhere<Xpert>>where),
                workspaceId: IsNull(),
                createdById: user.id
            }
        } else {
            await this.assertWorkspaceAuthoringAccess(workspaceId)
            where = {
                ...(<FindOptionsWhere<Xpert>>where),
                workspaceId: workspaceId
            }
        }
        if (published) {
            where.version = Not(IsNull())
        }

        return this.findAll({
            select,
            where,
            relations,
            order,
            take
        })
    }

    async countMy(where: FindOptionsWhere<Xpert>) {
        const userId = RequestContext.currentUserId()
        const { items: userWorkspaces } = await this.queryBus.execute(new MyXpertWorkspaceQuery(userId, {}))
        const accountWorkspaces = this.filterOrganizationAccountWorkspaces(userWorkspaces)
        const accountWhere = this.withOrganizationAccountScope(where ?? {})

        where = {
            ...accountWhere,
            publishAt: Not(IsNull()),
            createdById: userId
        }

        const xpertsCreatedByUser = await this.findAll({
            select: ['id'],
            where
        })

        const xpertsInUserWorkspaces = accountWorkspaces.length
            ? await this.repository.find({
                  where: {
                      ...accountWhere,
                      publishAt: Not(IsNull()),
                      workspaceId: In(accountWorkspaces.map((workspace) => workspace.id))
                  },
                  select: ['id']
              })
            : []

        const allXperts = uniqBy([...xpertsCreatedByUser.items, ...xpertsInUserWorkspaces], 'id')

        return allXperts.length
    }

    async getMyAll(
        params: PaginationParams<Xpert>,
        options?: {
            includeOrganizationWorkspacesInTenantScope?: boolean
        }
    ) {
        const userId = RequestContext.currentUserId()
        const { items: userWorkspaces } = await this.queryBus.execute(
            new MyXpertWorkspaceQuery(
                userId,
                {},
                {
                    includeOrganizationWorkspacesInTenantScope: options?.includeOrganizationWorkspacesInTenantScope
                }
            )
        )
        const accountWorkspaces = this.filterOrganizationAccountWorkspaces(userWorkspaces)
        const workspaceAccesses = await Promise.all(
            accountWorkspaces.map((workspace) => this.workspaceAccessService.buildAccess(workspace))
        )
        const workspaceById = new Map(workspaceAccesses.map((access) => [access.workspace.id, access.workspace]))

        const { relations, order, take } = params ?? {}
        const accountWhere = this.withOrganizationAccountScope(transformWhere<Xpert>(params?.where ?? {}) ?? {})

        const where = {
            ...accountWhere,
            publishAt: Not(IsNull()),
            createdById: userId
        }

        const xpertsCreatedByUser = await this.findAll({
            where,
            relations,
            order,
            take
        })

        const xpertsInUserWorkspaces = accountWorkspaces.length
            ? await this.repository.find({
                  where: {
                      ...accountWhere,
                      publishAt: Not(IsNull()),
                      workspaceId: In(accountWorkspaces.map((workspace) => workspace.id))
                  },
                  relations,
                  order,
                  take
              })
            : []

        const allXperts = uniqBy([...xpertsCreatedByUser.items, ...xpertsInUserWorkspaces], 'id')
        allXperts.forEach((xpert) => {
            const workspace = xpert.workspaceId ? workspaceById.get(xpert.workspaceId) : null
            if (workspace) {
                xpert.workspace = workspace
            }
        })

        return {
            items: allXperts.map((item) => new XpertIdentiDto(item)),
            total: allXperts.length
        }
    }

    private filterOrganizationAccountWorkspaces(workspaces: XpertWorkspace[]) {
        const organizationId = RequestContext.getOrganizationId()
        if (!organizationId) {
            return workspaces
        }

        return workspaces.filter((workspace) => workspace.organizationId === organizationId)
    }

    private withOrganizationAccountScope(where: FindOptionsWhere<Xpert>) {
        const organizationId = RequestContext.getOrganizationId()
        if (!organizationId) {
            return where
        }

        return {
            ...where,
            organizationId
        }
    }

    /**
     * Resolves an assistant by id or by slug.
     *
     * The workspace routes address assistants by slug while their param is named
     * `id`, so both forms reach server code that expects a primary key. Using a
     * slug as an id makes Postgres fail with `invalid input syntax for type uuid`.
     */
    async findOneByIdOrSlug(identifier: string, options?: FindOneOptions<Xpert>) {
        const normalized = identifier?.trim()
        if (!normalized) {
            throw new NotFoundException(`Not found xpert '${identifier}'`)
        }

        return await this.findOne({
            where: UUID_PATTERN.test(normalized) ? { id: normalized } : { slug: normalized },
            ...(options ?? {})
        })
    }

    /**
     * Loads the published team for an assistant, addressed by id or slug.
     */
    async getTeam(identifier: string, options?: OptionParams<Xpert>) {
        const { relations } = options ?? {}
        const team = await this.findOneByIdOrSlug(identifier, {
            relations: uniq([...(relations ?? []), 'agents', 'toolsets', 'knowledgebases'])
        })
        return team
    }

    async findOneByIdWithinTenant(
        id: string,
        options?: Partial<Pick<OptionParams<Xpert>, 'relations' | 'select' | 'withDeleted'>>
    ) {
        const tenantId = RequestContext.currentTenantId()

        const entity = await this.repository.findOne({
            ...(options ?? {}),
            where: {
                id,
                tenantId
            }
        })

        if (!entity) {
            throw new NotFoundException(`Not found xpert '${id}' in current tenant`)
        }

        return entity
    }

    async assertCanAuthorById(id: string, resolvedWorkspaceId?: string | null): Promise<void> {
        const xpert = await this.findOneByIdWithinTenant(id, {
            select: ['id', 'organizationId', 'workspaceId', 'createdById']
        })

        const persistedWorkspaceId = xpert.workspaceId?.trim()
        if (persistedWorkspaceId) {
            await this.workspaceAccessService.assertCanAuthor(persistedWorkspaceId)
        } else {
            const isCreator = xpert.createdById === RequestContext.currentUserId()
            const isCurrentOrganization =
                (xpert.organizationId ?? null) === (RequestContext.getOrganizationId() ?? null)
            if (!isCreator || !isCurrentOrganization) {
                throw new ForbiddenException('Access denied to xpert')
            }
        }

        const targetWorkspaceId = resolvedWorkspaceId?.trim()
        if (targetWorkspaceId && targetWorkspaceId !== persistedWorkspaceId) {
            await this.workspaceAccessService.assertCanAuthor(targetWorkspaceId)
        }
    }

    async save(entity: Xpert) {
        await this.validateTagAssociations(entity)
        return await super.save({
            ...entity,
            agentConfig: normalizeXpertAgentConfig(entity.agentConfig)
        })
    }

    async validateTagAssociations(entity: DeepPartial<Xpert>) {
        await assertValidTagAssociations(this.repository, this.workspaceAccessService, entity, TagCategoryEnum.XPERT)
    }

    /** Version backups inherit the source's persisted links, including stopped tags. */
    async createVersionBackup(entity: DeepPartial<Xpert>, sourceId: string) {
        await assertValidTagAssociations(
            this.repository,
            this.workspaceAccessService,
            entity,
            TagCategoryEnum.XPERT,
            sourceId
        )
        return super.create({
            ...entity,
            workspaceDataScope: entity.workspaceDataScope ?? DEFAULT_XPERT_WORKSPACE_DATA_SCOPE,
            agentConfig: normalizeXpertAgentConfig(entity.agentConfig)
        })
    }

    async saveDraft(id: string, draft: TXpertTeamDraft) {
        const xpert = await this.findOne(id)
        const templateSource = draft.team?.options?.templateSource
        if (templateSource) {
            xpert.options = {
                ...(xpert.options ?? {}),
                templateSource
            }
        }
        xpert.draft = {
            ...draft,
            nodes: normalizeMiddlewareNodes(draft.nodes),
            team: {
                ...draft.team,
                workspaceDataScope: xpert.workspaceDataScope ?? DEFAULT_XPERT_WORKSPACE_DATA_SCOPE,
                updatedAt: new Date(),
                updatedById: RequestContext.currentUserId()
            }
        } as TXpertTeamDraft

        xpert.draft.checklist = await this.validate(xpert.draft, {
            tenantId: xpert.tenantId,
            organizationId: xpert.organizationId,
            xpertId: xpert.id,
            creatorId: xpert.createdById
        })

        await super.save(xpert)
        return xpert.draft
    }

    async updateDraft(id: string, draft: Partial<TXpertTeamDraft>) {
        const xpert = await this.findOne(id)
        const currentDraft: Partial<TXpertTeamDraft> = xpert.draft ?? {}
        const nextDraft: Partial<TXpertTeamDraft> = {
            ...currentDraft,
            ...draft,
            team: {
                ...(currentDraft.team ?? {}),
                ...(draft.team ?? {}),
                workspaceDataScope: xpert.workspaceDataScope ?? DEFAULT_XPERT_WORKSPACE_DATA_SCOPE,
                updatedAt: new Date(),
                updatedById: RequestContext.currentUserId()
            }
        }

        if (Object.prototype.hasOwnProperty.call(draft, 'nodes')) {
            nextDraft.nodes = normalizeMiddlewareNodes(draft.nodes)
        }
        if (Object.prototype.hasOwnProperty.call(draft, 'connections')) {
            nextDraft.connections = draft.connections
        }

        const draftForValidation = {
            ...nextDraft,
            nodes: nextDraft.nodes ?? xpert.graph?.nodes ?? [],
            connections: nextDraft.connections ?? xpert.graph?.connections ?? []
        } as TXpertTeamDraft
        nextDraft.checklist = await this.validate(draftForValidation, {
            tenantId: xpert.tenantId,
            organizationId: xpert.organizationId,
            xpertId: xpert.id,
            creatorId: xpert.createdById
        })

        xpert.draft = nextDraft as TXpertTeamDraft

        await this.repository.save(xpert)
        return xpert.draft
    }

    async validate(draft: TXpertTeamDraft, context?: XpertDraftValidateEvent['context']) {
        const freeNodeValidator = new FreeNodeValidator()

        const results: ChecklistItem[] = []

        const res = await freeNodeValidator.validate(draft)
        results.push(...res)

        // More validators events
        const validators = await this.eventEmitter.emitAsync(
            EventNameXpertValidate,
            new XpertDraftValidateEvent(draft, context)
        )
        validators.forEach((items) => {
            if (items) {
                results.push(...items)
            }
        })
        return results
    }

    async publish(
        id: string,
        newVersion: boolean,
        environmentId: string | null | undefined,
        notes: string,
        marketplace?: TXpertPublishMarketplaceInput,
        businessAreaId?: string | null
    ) {
        return await this.commandBus.execute(
            new XpertPublishCommand(id, newVersion, environmentId, notes, marketplace, businessAreaId)
        )
    }

    async allVersions(identifier: string) {
        // Addressable by id or slug, like the rest of the assistant routes.
        const xpert = await this.findOneByIdOrSlug(identifier)
        const { items: allVersions } = await this.findAll({
            where: {
                workspaceId: xpert.workspaceId ?? IsNull(),
                type: xpert.type,
                slug: xpert.slug
            }
        })

        return allVersions.map((item) => ({
            id: item.id,
            version: item.version,
            latest: item.latest,
            publishAt: item.publishAt,
            releaseNotes: item.releaseNotes
        }))
    }

    async setAsLatest(id: string) {
        const xpert = await this.findOne(id)
        if (!xpert.latest) {
            const { items: xperts } = await this.findAll({
                where: {
                    workspaceId: xpert.workspaceId ?? IsNull(),
                    type: xpert.type,
                    slug: xpert.slug,
                    latest: true
                }
            })

            xperts.forEach((item) => (item.latest = false))
            xpert.latest = true
            await this.repository.save([...xperts, xpert])
        }
    }

    async deleteXpert(id: string) {
        const xpert = await this.findOne(id)

        if (xpert.latest) {
            // Delete all versions if it is latest version
            return await this.softDelete({ name: xpert.name, deletedAt: IsNull() })
        } else {
            // Delete current version team
            return await this.softDelete(xpert.id)
        }
    }

    async getUserGroups(id: string, organizationId?: string) {
        const resolvedOrganizationId = await this.userGroupService.resolveAccessibleOrganizationId(organizationId)
        const xpert = await this.findOne(id, {
            relations: ['userGroups']
        })

        return (xpert.userGroups ?? []).filter((group) => group.organizationId === resolvedOrganizationId)
    }

    async getUserGroupAuthorizations(groupId?: string, organizationId?: string) {
        const resolvedOrganizationId = await this.userGroupService.resolveAccessibleOrganizationId(organizationId)
        if (groupId) {
            await this.findAuthorizationGroup(groupId, resolvedOrganizationId)
        }

        const xperts = await this.findPublishedOrganizationXpertsForAuthorization(resolvedOrganizationId)
        return this.buildUserGroupAuthorizationResult(xperts, groupId)
    }

    async updateUserGroupAuthorizations(groupId: string, xpertIds: string[], organizationId?: string) {
        const resolvedOrganizationId = await this.userGroupService.resolveAccessibleOrganizationId(organizationId)
        const group = await this.findAuthorizationGroup(groupId, resolvedOrganizationId)
        const xperts = await this.findPublishedOrganizationXpertsForAuthorization(resolvedOrganizationId)
        const selectedIds = new Set((xpertIds ?? []).filter(Boolean))
        const availableIds = new Set(xperts.map((xpert) => xpert.id))

        if ([...selectedIds].some((id) => !availableIds.has(id))) {
            throw new NotFoundException(
                'Some XPERTs were not found among published assistants in the current organization.'
            )
        }

        const changedXperts = xperts.filter((xpert) => {
            const isSelected = selectedIds.has(xpert.id)
            const isCurrentlySelected = xpert.userGroups?.some((userGroup) => userGroup.id === groupId) ?? false
            if (isSelected === isCurrentlySelected) {
                return false
            }

            xpert.userGroups = isSelected
                ? [...(xpert.userGroups ?? []), group]
                : (xpert.userGroups ?? []).filter((userGroup) => userGroup.id !== groupId)
            return true
        })

        if (changedXperts.length) {
            await this.repository.save(changedXperts)
        }

        return this.buildUserGroupAuthorizationResult(xperts, groupId)
    }

    async updateUserGroups(id: string, ids: string[], organizationId?: string) {
        const resolvedOrganizationId = await this.userGroupService.resolveAccessibleOrganizationId(organizationId)
        const xpert = await this.findOne(id, {
            relations: ['userGroups']
        })

        const uniqueIds = [...new Set((ids ?? []).filter(Boolean))]
        const groups =
            uniqueIds.length > 0
                ? await this.userGroupService.findByIdsInOrganization(resolvedOrganizationId, uniqueIds)
                : []

        if (groups.length !== uniqueIds.length) {
            throw new NotFoundException('Some user groups were not found in the current organization.')
        }

        const preservedGroups = (xpert.userGroups ?? []).filter(
            (group) => group.organizationId !== resolvedOrganizationId
        )
        xpert.userGroups = [...preservedGroups, ...groups]
        await this.repository.save(xpert)
        return this.getUserGroups(id, resolvedOrganizationId)
    }

    private async findAuthorizationGroup(groupId: string, organizationId: string) {
        const groups = await this.userGroupService.findByIdsInOrganization(organizationId, [groupId])
        if (groups.length !== 1) {
            throw new NotFoundException('The requested user group was not found in the current organization.')
        }

        return groups[0]
    }

    private async findPublishedOrganizationXpertsForAuthorization(organizationId: string) {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new HttpException(
                'Tenant context is required for XPERT user group authorization.',
                HttpStatus.BAD_REQUEST
            )
        }

        return this.repository.find({
            where: {
                tenantId,
                organizationId,
                latest: true,
                publishAt: Not(IsNull())
            },
            relations: ['userGroups'],
            order: {
                updatedAt: 'DESC'
            }
        })
    }

    private buildUserGroupAuthorizationResult(xperts: Xpert[], groupId?: string) {
        return {
            items: xperts,
            selectedXpertIds: groupId
                ? xperts
                      .filter((xpert) => xpert.userGroups?.some((userGroup) => userGroup.id === groupId))
                      .map((xpert) => xpert.id)
                : []
        }
    }

    async findBySlug(slug: string, relations?: string[]) {
        return await this.repository.findOne({
            where: {
                slug,
                latest: true,
                publishAt: Not(IsNull())
            },
            relations: uniq((relations ?? []).concat(['user', 'createdBy', 'organization']))
        })
    }

    async findPublicChatAppXpert(identifier: string, relations?: string[]) {
        const normalized = identifier?.trim()
        if (!normalized) {
            throw new NotFoundException(`Not found public xpert '${identifier}'`)
        }

        const where = UUID_PATTERN.test(normalized)
            ? {
                  id: normalized,
                  publishAt: Not(IsNull())
              }
            : {
                  slug: normalized,
                  latest: true,
                  publishAt: Not(IsNull())
              }

        const xpert = await this.repository.findOne({
            where,
            relations: uniq((relations ?? []).concat(['user', 'createdBy', 'organization', 'workspace']))
        })

        if (!xpert?.app?.enabled || !xpert.app.public) {
            throw new NotFoundException(`Not found public xpert '${identifier}'`)
        }

        return xpert
    }

    async createMemory(xpertId: string, body: { type: LongTermMemoryTypeEnum; value: TMemoryQA | TMemoryUserProfile }) {
        const xpert = await this.findOne(xpertId, { relations: ['agent'] })
        const memory = xpert.memory
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const execution: IXpertAgentExecution = {}
        const embeddings = await this.queryBus.execute(
            new GetXpertMemoryEmbeddingsQuery(tenantId, organizationId, memory, {
                xpertId,
                tokenCallback: (token) => {
                    execution.embedTokens += token ?? 0
                }
            })
        )

        await this.commandBus.execute(
            new CopilotStoreBulkPutCommand(
                body.type,
                [body.value],
                [xpertId, body.type || LongTermMemoryTypeEnum.QA],
                embeddings
            )
        )
    }

    async createBulkMemories(
        xpertId: string,
        body: { type: LongTermMemoryTypeEnum; memories: Array<TMemoryQA | TMemoryUserProfile> }
    ) {
        const xpert = await this.findOne(xpertId, { relations: ['agent'] })
        const memory = xpert.memory
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const execution: IXpertAgentExecution = {}
        const embeddings = await this.queryBus.execute(
            new GetXpertMemoryEmbeddingsQuery(tenantId, organizationId, memory, {
                xpertId,
                tokenCallback: (token) => {
                    execution.embedTokens += token ?? 0
                }
            })
        )
        await this.commandBus.execute(
            new CopilotStoreBulkPutCommand(
                body.type,
                body.memories,
                [xpertId, body.type || LongTermMemoryTypeEnum.QA],
                embeddings
            )
        )
    }

    async findAllMemory(id: string, types: string[]) {
        const where = {} as FindOptionsWhere<ICopilotStore>
        const _types = types
        if (_types?.length > 1) {
            where.prefix = In(_types.map((type) => `${id}${type ? `:${type}` : ''}`))
        } else if (_types?.length === 1) {
            const type = _types[0]
            where.prefix = `${id}${type ? `:${type}` : ''}`
        } else {
            where.prefix = Like(`${id}%`)
        }

        try {
            return await this.storeService.findAll({
                where,
                relations: ['createdBy'],
                order: { createdAt: OrderTypeEnum.DESC }
            })
        } catch (err) {
            throw new HttpException(getErrorMessage(err), HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    async getMemoryFiles(id: string, path?: string, deepth?: number): Promise<TFileDirectory[]> {
        const xpert = await this.findOne(id)
        return this.createWorkspaceVolumeClient(xpert, RequestContext.currentUserId()).list(
            XPERT_MEMORY_WORKSPACE_PATH,
            {
                path,
                deepth
            }
        )
    }

    async getMemoryFile(id: string, filePath: string): Promise<TFile> {
        const xpert = await this.findOne(id)
        return this.createWorkspaceVolumeClient(xpert, RequestContext.currentUserId()).readFile(
            XPERT_MEMORY_WORKSPACE_PATH,
            filePath
        )
    }

    async saveMemoryFile(id: string, filePath: string, content: string): Promise<TFile> {
        const xpert = await this.findOne(id)
        return this.createWorkspaceVolumeClient(xpert, RequestContext.currentUserId()).saveFile(
            XPERT_MEMORY_WORKSPACE_PATH,
            filePath,
            content
        )
    }

    async uploadMemoryFile(
        id: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): Promise<TFile> {
        const xpert = await this.findOne(id)
        return this.createWorkspaceVolumeClient(xpert, RequestContext.currentUserId()).uploadFile(
            XPERT_MEMORY_WORKSPACE_PATH,
            folderPath,
            file
        )
    }

    async deleteMemoryFile(id: string, filePath: string): Promise<void> {
        const xpert = await this.findOne(id)
        await this.createWorkspaceVolumeClient(xpert, RequestContext.currentUserId()).deleteFile(
            XPERT_MEMORY_WORKSPACE_PATH,
            filePath
        )
    }

    async getTriggerProviders() {
        return this.triggerRegistry.list().map((provider) => ({
            ...provider.meta
        }))
    }

    async getSandboxProviders() {
        return this.sandboxService.listProviders()
    }

    private createWorkspaceVolumeClient(xpert: Pick<Xpert, 'tenantId' | 'id' | 'workspaceDataScope'>, userId: string) {
        return new VolumeSubtreeClient(this.createVolumeHandle(xpert, userId), {
            allowRootWorkspace: true
        })
    }

    private createVolumeHandle(xpert: Pick<Xpert, 'tenantId' | 'id' | 'workspaceDataScope'>, userId: string) {
        return this.volumeClient.resolve(
            resolveXpertDataVolumeScope({
                tenantId: xpert.tenantId,
                userId,
                xpertId: xpert.id,
                workspaceDataScope: xpert.workspaceDataScope
            })
        )
    }
}
