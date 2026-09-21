import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import type { IXpert, XpertProjectListFilter } from '@xpert-ai/contracts'
import { applyWhereToQueryBuilder, PaginationParams } from '@xpert-ai/server-core'
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm'
import { XpertProject } from '../entities/project.entity'

/** Add classification and literal-text search predicates to an already access-scoped query. */
export function applyProjectListFilter(query: SelectQueryBuilder<XpertProject>, filter: XpertProjectListFilter) {
    if (filter.applicationKey)
        query.andWhere('project.applicationKey = :applicationKey', { applicationKey: filter.applicationKey })
    if (filter.projectTypeKey)
        query.andWhere('project.projectTypeKey = :projectTypeKey', { projectTypeKey: filter.projectTypeKey })
    if (filter.unclassified) query.andWhere('project.applicationKey IS NULL AND project.projectTypeKey IS NULL')
    if (filter.search?.trim())
        query.andWhere('(project.name ILIKE :projectSearch OR project.description ILIKE :projectSearch)', {
            projectSearch: `%${filter.search.trim().replace(/[\\%_]/g, '\\$&')}%`
        })
}

/** Page owned or actively joined Projects in the request's tenant and organization. */
export async function findMyProjects(
    repository: Repository<XpertProject>,
    options: Partial<PaginationParams<XpertProject>> = {},
    filter: XpertProjectListFilter = {}
) {
    const user = RequestContext.currentUser()
    const organizationId = RequestContext.getOrganizationId()
    const requestedStatus = !Array.isArray(options?.where) ? options?.where?.status : undefined

    const orderBy = options?.order
        ? Object.keys(options.order).reduce((order, name) => {
              order[`project.${name}`] = options.order[name]
              return order
          }, {})
        : {}

    const query = repository
        .createQueryBuilder('project')
        .leftJoin(
            'project.memberships',
            'membership',
            'membership.userId = :userId AND membership.deletedAt IS NULL AND membership.removedAt IS NULL'
        )
        .where('project.tenantId = :tenantId')
        .andWhere(
            new Brackets((qb) => {
                qb.where('project.ownerId = :userId').orWhere('membership.userId = :userId')
            })
        )
        .orderBy(orderBy)
        .setParameters({
            tenantId: user.tenantId,
            userId: user.id
        })

    if (requestedStatus === 'all') {
        // Explicitly requested by the Project workspace so archived projects
        // can be filtered client-side without changing legacy callers.
    } else if (typeof requestedStatus === 'string' && requestedStatus.length > 0) {
        query.andWhere('project.status = :projectStatus', { projectStatus: requestedStatus })
    } else {
        query.andWhere(
            new Brackets((qb) => {
                qb.where(`project.status <> 'archived'`).orWhere(`project.status IS NULL`)
            })
        )
    }

    if (organizationId) {
        query.andWhere('project.organizationId = :organizationId', { organizationId })
    } else {
        query.andWhere('project.organizationId IS NULL')
    }

    if (options?.where) {
        const where = Array.isArray(options.where)
            ? options.where
            : Object.fromEntries(Object.entries(options.where).filter(([key]) => key !== 'status'))
        if (Array.isArray(where) ? where.length > 0 : Object.keys(where).length > 0) {
            applyWhereToQueryBuilder(query, 'project', where)
        }
    }

    applyProjectListFilter(query, filter)

    if (options?.skip) {
        query.skip(options.skip)
    }
    if (options?.take) {
        query.take(options.take)
    }

    const [projects, total] = await query.getManyAndCount()

    return {
        items: projects,
        total
    }
}

/**
 * Page readable Projects connected to the accessible Assistant's version family.
 * Filter before counting/paging and use a stable recent-first order for incremental UI loading.
 */
export async function findAvailableProjects(
    repository: Repository<XpertProject>,
    xpert: IXpert,
    input: {
        xpertId: string
        filter?: XpertProjectListFilter
        status?: 'active' | 'archived' | 'all'
        skip?: number
        take?: number
    }
) {
    const userId = RequestContext.currentUserId()
    const organizationId = RequestContext.getOrganizationId()
    const query = repository.createQueryBuilder('project')
    const linkedXpertSubquery = query
        .subQuery()
        .select('1')
        .from(XpertProject, 'linkedProject')
        .innerJoin('linkedProject.xperts', 'linkedXpert')
        .where('linkedProject.id = project.id')
        .andWhere('linkedXpert.tenantId = :xpertTenantId', { xpertTenantId: xpert.tenantId })
        .andWhere('linkedXpert.type = :xpertType', { xpertType: xpert.type })
        .andWhere('linkedXpert.slug = :xpertSlug', { xpertSlug: xpert.slug })
    if (xpert.organizationId) {
        linkedXpertSubquery.andWhere('linkedXpert.organizationId = :xpertOrganizationId', {
            xpertOrganizationId: xpert.organizationId
        })
    } else {
        linkedXpertSubquery.andWhere('linkedXpert.organizationId IS NULL')
    }
    if (xpert.workspaceId) {
        linkedXpertSubquery.andWhere('linkedXpert.workspaceId = :xpertWorkspaceId', {
            xpertWorkspaceId: xpert.workspaceId
        })
    } else {
        linkedXpertSubquery.andWhere('linkedXpert.workspaceId IS NULL')
    }
    const linkedXpertExists = linkedXpertSubquery.getQuery()
    const activeMembershipExists = query
        .subQuery()
        .select('1')
        .from(XpertProjectMembership, 'availableMembership')
        .where('availableMembership.projectId = project.id')
        .andWhere('availableMembership.userId = :userId', { userId })
        .andWhere('availableMembership.deletedAt IS NULL AND availableMembership.removedAt IS NULL')
        .getQuery()
    query
        .where('project.tenantId = :tenantId', { tenantId: RequestContext.currentTenantId() })
        .andWhere(`EXISTS ${linkedXpertExists}`)
        .andWhere(
            new Brackets((qb) => {
                qb.where('project.ownerId = :userId').orWhere(`EXISTS ${activeMembershipExists}`)
            })
        )
    if (organizationId) query.andWhere('project.organizationId = :organizationId', { organizationId })
    else query.andWhere('project.organizationId IS NULL')
    if (input.status && input.status !== 'all') query.andWhere('project.status = :status', { status: input.status })
    else if (!input.status) query.andWhere("project.status <> 'archived'")
    applyProjectListFilter(query, input.filter ?? {})
    // Stable ordering is shared by the recent list and incrementally loaded groups.
    query.orderBy({ 'project.updatedAt': 'DESC', 'project.id': 'DESC' })
    query.skip(Math.max(input.skip ?? 0, 0)).take(Math.min(Math.max(input.take ?? 25, 1), 100))
    const [items, total] = await query.getManyAndCount()
    return { items, total }
}
