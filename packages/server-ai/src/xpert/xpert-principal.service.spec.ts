import { NotFoundException } from '@nestjs/common'
import { XpertPrincipalService } from './xpert-principal.service'
import { XpertService } from './xpert.service'

describe('XpertPrincipalService', () => {
    it('returns the existing xpert principal user when one is already bound', async () => {
        const user = {
            id: 'assistant-user-1',
            tenantId: 'tenant-1'
        }
        const { service, userService, xpertService } = createService()

        await expect(
            service.ensurePrincipalUser({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                slug: 'assistant',
                userId: 'assistant-user-1',
                user
            } as never)
        ).resolves.toBe(user)

        expect(userService.ensureCommunicationUser).not.toHaveBeenCalled()
        expect(xpertService.update).not.toHaveBeenCalled()
    })

    it('creates and binds a stable communication user when the xpert principal user is missing', async () => {
        const { service, userService, xpertService } = createService()
        userService.ensureCommunicationUser.mockResolvedValue({
            id: 'assistant-user-1',
            tenantId: 'tenant-1'
        })

        await expect(
            service.ensurePrincipalUser({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                slug: 'sales-assistant',
                userId: null,
                user: null
            } as never)
        ).resolves.toMatchObject({
            id: 'assistant-user-1'
        })

        expect(userService.ensureCommunicationUser).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            thirdPartyId: 'xpert:xpert-1',
            username: 'sales-assistant'
        })
        expect(xpertService.update).toHaveBeenCalledWith('xpert-1', {
            user: expect.objectContaining({
                id: 'assistant-user-1'
            }),
            userId: 'assistant-user-1'
        })
    })

    it('looks up the target xpert by tenant and organization before ensuring the principal user', async () => {
        const { service, query, userService } = createService()
        query.getOne.mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            slug: 'assistant',
            userId: null,
            user: null
        })
        userService.ensureCommunicationUser.mockResolvedValue({
            id: 'assistant-user-1',
            tenantId: 'tenant-1'
        })

        await expect(
            service.ensurePrincipalUserByXpertId({
                xpertId: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        ).resolves.toMatchObject({
            xpert: {
                id: 'xpert-1',
                userId: 'assistant-user-1'
            },
            user: {
                id: 'assistant-user-1'
            }
        })

        expect(query.andWhere).toHaveBeenCalledWith('xpert."tenantId" = :tenantId', {
            tenantId: 'tenant-1'
        })
        expect(query.andWhere).toHaveBeenCalledWith('xpert."organizationId" = :organizationId', {
            organizationId: 'org-1'
        })
    })

    it('throws a clear error when the target xpert cannot be found', async () => {
        const { service, query } = createService()
        query.getOne.mockResolvedValue(null)

        await expect(
            service.ensurePrincipalUserByXpertId({
                xpertId: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        ).rejects.toMatchObject({
            response: expect.objectContaining({
                code: 'xpert_principal_xpert_not_found',
                xpertId: 'xpert-1'
            })
        })
        await expect(
            service.ensurePrincipalUserByXpertId({
                xpertId: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        ).rejects.toBeInstanceOf(NotFoundException)
    })
})

function createService() {
    const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn()
    }
    const xpertService = {
        repository: {
            createQueryBuilder: jest.fn(() => query)
        },
        update: jest.fn()
    }
    const userService = {
        findOneByIdWithinTenant: jest.fn(),
        ensureCommunicationUser: jest.fn()
    }
    const service = new XpertPrincipalService(xpertService as unknown as XpertService, userService as never)

    return {
        service,
        query,
        xpertService,
        userService
    }
}
