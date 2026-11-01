jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')

    return {
        ...actual,
        RequestContext: {
            currentTenantId: jest.fn(),
            currentUserId: jest.fn(),
            currentUser: jest.fn(),
            getOrganizationId: jest.fn(),
            currentApiPrincipal: jest.fn(),
            hasPermission: jest.fn(() => true),
            isTenantScope: jest.fn()
        }
    }
})

jest.mock('./xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { ForbiddenException } from '@nestjs/common'
import { RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { PublishedXpertAccessService } from './published-xpert-access.service'
import { Xpert } from './xpert.entity'
import { runWithPublishedAgent, publishedAgentDelegation } from './published-agent/with-published-agent'

function createQueryBuilderMock(options?: { count?: number; rows?: { id: string }[] }) {
    return {
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(options?.rows ?? []),
        getCount: jest.fn().mockResolvedValue(options?.count ?? 0)
    }
}

function asXpertRepository(repository: Partial<Repository<Xpert>>) {
    return repository as unknown as Repository<Xpert>
}

describe('Published Assistant delivery and delegation boundaries', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(undefined)
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            requestedOrganizationId: 'org-requested'
        })
        ;(RequestContext.isTenantScope as jest.Mock).mockReturnValue(false)
    })

    it('authorizes hidden resources only inside a live web-user delegation and revokes them without changing identity', async () => {
        const parent = { id: 'parent', tenantId: 'tenant-1', organizationId: 'org-requested',
            createdById: 'user-1', publishAt: new Date() }
        const child = { ...parent, id: 'child', createdById: 'maintenance' }
        let granted = true
        const repository = {
            findOne: jest.fn(async ({ where }) => where.id === 'parent' ? parent : child),
            createQueryBuilder: jest.fn(() => {
                const qb = createQueryBuilderMock()
                qb.getCount.mockImplementation(async () => granted && qb.andWhere.mock.calls.some(
                    ([, parameters]) => parameters?.platformParent === 'parent' || parameters?.id === 'parent'
                ) ? 1 : 0)
                return qb
            })
        }
        const service = new PublishedXpertAccessService(repository as unknown as Repository<Xpert>)
        await expect(service.getAccessiblePublishedXpert('child')).rejects.toThrow(ForbiddenException)
        await runWithPublishedAgent('parent', { xpertId: 'child' }, async () => {
            await expect(service.getAccessiblePublishedXpert('child')).resolves.toMatchObject({ id: 'child' })
            await expect(service.getAccessiblePublishedXpert('unrelated')).rejects.toThrow(ForbiddenException)
            granted = false
            await expect(service.getAccessiblePublishedXpert('child')).rejects.toThrow(ForbiddenException)
        })
        expect(publishedAgentDelegation()).toBeUndefined()
        await expect(service.getAccessiblePublishedXpert('child')).rejects.toThrow(ForbiddenException)
    })

    it('does not let an application user bypass assigned entries by owning an Assistant', async () => {
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue({ role: { name: RolesEnum.APP_USER } })
        const qb = createQueryBuilderMock()
        const repository = {
            findOne: jest.fn().mockResolvedValue({ id: 'unassigned', tenantId: 'tenant-1',
                organizationId: 'org-requested', createdById: 'user-1', publishAt: new Date() }),
            createQueryBuilder: jest.fn().mockReturnValue(qb)
        }
        const service = new PublishedXpertAccessService(asXpertRepository(repository))
        await expect(service.getAccessiblePublishedXpert('unassigned')).rejects.toThrow(ForbiddenException)
        expect(qb.getCount).toHaveBeenCalled()
    })

})
