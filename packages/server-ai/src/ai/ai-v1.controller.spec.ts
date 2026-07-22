import { BadRequestException } from '@nestjs/common'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { AIV1Controller } from './ai-v1.controller'

describe('AIV1Controller ChatKit sessions', () => {
    function createController() {
        const secretTokenService = {
            create: jest.fn().mockResolvedValue(undefined)
        }
        const publishedXpertAccessService = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
                id: 'xpert-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1'
            })
        }
        const controller = new AIV1Controller(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            secretTokenService as never,
            publishedXpertAccessService as never
        )

        return { controller, secretTokenService, publishedXpertAccessService }
    }

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('issues an assistant-scoped client secret from the authenticated user', async () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'user-1',
            tenantId: 'tenant-1'
        } as never)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { controller, secretTokenService, publishedXpertAccessService } = createController()

        const result = await controller.createChatkitSession(undefined as never, {
            assistant: { id: 'xpert-1' },
            user: 'user-1'
        })

        expect(publishedXpertAccessService.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1')
        expect(secretTokenService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                entityId: 'xpert-1',
                type: SecretTokenBindingType.USER_XPERT,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                createdById: 'user-1',
                token: expect.stringMatching(/^cs-x-/),
                validUntil: expect.any(Date)
            })
        )
        expect(result.client_secret).toMatch(/^cs-x-/)
        expect(result.expires_after).toBe(600)
    })

    it('rejects a user-session request that impersonates another user', async () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'user-1',
            tenantId: 'tenant-1'
        } as never)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { controller, secretTokenService, publishedXpertAccessService } = createController()

        await expect(
            controller.createChatkitSession(undefined as never, {
                assistant: { id: 'xpert-1' },
                user: 'user-2'
            })
        ).rejects.toBeInstanceOf(BadRequestException)

        expect(publishedXpertAccessService.getAccessiblePublishedXpert).not.toHaveBeenCalled()
        expect(secretTokenService.create).not.toHaveBeenCalled()
    })

    it('caps user session lifetime at one hour', async () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'user-1',
            tenantId: 'tenant-1'
        } as never)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { controller } = createController()

        const result = await controller.createChatkitSession(undefined as never, {
            assistant: { id: 'xpert-1' },
            user: 'user-1',
            expires_after: 86_400
        })

        expect(result.expires_after).toBe(3600)
    })

    it('keeps the existing api-key-backed session flow for service callers', async () => {
        const { controller, secretTokenService, publishedXpertAccessService } = createController()

        await controller.createChatkitSession(
            {
                id: 'api-key-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            } as never,
            {}
        )

        expect(secretTokenService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                entityId: 'api-key-1',
                type: SecretTokenBindingType.API_KEY,
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        )
        expect(publishedXpertAccessService.getAccessiblePublishedXpert).not.toHaveBeenCalled()
    })
})
