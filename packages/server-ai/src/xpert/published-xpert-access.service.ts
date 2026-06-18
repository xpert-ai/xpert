import {
    ApiKeyBindingType,
    IApiPrincipal,
    isTenantSharedXpertWorkspace,
    SecretTokenBindingType
} from '@xpert-ai/contracts'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { uniq } from 'lodash'
import {
    Brackets,
    FindOneOptions,
    FindOptionsRelations,
    In,
    IsNull,
    Not,
    Repository,
    SelectQueryBuilder
} from 'typeorm'
import { Xpert } from './xpert.entity'
import { RequestContext } from '@xpert-ai/plugin-sdk'

const TENANT_SHARED_WORKSPACE_FILTER = `COALESCE((workspace.settings)::jsonb -> 'access' ->> 'visibility', 'private') = 'tenant-shared'`

type PublishedXpertQueryOptions = {
    where?: Partial<Pick<Xpert, 'id' | 'slug' | 'workspaceId' | 'type' | 'latest' | 'version'>>
    relations?: string[]
    search?: string
    order?: Record<string, 'ASC' | 'DESC' | 'asc' | 'desc'>
    take?: number
    skip?: number
}

@Injectable()
export class PublishedXpertAccessService {
    constructor(
        @InjectRepository(Xpert)
        private readonly repository: Repository<Xpert>
    ) {}

