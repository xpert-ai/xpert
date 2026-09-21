import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IXpert } from '@xpert-ai/contracts'
import type { Repository } from 'typeorm'
import type { XpertProject } from '../entities/project.entity'
import { findAvailableProjects } from './project-list-query'

jest.mock('@xpert-ai/server-core', () => ({ applyWhereToQueryBuilder: jest.fn() }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentUserId: jest.fn(() => 'user-1'),
        currentTenantId: jest.fn(() => 'tenant-1'),
        getOrganizationId: jest.fn(() => 'org-1')
    }
}))
jest.mock('../entities/project.entity', () => ({ XpertProject: class {} }))
jest.mock('../entities/project-membership.entity', () => ({ XpertProjectMembership: class {} }))

describe('available project pagination', () => {
    it('uses a deterministic recent-first order with type, search and organization filters before paging', async () => {
        const query = {
            subQuery: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getQuery: jest.fn(() => '(SELECT 1)'),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'project-21' }], 45])
        }
        const repository = { createQueryBuilder: jest.fn(() => query) } as unknown as Repository<XpertProject>
        const result = await findAvailableProjects(
            repository,
            {
                id: 'assistant',
                tenantId: 'tenant-1',
                type: 'agent',
                slug: 'operations',
                organizationId: 'org-1'
            } as IXpert,
            {
                xpertId: 'assistant',
                status: 'active',
                skip: 20,
                take: 20,
                filter: { applicationKey: 'operations', projectTypeKey: 'case', search: 'Case' }
            }
        )

        expect(result).toEqual({ items: [{ id: 'project-21' }], total: 45 })
        expect(query.orderBy).toHaveBeenCalledWith({ 'project.updatedAt': 'DESC', 'project.id': 'DESC' })
        expect(query.skip).toHaveBeenCalledWith(20)
        expect(query.take).toHaveBeenCalledWith(20)
        expect(query.andWhere).toHaveBeenCalledWith('project.organizationId = :organizationId', {
            organizationId: RequestContext.getOrganizationId()
        })
        expect(query.andWhere).toHaveBeenCalledWith('project.applicationKey = :applicationKey', {
            applicationKey: 'operations'
        })
        expect(query.andWhere).toHaveBeenCalledWith('project.projectTypeKey = :projectTypeKey', {
            projectTypeKey: 'case'
        })
        expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { projectSearch: '%Case%' })
    })
})
