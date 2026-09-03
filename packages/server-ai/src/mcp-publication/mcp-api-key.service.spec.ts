import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { McpApiKey, McpPublication } from './entities'
import { McpApiKeyService } from './mcp-api-key.service'
import { McpPublicationService } from './mcp-publication.service'
import { McpSubscriptionService } from './mcp-subscription.service'

describe('McpApiKeyService', () => {
    let service: McpApiKeyService
    let stored: McpApiKey[]
    let selectedKey: McpApiKey | undefined
    let update: jest.Mock
    let where: jest.Mock
    let publishAccessInvalidated: jest.Mock
    let getManaged: jest.Mock

    beforeEach(async () => {
        stored = []
        selectedKey = undefined
        update = jest.fn().mockResolvedValue(undefined)
        where = jest.fn().mockReturnThis()
        publishAccessInvalidated = jest.fn()
        getManaged = jest.fn().mockResolvedValue(publication())
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('11111111-1111-4111-8111-111111111111')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        const queryBuilder = {
            addSelect: jest.fn().mockReturnThis(),
            where,
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn(async () => (selectedKey?.revokedAt ? undefined : selectedKey))
        }
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                McpApiKeyService,
                {
                    provide: getRepositoryToken(McpApiKey),
                    useValue: {
                        create: jest.fn((input) => Object.assign(new McpApiKey(), input)),
                        save: jest.fn(async (key) => {
                            if (!key.id) key.id = `key-${stored.length + 1}`
                            const index = stored.findIndex((item) => item.id === key.id)
                            if (index === -1) stored.push(key)
                            else stored[index] = key
                            return key
                        }),
                        find: jest.fn(async ({ where: condition }) =>
                            stored.filter(
                                (key) =>
                                    key.publicationId === condition.publicationId &&
                                    key.tenantId === condition.tenantId &&
                                    (condition.organizationId === undefined ||
                                        key.organizationId === condition.organizationId)
                            )
                        ),
                        findOne: jest.fn(async ({ where: condition }) => stored.find((key) => key.id === condition.id)),
                        createQueryBuilder: jest.fn(() => queryBuilder),
                        update
                    }
                },
                {
                    provide: McpPublicationService,
                    useValue: { getManaged }
                },
                {
                    provide: McpSubscriptionService,
                    useValue: { publishAccessInvalidated }
                }
            ]
        }).compile()
        service = module.get(McpApiKeyService)
    })

    afterEach(() => jest.restoreAllMocks())

    it('returns the secret once while persisting only its hash', async () => {
        const created = await service.create('publication-1', { name: 'Codex' })

        expect(created.secret).toMatch(/^xpert_mcp_/)
        expect(created.apiKey).not.toHaveProperty('keyHash')
        expect(stored[0].keyHash).toMatch(/^[a-f0-9]{64}$/)
        expect(stored[0].keyHash).not.toContain(created.secret)
        expect(stored[0].keyPrefix).toBe(created.secret.slice(0, 24))
        expect(stored[0].scopes).toEqual(['tools:list', 'tools:call'])
    })

    it('authenticates a valid bearer key only for its publication and updates last use', async () => {
        const created = await service.create('publication-1', { name: 'Codex', scopes: ['tools:list'] })
        selectedKey = stored[0]

        const principal = await service.authenticate(publication(), `Bearer ${created.secret}`)
        expect(principal).toEqual(
            expect.objectContaining({
                authMethod: 'api_key',
                credentialPrefix: created.secret.slice(0, 24),
                subjectId: '11111111-1111-4111-8111-111111111111',
                publicationId: 'publication-1',
                scopes: ['tools:list']
            })
        )
        expect(where).toHaveBeenCalledWith('apiKey.keyPrefix = :keyPrefix', {
            keyPrefix: created.secret.slice(0, 24)
        })
        expect(JSON.stringify(principal)).not.toContain(created.secret)
        expect(update).toHaveBeenCalledWith('key-1', { lastUsedAt: expect.any(Date) })
    })

    it('binds a shared tenant Publication key to the admitted organization', async () => {
        const sharedPublication = Object.assign(publication(), { organizationId: null })
        const created = await service.createForOrganization(sharedPublication, 'organization-2', {
            name: 'Organization client'
        })
        selectedKey = stored[0]

        await expect(service.authenticate(sharedPublication, `Bearer ${created.secret}`)).resolves.toEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'organization-2',
                publicationId: 'publication-1'
            })
        )

        const rotated = await service.rotate(stored[0].id)
        expect(rotated.apiKey.organizationId).toBe('organization-2')
    })

    it('manages only current-organization keys for an admitted tenant Publication', async () => {
        const sharedPublication = Object.assign(publication(), { organizationId: null })
        getManaged.mockResolvedValue(sharedPublication)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        await service.createForOrganization(sharedPublication, 'organization-2', { name: 'Other organization' })
        const current = await service.create(sharedPublication.id, { name: 'Current organization' })

        await expect(service.list(sharedPublication.id)).resolves.toEqual([
            expect.objectContaining({ id: current.apiKey.id, organizationId: 'organization-1' })
        ])
        await expect(service.revoke(stored[0].id)).rejects.toBeInstanceOf(BadRequestException)
        expect(stored[0].revokedAt).toBeUndefined()
    })

    it('rejects expired, revoked, malformed, and cross-publication credentials', async () => {
        const created = await service.create('publication-1', { name: 'Codex' })
        selectedKey = Object.assign(stored[0], { expiresAt: new Date(Date.now() - 1) })
        await expect(service.authenticate(publication(), `Bearer ${created.secret}`)).rejects.toThrow()

        selectedKey = undefined
        await expect(service.authenticate(publication(), `Bearer ${created.secret}`)).rejects.toThrow()
        await expect(service.authenticate(publication(), 'Basic invalid')).rejects.toThrow()
        await expect(
            service.authenticate({ ...publication(), id: 'publication-2' }, `Bearer ${created.secret}`)
        ).rejects.toThrow()
    })

    it('revokes immediately and rotates to a distinct one-time secret', async () => {
        const original = await service.create('publication-1', { name: 'Codex' })
        selectedKey = stored[0]

        const rotated = await service.rotate(stored[0].id)

        expect(stored[0].revokedAt).toBeInstanceOf(Date)
        expect(publishAccessInvalidated).toHaveBeenCalledWith('publication-1')
        expect(rotated.secret).not.toBe(original.secret)
        expect(rotated.apiKey.id).not.toBe(stored[0].id)
        await expect(service.authenticate(publication(), `Bearer ${original.secret}`)).rejects.toThrow()

        selectedKey = stored[1]
        await expect(service.authenticate(publication(), `Bearer ${rotated.secret}`)).resolves.toEqual(
            expect.objectContaining({ publicationId: 'publication-1' })
        )

        await service.revoke(stored[1].id)
        expect(publishAccessInvalidated).toHaveBeenCalledTimes(2)
        await expect(service.authenticate(publication(), `Bearer ${rotated.secret}`)).rejects.toThrow()
    })
})

function publication(): McpPublication {
    return Object.assign(new McpPublication(), {
        id: 'publication-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        authMethods: ['api_key']
    })
}
