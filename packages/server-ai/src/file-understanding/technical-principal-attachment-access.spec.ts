import { ApiKeyBindingType, IApiPrincipal, SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import { RequestContext as PluginRequestContext } from '@xpert-ai/plugin-sdk'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Xpert } from '../xpert/xpert.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { FileAssetAccessService } from './file-asset-access.service'
import { CreateWorkspaceFileAssetHandler } from './commands/handlers/create-workspace-file-asset.handler'
import { CreateWorkspaceFileAssetCommand } from './commands/create-workspace-file-asset.command'
import { VolumeHandle } from '../shared/volume'
import { FileAsset } from './entities'

describe('technical principal attachment authorization', () => {
    let principal: IApiPrincipal

    beforeEach(() => {
        principal = {
            id: 'technical-user',
            tenantId: 'tenant-1',
            type: UserType.COMMUNICATION,
            principalType: 'api_key',
            ownerUserId: 'human-owner',
            apiKeyUserId: 'technical-user',
            requestedOrganizationId: 'org-1',
            apiKey: {
                token: 'test-only',
                type: ApiKeyBindingType.INTEGRATION,
                entityId: 'integration-1',
                userId: 'technical-user',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            }
        }
        for (const context of [RequestContext, PluginRequestContext]) {
            jest.spyOn(context, 'currentTenantId').mockReturnValue('tenant-1')
            jest.spyOn(context, 'currentUserId').mockImplementation(() => principal.id)
            jest.spyOn(context, 'currentUser').mockImplementation(() => principal)
            jest.spyOn(context, 'getOrganizationId').mockReturnValue('org-1')
            jest.spyOn(context, 'currentApiPrincipal').mockImplementation(() => principal)
        }
    })

    afterEach(() => jest.restoreAllMocks())

    function fixture() {
        const xpert: Xpert = Object.assign(new Xpert(), {
            id: 'xpert-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            createdById: 'human-owner',
            publishAt: new Date(),
            workspaceDataScope: 'shared'
        })
        const readers = new Set<string>()
        let queryUserId: string
        const query = {
            leftJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getCount: jest.fn(async () => (readers.has(queryUserId) ? 1 : 0))
        }
        query.leftJoin.mockImplementation(
            (_relation: string, _alias: string, _on?: string, values?: { userId?: string }) => {
                queryUserId = values?.userId ?? queryUserId
                return query
            }
        )
        const publishedAccess = new PublishedXpertAccessService({
            findOne: async () => xpert,
            createQueryBuilder: () => query
        } as never)
        const access = new FileAssetAccessService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            publishedAccess
        )
        return { xpert, access, publishedAccess, readers }
    }

    it('authorizes attachment registration using the owning human permission', async () => {
        const { access } = fixture()
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).resolves.toMatchObject({ id: 'xpert-1' })
    })

    it('registers a real file while retaining the technical execution identity and file ownership', async () => {
        const { access } = fixture()
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'technical-user-attachment-'))
        try {
            await fs.writeFile(path.join(root, 'note.txt'), 'WeChat attachment')
            const volume = new VolumeHandle(
                { tenantId: 'tenant-1', catalog: 'xperts', xpertId: 'xpert-1' },
                root,
                root,
                ''
            )
            const handler = new CreateWorkspaceFileAssetHandler(
                {
                    create: (input: Partial<FileAsset>) => Object.assign(new FileAsset(), input),
                    save: async (input: FileAsset) => Object.assign(input, { id: 'asset-1' })
                } as never,
                {} as never,
                { resolve: () => volume } as never,
                {} as never,
                access
            )

            await expect(
                handler.execute(
                    new CreateWorkspaceFileAssetCommand({
                        tenantId: 'tenant-1',
                        userId: 'technical-user',
                        catalog: 'xperts',
                        xpertId: 'xpert-1',
                        filePath: 'note.txt',
                        purpose: 'chat_attachment',
                        parseMode: 'none'
                    })
                )
            ).resolves.toMatchObject({
                id: 'asset-1',
                userId: 'technical-user',
                status: 'ready',
                workspacePath: 'note.txt'
            })
            expect(RequestContext.currentUserId()).toBe('technical-user')
        } finally {
            await fs.rm(root, { recursive: true, force: true })
        }
    })

    it('uses the human workspace or user-group grant and observes its revocation', async () => {
        const { access, xpert, readers } = fixture()
        xpert.createdById = 'another-creator'
        readers.add('human-owner')
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).resolves.toBeDefined()
        readers.delete('human-owner')
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('rejects when the human owner cannot access the assistant', async () => {
        const { access } = fixture()
        principal.ownerUserId = 'human-without-access'
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('does not inherit ownership metadata for an ordinary human API principal', async () => {
        const { access } = fixture()
        principal.type = UserType.USER
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('uses the explicitly delegated human instead of the credential owner', async () => {
        const { access } = fixture()
        principal.requestedUserId = 'delegated-user'
        principal.id = 'delegated-user'
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).rejects.toBeInstanceOf(ForbiddenException)
        principal.requestedUserId = 'human-owner'
        principal.id = 'human-owner'
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).resolves.toBeDefined()
    })

    it.each(['missing owner', 'mismatched principal', 'mismatched key user', 'foreign key tenant'])(
        'does not inherit with %s',
        async (scenario) => {
            const { access } = fixture()
            if (scenario === 'missing owner') principal.ownerUserId = null
            if (scenario === 'mismatched principal') principal.apiKeyUserId = 'other-user'
            if (scenario === 'mismatched key user') principal.apiKey.userId = 'other-user'
            if (scenario === 'foreign key tenant') principal.apiKey.tenantId = 'foreign-tenant'
            await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).rejects.toBeInstanceOf(
                ForbiddenException
            )
        }
    )

    it('inherits permissions for a short-lived session backed by the same API key', async () => {
        const { access } = fixture()
        principal.principalType = 'client_secret'
        principal.clientSecretBindingType = SecretTokenBindingType.API_KEY
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).resolves.toBeDefined()
    })

    it('preserves the requested organization boundary', async () => {
        const { access, xpert } = fixture()
        xpert.organizationId = 'another-org'
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('preserves a workspace API key audience even when the owner can access another assistant', async () => {
        const { access, xpert } = fixture()
        principal.apiKey.type = ApiKeyBindingType.WORKSPACE
        principal.apiKey.entityId = 'bound-workspace'
        xpert.workspaceId = 'other-workspace'
        await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).rejects.toBeInstanceOf(ForbiddenException)
    })

    it.each([SecretTokenBindingType.PUBLIC_XPERT, SecretTokenBindingType.USER_XPERT])(
        'preserves the %s audience',
        async (bindingType) => {
            const { access } = fixture()
            principal.principalType = 'client_secret'
            principal.clientSecretBindingType = bindingType
            principal.apiKey.type = ApiKeyBindingType.ASSISTANT
            principal.apiKey.entityId = 'bound-assistant'
            await expect(access.assertUnderstandingScope({ xpertId: 'xpert-1' })).rejects.toBeInstanceOf(
                ForbiddenException
            )
        }
    )
})