    private currentTenantId() {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new ForbiddenException('Tenant context is required to access published assistants.')
        }
        return tenantId
    }

    private currentUserId() {
        const userId = RequestContext.currentUserId()
        if (!userId) {
            throw new ForbiddenException('User context is required to access published assistants.')
        }
        return userId
    }

    private currentApiPrincipal() {
        return RequestContext.currentApiPrincipal()
    }

    private currentWorkspaceApiKeyWorkspaceId() {
        const apiKey = this.currentApiPrincipal()?.apiKey
        if (apiKey?.type !== ApiKeyBindingType.WORKSPACE) {
            return null
        }

        const workspaceId = apiKey.entityId?.trim()
        return workspaceId || null
    }

    private currentPublicXpertId() {
        const apiPrincipal = this.currentApiPrincipal() as IApiPrincipal | null
        if (
            apiPrincipal?.principalType !== 'client_secret' ||
            apiPrincipal.clientSecretBindingType !== SecretTokenBindingType.PUBLIC_XPERT
        ) {
            return null
        }

        const apiKey = apiPrincipal.apiKey
        if (apiKey?.type !== ApiKeyBindingType.ASSISTANT || !apiKey.entityId?.trim()) {
            throw new ForbiddenException('Public assistant session is not bound to an assistant.')
        }

        return apiKey.entityId.trim()
    }

    private currentRequestedUserId() {
        const apiPrincipal = this.currentApiPrincipal() as IApiPrincipal | null
        const userId = apiPrincipal?.requestedUserId?.trim()
        return userId || null
    }

    private currentOrganizationId() {
        const apiPrincipal = this.currentApiPrincipal() as IApiPrincipal | null
        const organizationId = apiPrincipal?.requestedOrganizationId ?? RequestContext.getOrganizationId()
        if (!organizationId) {
            throw new ForbiddenException('Organization context is required to access published assistants.')
        }
        return organizationId
    }

    private applyPublishedFilters(qb: SelectQueryBuilder<Xpert>, where: PublishedXpertQueryOptions['where']) {
        if (!where) {
            return qb
        }

        if (where.id) {
            qb.andWhere('xpert.id = :id', { id: where.id })
        }
        if (where.slug) {
            qb.andWhere('xpert.slug = :slug', { slug: where.slug })
        }
        if (where.workspaceId) {
            qb.andWhere('xpert.workspaceId = :workspaceId', { workspaceId: where.workspaceId })
        }
        if (where.type) {
            qb.andWhere('xpert.type = :type', { type: where.type })
        }
        if (where.latest != null) {
            qb.andWhere('xpert.latest = :latest', { latest: where.latest })
        }
        if (where.version != null) {
            qb.andWhere('xpert.version = :version', { version: where.version })
        }

        return qb
    }

    private applySearchFilter(qb: SelectQueryBuilder<Xpert>, search?: string) {
        const term = search?.trim().toLowerCase()
        if (!term) {
            return qb
        }

        qb.andWhere(
            new Brackets((searchQb) => {
                searchQb
                    .where('LOWER(xpert.name) LIKE :search', { search: `%${term}%` })
                    .orWhere('LOWER(xpert.title) LIKE :search', { search: `%${term}%` })
                    .orWhere('LOWER(xpert.titleCN) LIKE :search', { search: `%${term}%` })
                    .orWhere('LOWER(xpert.slug) LIKE :search', { search: `%${term}%` })
                    .orWhere('LOWER(xpert.description) LIKE :search', { search: `%${term}%` })
            })
        )

        return qb
    }

    private buildWorkspaceBoundQuery(workspaceId: string, options?: PublishedXpertQueryOptions) {
        const tenantId = this.currentTenantId()
        const qb = this.repository
            .createQueryBuilder('xpert')
            .where('xpert.tenantId = :tenantId', {
                tenantId
            })
            .andWhere('xpert.publishAt IS NOT NULL')
            .andWhere('xpert.workspaceId = :workspaceId', {
                workspaceId
            })

        this.applyPublishedFilters(qb, options?.where)
        this.applySearchFilter(qb, options?.search)

        if (options?.order) {
            Object.entries(options.order).forEach(([name, direction]) => {
                qb.addOrderBy(`xpert.${name}`, direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC')
            })
        }
        if (options?.take != null) {
            qb.take(options.take)
        }
        if (options?.skip != null) {
            qb.skip(options.skip)
        }

        return qb
    }

    private buildPublicXpertBoundQuery(publicXpertId: string, options?: PublishedXpertQueryOptions) {
        const tenantId = this.currentTenantId()
        const qb = this.repository
            .createQueryBuilder('xpert')
            .where('xpert.tenantId = :tenantId', {
                tenantId
            })
            .andWhere('xpert.publishAt IS NOT NULL')
            .andWhere('xpert.id = :publicXpertId', {
                publicXpertId
            })

        this.applyPublicChatAppFilter(qb)
        this.applyPublishedFilters(qb, options?.where)
        this.applySearchFilter(qb, options?.search)

        if (options?.order) {
            Object.entries(options.order).forEach(([name, direction]) => {
                qb.addOrderBy(`xpert.${name}`, direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC')
            })
        }
        if (options?.take != null) {
            qb.take(options.take)
        }
        if (options?.skip != null) {
            qb.skip(options.skip)
        }

        return qb
    }

    private applyPublicChatAppFilter(qb: SelectQueryBuilder<Xpert>) {
        return qb
            .andWhere(`COALESCE((xpert.app)::jsonb ->> 'enabled', 'false') = 'true'`)
            .andWhere(`COALESCE((xpert.app)::jsonb ->> 'public', 'false') = 'true'`)
    }

    private assertPublicChatAppXpert(xpert: Xpert) {
        if (!xpert.app?.enabled || !xpert.app.public) {
            throw new ForbiddenException('You do not have access to this assistant.')
        }
    }

    private buildAccessibleQuery(options?: PublishedXpertQueryOptions) {
        const publicXpertId = this.currentPublicXpertId()
        if (publicXpertId) {
            return this.buildPublicXpertBoundQuery(publicXpertId, options)
        }

        const workspaceId = this.currentWorkspaceApiKeyWorkspaceId()
        if (workspaceId && !this.currentRequestedUserId()) {
            return this.buildWorkspaceBoundQuery(workspaceId, options)
        }

        const tenantId = this.currentTenantId()
        const organizationId = this.currentOrganizationId()
        const userId = this.currentUserId()
        const qb = this.repository
            .createQueryBuilder('xpert')
            .leftJoin('xpert.workspace', 'workspace')
            .leftJoin('workspace.members', 'workspaceMember', 'workspaceMember.id = :userId', {
                userId
            })
            .leftJoin(
                'xpert.userGroups',
                'userGroup',
                'userGroup.tenantId = :tenantId AND userGroup.organizationId = :organizationId',
                {
                    tenantId,
                    organizationId
                }
            )
            .leftJoin('userGroup.members', 'member', 'member.id = :userId', {
                userId
            })
            .where('xpert.tenantId = :tenantId', {
                tenantId
            })
            .andWhere('xpert.publishAt IS NOT NULL')

        if (workspaceId) {
            qb.andWhere('xpert.workspaceId = :workspaceApiKeyWorkspaceId', {
                workspaceApiKeyWorkspaceId: workspaceId
            })
        }

        qb.andWhere(
            new Brackets((scopeQb) => {
                scopeQb
                    .where('xpert.organizationId = :organizationId', {
                        organizationId
                    })
                    .orWhere(
                        new Brackets((tenantScopeQb) => {
                            tenantScopeQb
                                .where('xpert.organizationId IS NULL')
                                .andWhere('workspace.id IS NOT NULL')
                                .andWhere(TENANT_SHARED_WORKSPACE_FILTER)
                        })
                    )
            })
        ).andWhere(
            new Brackets((accessQb) => {
                accessQb
                    .where('xpert.createdById = :userId', { userId })
                    .orWhere('workspace.ownerId = :userId', { userId })
                    .orWhere('workspaceMember.id = :userId', { userId })
                    .orWhere('member.id = :userId', { userId })
                    .orWhere(
                        new Brackets((tenantSharedQb) => {
                            tenantSharedQb
                                .where('xpert.organizationId IS NULL')
                                .andWhere(TENANT_SHARED_WORKSPACE_FILTER)
                        })
                    )
            })
        )

        this.applyPublishedFilters(qb, options?.where)
        this.applySearchFilter(qb, options?.search)

        if (options?.order) {
            Object.entries(options.order).forEach(([name, direction]) => {
                qb.addOrderBy(`xpert.${name}`, direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC')
            })
        }
        if (options?.take != null) {
            qb.take(options.take)
        }
        if (options?.skip != null) {
            qb.skip(options.skip)
        }

        return qb
    }

    private async loadByIds(ids: string[], relations?: string[]) {
        if (!ids.length) {
            return []
        }

        const items = await this.repository.find({
            where: {
                id: In(ids)
            },
            relations: uniq(relations ?? [])
        })
        const byId = new Map(items.map((item) => [item.id, item]))

        return ids.map((id) => byId.get(id)).filter((item): item is Xpert => !!item)
    }

    private normalizeRelations(relations?: FindOneOptions<Xpert>['relations']) {
        if (Array.isArray(relations)) {
            return uniq([...relations, 'workspace', 'userGroups'])
        }

        return {
            ...((relations ?? {}) as FindOptionsRelations<Xpert>),
            workspace: true,
            userGroups: true
        }
    }

    async getPublishedXpertInTenant(id: string, options?: Omit<FindOneOptions<Xpert>, 'where'>) {
        const tenantId = this.currentTenantId()
        const xpert = await this.repository.findOne({
            ...(options ?? {}),
            where: {
                id,
                tenantId,
                publishAt: Not(IsNull())
            },
            relations: this.normalizeRelations(options?.relations)
        })

        if (!xpert) {
            throw new NotFoundException('The requested record was not found')
        }

        return xpert
    }

    async countAccessiblePublishedXperts(where?: PublishedXpertQueryOptions['where'], search?: string) {
        return this.buildAccessibleQuery({ where, search }).select('xpert.id').distinct(true).getCount()
    }

    async findAccessiblePublishedXperts(options?: PublishedXpertQueryOptions) {
        const query = this.buildAccessibleQuery(options).select('xpert.id', 'id').distinct(true)

        Object.keys(options?.order ?? {}).forEach((name) => {
            query.addSelect(`xpert.${name}`, `order_${name}`)
        })

        const rows = await query.getRawMany<{ id: string }>()

        return this.loadByIds(
            rows.map((row) => row.id),
            options?.relations
        )
    }

    async getAccessiblePublishedXpert(id: string, options?: Omit<FindOneOptions<Xpert>, 'where'>) {
        const publicXpertId = this.currentPublicXpertId()
        if (publicXpertId) {
            if (publicXpertId !== id) {
                throw new ForbiddenException('You do not have access to this assistant.')
            }

            const xpert = await this.getPublishedXpertInTenant(id, options)
            this.assertPublicChatAppXpert(xpert)
            return xpert
        }

        const xpert = await this.getPublishedXpertInTenant(id, options)
        const workspaceId = this.currentWorkspaceApiKeyWorkspaceId()

        if (workspaceId) {
            if (xpert.workspaceId !== workspaceId) {
                throw new ForbiddenException('You do not have access to this assistant.')
            }
            if (!this.currentRequestedUserId()) {
                return xpert
            }
        }

        const userId = this.currentUserId()

        if (!xpert.organizationId) {
            if (RequestContext.isTenantScope() || isTenantSharedXpertWorkspace(xpert.workspace)) {
                return xpert
            }

            const count = await this.buildAccessibleQuery({
                where: {
                    id
                }
            }).getCount()

            if (!count) {
                throw new ForbiddenException('You do not have access to this assistant.')
            }

            return xpert
        }

        if (xpert.organizationId && xpert.organizationId !== this.currentOrganizationId()) {
            throw new ForbiddenException('You do not have access to this assistant.')
        }

        if (xpert.createdById === userId) {
            return xpert
        }

        const count = await this.buildAccessibleQuery({
            where: {
                id
            }
        }).getCount()

        if (!count) {
            throw new ForbiddenException('You do not have access to this assistant.')
        }

        return xpert
    }
}
