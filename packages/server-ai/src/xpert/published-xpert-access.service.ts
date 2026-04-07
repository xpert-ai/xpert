import { IApiPrincipal } from '@metad/contracts'
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

type PublishedXpertQueryOptions = {
    where?: Partial<Pick<Xpert, 'id' | 'slug' | 'workspaceId' | 'type' | 'latest' | 'version'>>
    relations?: string[]
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

    private currentOrganizationId() {
        const apiPrincipal = RequestContext.currentApiPrincipal() as IApiPrincipal | null
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

    private buildAccessibleQuery(options?: PublishedXpertQueryOptions) {
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
            .andWhere(
                new Brackets((scopeQb) => {
                    scopeQb
                        .where('xpert.organizationId = :organizationId', {
                            organizationId
                        })
                        .orWhere('xpert.organizationId IS NULL')
                })
            )
            .andWhere(
                new Brackets((accessQb) => {
                    accessQb
                        .where('xpert.createdById = :userId', { userId })
                        .orWhere('workspace.ownerId = :userId', { userId })
                        .orWhere('workspaceMember.id = :userId', { userId })
                        .orWhere('member.id = :userId', { userId })
                })
            )

        this.applyPublishedFilters(qb, options?.where)

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
            return uniq([...relations, 'userGroups'])
        }

        return {
            ...((relations ?? {}) as FindOptionsRelations<Xpert>),
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

    async countAccessiblePublishedXperts(where?: PublishedXpertQueryOptions['where']) {
        return this.buildAccessibleQuery({ where }).select('xpert.id').distinct(true).getCount()
    }

    async findAccessiblePublishedXperts(options?: PublishedXpertQueryOptions) {
        const query = this.buildAccessibleQuery(options)
            .select('xpert.id', 'id')
            .distinct(true)

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
        const userId = this.currentUserId()
        const xpert = await this.getPublishedXpertInTenant(id, options)

        if (!xpert.organizationId) {
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
