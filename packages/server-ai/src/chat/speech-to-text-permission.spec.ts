import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import {
    AiModelTypeEnum,
    IApiPrincipal,
    IUser,
    RolesEnum,
    SecretTokenBindingType,
    UploadedFile
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { FileStorage } from '@xpert-ai/server-core'
import { FindOneOptions, Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertService } from '../xpert/xpert.service'
import { Xpert } from '../xpert/xpert.entity'
import { ResolveSpeechAssistantHandler } from '../xpert/queries/handlers/resolve-speech-assistant.handler'
import { ResolveSpeechAssistantQuery } from '../xpert/queries/resolve-speech-assistant.query'
import { FindXpertHandler } from '../xpert/queries/handlers/get-one.handler'
import { CopilotGetOneQuery } from '../copilot'
import { CopilotModelGetChatModelQuery } from '../copilot-model'
import { PluginSpeechToTextPermissionService } from './speech-to-text-permission'
import { SpeechToTextService } from './speech-to-text.service'

jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('@xpert-ai/server-core'),
    RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext
}))

// Persistence/provider transport are fixtures. CQRS dispatch, published and authoring
// policies, plugin permission entry and transcription use the production implementations.
describe('Speech-to-text Assistant authority integration', () => {
    let module: TestingModule
    let assistant: Xpert
    let actor: IUser
    let principal: IApiPrincipal | null
    let groupGrant: boolean
    let workspace: XpertWorkspace
    let access: XpertWorkspaceAccessService
    let xperts: XpertService
    let speech: SpeechToTextService
    let plugin: PluginSpeechToTextPermissionService
    let invoke: jest.Mock
    let putFile: jest.Mock
    let deleteFile: jest.Mock
    const file: UploadedFile = {
        fieldname: 'file',
        key: 'files/speech.wav',
        originalname: 'speech.wav',
        size: 12,
        encoding: '7bit',
        mimetype: 'audio/wav',
        filename: 'speech.wav',
        url: 'https://storage.example/speech.wav',
        path: '/tmp/speech.wav'
    }
    const input = () => ({
        xpertId: assistant.id,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        file: { data: Buffer.from('synthetic-audio'), originalName: 'speech.wav', mimeType: 'audio/wav' }
    })

    beforeEach(async () => {
        actor = { id: 'recipient', tenantId: 'tenant-1', role: { name: RolesEnum.VIEWER } } as IUser
        principal = null
        groupGrant = true
        jest.spyOn(RequestContext, 'currentTenantId').mockImplementation(() => actor.tenantId)
        jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => actor.id)
        jest.spyOn(RequestContext, 'currentUser').mockImplementation(() => actor)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockImplementation(() => principal)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        workspace = Object.assign(new XpertWorkspace(), {
            id: 'authoring-workspace',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'author',
            members: [],
            settings: { access: { visibility: 'private' } }
        })
        assistant = Object.assign(new Xpert(), {
            id: 'assistant-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            createdById: 'author',
            workspaceId: workspace.id,
            workspace,
            publishAt: new Date(),
            features: {
                speechToText: {
                    enabled: true,
                    copilotModel: {
                        copilotId: 'speech-provider',
                        model: 'speech-model',
                        modelType: AiModelTypeEnum.SPEECH2TEXT
                    }
                }
            }
        })
        const records = new Map([
            [assistant.id, assistant],
            ['other-assistant', Object.assign(new Xpert(), { ...assistant, id: 'other-assistant' })]
        ])
        const query = () => {
            let requestedId: string | undefined
            const capture = (_condition: unknown, parameters?: { id?: string }) => {
                if (parameters?.id) requestedId = parameters.id
                return builder
            }
            const builder = {
                leftJoin: jest.fn().mockReturnThis(),
                where: jest.fn(capture),
                andWhere: jest.fn(capture),
                getCount: jest.fn(async () => (requestedId === assistant.id && groupGrant ? 1 : 0))
            }
            return builder
        }
        const repository = {
            findOne: jest.fn(async (options: FindOneOptions<Xpert>) => {
                const where = options.where
                if (!where || Array.isArray(where) || typeof where.id !== 'string') return null
                const item = records.get(where.id)
                return item && item.tenantId === where.tenantId && !(where.publishAt && !item.publishAt) ? item : null
            }),
            createQueryBuilder: jest.fn(query)
        } as unknown as Repository<Xpert>
        const runQuery = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            getRawOne: jest.fn(async () => null),
            getCount: jest.fn(async () => (groupGrant ? 1 : 0))
        }
        access = new XpertWorkspaceAccessService({
            findOne: jest.fn(async () => workspace),
            manager: { createQueryBuilder: () => runQuery }
        } as unknown as Repository<XpertWorkspace>)
        const published = new PublishedXpertAccessService(repository, access)
        xperts = new XpertService(repository, access, null, null, null, null, null, null, null, null)
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                ResolveSpeechAssistantHandler,
                FindXpertHandler,
                SpeechToTextService,
                PluginSpeechToTextPermissionService,
                { provide: PublishedXpertAccessService, useValue: published },
                { provide: XpertService, useValue: xperts }
            ]
        }).compile()
        await module.init()
        speech = module.get(SpeechToTextService)
        plugin = module.get(PluginSpeechToTextPermissionService)
        const queries = module.get(QueryBus)
        const execute = queries.execute.bind(queries)
        invoke = jest.fn(async () => ({ content: 'Synthetic transcript' }))
        jest.spyOn(queries, 'execute').mockImplementation(async (query) => {
            if (query instanceof CopilotGetOneQuery) return { id: 'speech-provider' }
            if (query instanceof CopilotModelGetChatModelQuery) return { invoke }
            return execute(query)
        })
        putFile = jest.fn(async () => file)
        deleteFile = jest.fn(async () => undefined)
        jest.spyOn(FileStorage.prototype, 'getProvider').mockReturnValue({
            name: 'fixture',
            url: jest.fn(),
            path: jest.fn(),
            handler: jest.fn(),
            getFile: jest.fn(),
            putFile,
            deleteFile
        })
    })

    afterEach(async () => {
        await module?.close()
        jest.restoreAllMocks()
    })

    it('transcribes for a shared recipient while authoring access stays denied', async () => {
        await expect(access.getCapabilities(workspace)).resolves.toMatchObject({ canRun: true, canRead: false })
        await expect(xperts.findOne(assistant.id)).rejects.toThrow(ForbiddenException)
        await expect(plugin.transcribe(input())).resolves.toEqual({ text: 'Synthetic transcript' })
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(deleteFile).toHaveBeenCalledWith(file.key)
        expect(RequestContext.currentUserId()).toBe('recipient')
    })

    it.each([
        'revoked',
        'other-assistant',
        'other-organization',
        'other-tenant',
        'missing-organization',
        'unpublished'
    ])('rejects %s before staging audio or invoking the provider', async (scenario) => {
        const request = input()
        if (scenario === 'revoked') groupGrant = false
        if (scenario === 'other-assistant') request.xpertId = 'other-assistant'
        if (scenario === 'other-organization') request.organizationId = 'org-other'
        if (scenario === 'other-tenant') request.tenantId = 'tenant-other'
        if (scenario === 'missing-organization')
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        if (scenario === 'unpublished') assistant.publishAt = null
        await expect(plugin.transcribe(request)).rejects.toThrow()
        expect(invoke).not.toHaveBeenCalled()
        expect(putFile).not.toHaveBeenCalled()
        expect(deleteFile).not.toHaveBeenCalled()
    })

    it('does not treat workspace run access as access to every Assistant in that workspace', async () => {
        await expect(access.getCapabilities(workspace)).resolves.toMatchObject({ canRun: true })
        await expect(speech.transcribeUploadedFile(file, { xpertId: 'other-assistant' })).rejects.toThrow(
            ForbiddenException
        )
        expect(invoke).not.toHaveBeenCalled()
    })

    it('requires a real actor before storing audio', async () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(null)
        await expect(plugin.transcribe(input())).rejects.toThrow('speech_to_text_actor_required')
        expect(putFile).not.toHaveBeenCalled()
        expect(invoke).not.toHaveBeenCalled()
    })

    it('rejects an Assistant from another organization even with a matching delegation', async () => {
        principal = { ...actor, principalType: 'api_key', resourceScope: { kind: 'assistant', xpertId: assistant.id } }
        assistant.organizationId = 'another-org'
        await expect(plugin.transcribe(input())).rejects.toThrow('speech_to_text_xpert_organization_mismatch')
        expect(putFile).not.toHaveBeenCalled()
        expect(invoke).not.toHaveBeenCalled()
    })

    it('permits draft transcription only for an author, and resolves the draft model', async () => {
        assistant.publishAt = null
        assistant.draft = {
            team: {
                features: {
                    ...assistant.features,
                    speechToText: {
                        enabled: true,
                        copilotModel: {
                            copilotId: 'draft-provider',
                            model: 'draft-speech',
                            modelType: AiModelTypeEnum.SPEECH2TEXT
                        }
                    }
                }
            },
            nodes: [],
            connections: []
        }
        await expect(speech.transcribeUploadedFile(file, { xpertId: assistant.id, isDraft: true })).rejects.toThrow(
            ForbiddenException
        )
        actor = { ...actor, id: 'author' }
        await expect(
            module.get(QueryBus).execute(new ResolveSpeechAssistantQuery(assistant.id, { isDraft: true }))
        ).resolves.toMatchObject({ features: { speechToText: { copilotModel: { model: 'draft-speech' } } } })
        await expect(speech.transcribeUploadedFile(file, { xpertId: assistant.id, isDraft: true })).resolves.toEqual({
            text: 'Synthetic transcript'
        })
        await expect(speech.transcribeUploadedFile(file, { xpertId: assistant.id })).rejects.toThrow(NotFoundException)
    })

    it('preserves exact service delegation and rejects cross-Assistant or draft use', async () => {
        groupGrant = false
        principal = { ...actor, principalType: 'api_key', resourceScope: { kind: 'assistant', xpertId: assistant.id } }
        await expect(plugin.transcribe(input())).resolves.toEqual({ text: 'Synthetic transcript' })
        await expect(plugin.transcribe({ ...input(), xpertId: 'other-assistant' })).rejects.toThrow(
            'speech_to_text_xpert_delegation_mismatch'
        )
        actor = { ...actor, id: 'author' }
        await expect(plugin.transcribe({ ...input(), isDraft: true })).rejects.toThrow(ForbiddenException)
    })

    it('revalidates a delegated human grant instead of granting service access', async () => {
        groupGrant = false
        principal = {
            ...actor,
            principalType: 'api_key',
            requestedUserId: actor.id,
            resourceScope: { kind: 'assistant', xpertId: assistant.id }
        }
        await expect(plugin.transcribe(input())).rejects.toThrow(ForbiddenException)
        expect(invoke).not.toHaveBeenCalled()
    })

    it('keeps public-session restrictions on the published-access path', async () => {
        principal = {
            ...actor,
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT,
            resourceScope: { kind: 'assistant', xpertId: assistant.id }
        }
        await expect(plugin.transcribe(input())).rejects.toThrow(ForbiddenException)
        expect(invoke).not.toHaveBeenCalled()
    })

    it('reports the next configuration error after shared-user authorization succeeds', async () => {
        assistant.features = { ...assistant.features, speechToText: { enabled: true } }
        await expect(plugin.transcribe(input())).rejects.toThrow('speech_to_text_model_missing')
        expect(invoke).not.toHaveBeenCalled()
    })
})
