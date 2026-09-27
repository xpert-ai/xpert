jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentUserId: jest.fn(),
        getOrganizationId: jest.fn()
    }
}))

jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

jest.mock('@xpert-ai/server-core', () => ({ UserService: class UserService {} }))
jest.mock('../assistant-binding/assistant-binding.service', () => ({
    AssistantBindingService: class AssistantBindingService {}
}))
jest.mock('../xpert/published-xpert-access.service', () => ({
    PublishedXpertAccessService: class PublishedXpertAccessService {}
}))

import { AssistantBindingScope, AssistantBindingSourceScope, AssistantCode, XpertTypeEnum } from '@xpert-ai/contracts'
import { UnauthorizedException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    getDeploymentConfig,
    MobileService,
    summarizeOrganizations,
    summarizeUser,
    summarizeXpert
} from './mobile.service'

describe('MobileService', () => {
    const userService = {
        findCurrentUser: jest.fn()
    }
    const assistantBindingService = {
        getEffectiveBinding: jest.fn()
    }
    const publishedXpertAccessService = {
        findAccessiblePublishedXperts: jest.fn(),
        countAccessiblePublishedXperts: jest.fn()
    }

    beforeEach(() => {
        jest.clearAllMocks()
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-2')
        userService.findCurrentUser.mockResolvedValue({
            id: 'user-1',
            tenantId: 'tenant-1',
            email: 'person@example.com',
            hash: 'secret-hash',
            token: 'secret-token',
            organizations: [
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    isDefault: true,
                    isActive: true,
                    organization: {
                        id: 'org-1',
                        tenantId: 'tenant-1',
                        name: 'Default Org',
                        isDefault: true,
                        isActive: true
                    }
                },
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-2',
                    isDefault: false,
                    isActive: true,
                    organization: {
                        id: 'org-2',
                        tenantId: 'tenant-1',
                        name: 'Active Org',
                        isDefault: false,
                        isActive: true,
                        secret: 'do-not-leak'
                    }
                }
            ]
        })
        assistantBindingService.getEffectiveBinding.mockResolvedValue({
            code: AssistantCode.CHAT_COMMON,
            scope: AssistantBindingScope.ORGANIZATION,
            sourceScope: AssistantBindingSourceScope.ORGANIZATION,
            assistantId: 'assistant-1',
            enabled: true,
            tenantId: 'tenant-1',
            organizationId: 'org-2',
            userId: null
        })
        publishedXpertAccessService.findAccessiblePublishedXperts.mockResolvedValue([
            {
                id: 'xpert-1',
                createdAt: new Date('2026-09-24T00:00:00Z'),
                slug: 'sales',
                name: 'sales',
                type: XpertTypeEnum.Agent,
                title: 'Sales',
                description: 'Helps sales teams.',
                marketplace: { businessCategories: ['business-operations'] },
                businessAreaId: 'sales-area',
                businessArea: { id: 'sales-area', name: 'Sales', children: [{ id: 'private-child' }] },
                avatar: null,
                latest: true,
                workspaceId: 'workspace-1',
                organizationId: 'org-2',
                starters: ['hello'],
                graph: {
                    secret: 'not-returned'
                }
            }
        ])
        publishedXpertAccessService.countAccessiblePublishedXperts.mockResolvedValue(1)
    })

    function createService() {
        return new MobileService(
            userService as unknown as ConstructorParameters<typeof MobileService>[0],
            assistantBindingService as unknown as ConstructorParameters<typeof MobileService>[1],
            publishedXpertAccessService as unknown as ConstructorParameters<typeof MobileService>[2]
        )
    }

    it('returns a scoped bootstrap payload without credential fields', async () => {
        const result = await createService().getBootstrap()
        const serialized = JSON.stringify(result)

        expect(userService.findCurrentUser).toHaveBeenCalledWith(
            'user-1',
            ['organizations', 'organizations.organization'],
            { currentOrganizationId: 'org-2' }
        )
        expect(result.activeOrganizationId).toBe('org-2')
        expect(result.organizations).toHaveLength(2)
        expect(serialized).not.toContain('secret-hash')
        expect(serialized).not.toContain('secret-token')
        expect(serialized).not.toContain('do-not-leak')
        expect(result.deployment.capabilities.chatkit).toBe(true)
    })

    it('requires an authenticated user for bootstrap', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue(null)

        await expect(createService().getBootstrap()).rejects.toThrow(UnauthorizedException)
    })

    it('lists accessible published assistant summaries with search and pagination', async () => {
        const result = await createService().listXperts({
            search: ' Sales ',
            limit: '200',
            offset: '3'
        })

        expect(publishedXpertAccessService.findAccessiblePublishedXperts).toHaveBeenCalledWith({
            where: {
                type: XpertTypeEnum.Agent,
                latest: true
            },
            relations: ['businessArea'],
            search: 'Sales',
            take: 100,
            skip: 3,
            order: {
                updatedAt: 'DESC',
                createdAt: 'DESC'
            }
        })
        expect(publishedXpertAccessService.countAccessiblePublishedXperts).toHaveBeenCalledWith(
            {
                type: XpertTypeEnum.Agent,
                latest: true
            },
            'Sales'
        )
        expect(result.items).toEqual([
            expect.objectContaining({
                id: 'xpert-1',
                slug: 'sales',
                title: 'Sales',
                businessArea: { id: 'sales-area', name: 'Sales' },
                createdAt: new Date('2026-09-24T00:00:00Z')
            })
        ])
        expect(JSON.stringify(result)).not.toContain('not-returned')
        expect(JSON.stringify(result)).not.toContain('private-child')
        expect(result.items[0]).not.toHaveProperty('businessCategories')
    })

    it('does not infer a business area from marketplace categories or a stale relation', async () => {
        publishedXpertAccessService.findAccessiblePublishedXperts.mockResolvedValue([
            { id: 'missing', name: 'Sales expert', marketplace: { businessCategories: ['sales'] } },
            { id: 'deleted', name: 'Deleted area', businessAreaId: 'deleted-area', businessArea: null },
            { id: 'unnamed', name: 'Unnamed area', businessArea: { id: 'legacy-area', name: ' ' } }
        ])
        publishedXpertAccessService.countAccessiblePublishedXperts.mockResolvedValue(3)

        const result = await createService().listXperts({})
        expect(result.items.map((item) => item.businessArea)).toEqual([null, null, null])
    })

    it('maps only mobile-safe user, organization, and xpert fields', () => {
        const membershipWithExtraData = {
            tenantId: 'tenant-1',
            userId: 'user-1',
            isDefault: true,
            isActive: true,
            organization: {
                id: 'org-1',
                tenantId: 'tenant-1',
                name: 'Org',
                isDefault: true,
                isActive: true,
                secret: 'hidden'
            }
        } as unknown as Parameters<typeof summarizeOrganizations>[0][number]

        expect(
            summarizeUser({
                id: 'user-1',
                tenantId: 'tenant-1',
                email: 'person@example.com',
                hash: 'secret-hash'
            })
        ).toEqual({
            id: 'user-1',
            tenantId: 'tenant-1',
            email: 'person@example.com',
            name: null,
            firstName: null,
            lastName: null,
            fullName: null,
            imageUrl: null,
            preferredLanguage: null
        })
        expect(summarizeOrganizations([membershipWithExtraData])).toEqual([
            {
                id: 'org-1',
                tenantId: 'tenant-1',
                name: 'Org',
                imageUrl: null,
                isDefault: true,
                isActive: true,
                timeZone: null,
                preferredLanguage: null
            }
        ])
        expect(
            summarizeXpert({
                id: 'xpert-1',
                slug: 'sales',
                name: 'sales',
                type: XpertTypeEnum.Agent,
                graph: {
                    secret: 'hidden'
                }
            } as unknown as Parameters<typeof summarizeXpert>[0])
        ).toEqual(
            expect.not.objectContaining({
                graph: expect.anything()
            })
        )
    })

    it('does not expose OpenAI or JWT secrets in deployment config', () => {
        const previousEnv = process.env
        process.env = {
            ...previousEnv,
            OPENAI_API_KEY: 'sk-test',
            JWT_SECRET: 'jwt-secret',
            MOBILE_API_BASE_URL: 'https://api.example.com',
            CHATKIT_FRAME_URL: '/chatkit'
        }

        try {
            const serialized = JSON.stringify(getDeploymentConfig())
            expect(serialized).toContain('https://api.example.com')
            expect(serialized).not.toContain('sk-test')
            expect(serialized).not.toContain('jwt-secret')
        } finally {
            process.env = previousEnv
        }
    })
})
