import { AiModelTypeEnum, RolesEnum, TCopilotModel } from '@xpert-ai/contracts'
import { RequestContext, SYSTEM_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
import { ConflictException } from '@nestjs/common'
import { PluginApplicationService } from './plugin-application.service'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import { PluginTemplateInstallCommand } from './commands/install-template.command'
import { XpertPublishCommand } from '../xpert/commands/publish.command'
import { FindCopilotModelsQuery } from '../copilot/queries'
import { Xpert } from '../xpert/xpert.entity'
import { createSpeechModelRepairDraft } from '../xpert/publication/speech-model-repair'

const model: TCopilotModel = {
    copilotId: 'speech-provider',
    model: 'speech/model',
    modelType: AiModelTypeEnum.SPEECH2TEXT
}
const input = {
    pluginName: '@acme/meetings',
    appName: 'meetings',
    operationId: 'op',
    speechToTextModelId: 'speech-provider/speech%2Fmodel'
}

function fixture(existing = false) {
    let installation: PluginApplicationInstallation | null = existing
        ? Object.assign(new PluginApplicationInstallation(), {
              id: 'install',
              pluginName: input.pluginName,
              appName: input.appName,
              status: 'ready',
              declaredScope: 'organization',
              scopeKey: 'org',
              tenantId: 'tenant',
              organizationId: 'org',
              workspaceId: 'workspace',
              xpertId: 'assistant'
          })
        : null
    const assistant = Object.assign(new Xpert(), {
        id: 'assistant',
        slug: 'meetings',
        tenantId: 'tenant',
        organizationId: 'org',
        workspaceId: 'workspace',
        version: '1',
        publishAt: new Date(),
        features: {},
        graph: { nodes: [], connections: [] }
    })
    const installationRepo = {
        findOne: jest.fn(async () => installation),
        create: jest.fn((value) => Object.assign(new PluginApplicationInstallation(), { id: 'install' }, value)),
        save: jest.fn(async (value: PluginApplicationInstallation) => {
            installation = value
            return value
        }),
        update: jest.fn(async (_where, value) => {
            Object.assign(installation, value)
            return { affected: 1 }
        })
    }
    const queryBus = {
        execute: jest.fn(async (query) =>
            query instanceof FindCopilotModelsQuery
                ? [
                      {
                          id: model.copilotId,
                          providerWithModels: {
                              provider: 'speech',
                              models: [{ model: model.model, label: 'Speech', model_type: AiModelTypeEnum.SPEECH2TEXT }]
                          }
                      }
                  ]
                : null
        )
    }
    const xperts = {
        validateName: jest.fn(async () => true),
        assertCanAuthorById: jest.fn(async () => undefined),
        findOne: jest.fn(async () => assistant)
    }
    const commandBus = {
        execute: jest.fn(async (command) => {
            if (command instanceof PluginTemplateInstallCommand) {
                assistant.features = {
                    ...assistant.features,
                    speechToText: { enabled: true, copilotModel: command.basic.speechToTextModel }
                }
                return { xpert: assistant }
            }
            if (command instanceof XpertPublishCommand) {
                assistant.features = createSpeechModelRepairDraft(assistant, command.speechToTextModel).team.features
                return assistant
            }
            throw new Error('Unexpected command')
        })
    }
    const workspaceService = { create: jest.fn(async () => ({ id: 'workspace' })), delete: jest.fn() }
    const service = new PluginApplicationService(
        {} as never,
        installationRepo as never,
        { findOne: jest.fn(async () => ({ id: 'workspace' })), exists: jest.fn(async () => true) } as never,
        {} as never,
        { findOne: jest.fn(async () => assistant), exists: jest.fn(async () => true) } as never,
        workspaceService as never,
        {} as never,
        xperts as never,
        commandBus as never,
        queryBus as never,
        [
            {
                name: input.pluginName,
                packageName: input.pluginName,
                scopeKey: SYSTEM_GLOBAL_SCOPE,
                instance: {
                    meta: {
                        name: input.pluginName,
                        version: '1',
                        targetAppMeta: {
                            xpert: {
                                marketplace: {
                                    contents: [
                                        {
                                            type: 'app',
                                            name: input.appName,
                                            appConfig: {
                                                scope: 'organization',
                                                assistantTemplateKey: 'meetings',
                                                workspace: { mode: 'dedicated', name: 'Meetings' },
                                                modelRequirements: { speechToText: true }
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        ] as never
    )
    Object.assign(service, {
        applicationAccess: {
            assertMembership: jest.fn().mockResolvedValue(undefined),
            assertCanInitialize: jest.fn().mockResolvedValue(undefined)
        },
        applicationToolsets: {
            preflight: jest.fn(async () => []),
            prepare: jest.fn(async () => []),
            ensure: jest.fn(),
            rollback: jest.fn(async () => undefined),
            healthy: jest.fn(async () => true)
        }
    })
    return { service, queryBus, commandBus, xperts, assistant, installationRepo, workspaceService }
}

describe('Application speech model initialization and repair', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('author')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as never)
    })
    afterEach(() => jest.restoreAllMocks())

    it('lists speech models and binds the validated choice before the template is published', async () => {
        const f = fixture()
        const detail = await f.service.getDetail(input.pluginName, input.appName)
        expect(detail.preflight).toMatchObject({
            canInitialize: true,
            speechToTextModels: [{ id: input.speechToTextModelId }]
        })
        expect(f.queryBus.execute).toHaveBeenCalledWith(new FindCopilotModelsQuery(AiModelTypeEnum.SPEECH2TEXT))
        await expect(f.service.initialize(input)).resolves.toMatchObject({ status: 'ready', xpertId: 'assistant' })
        expect(f.commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                basic: expect.objectContaining({ speechToTextModel: model }),
                publish: true
            })
        )
    })

    it('blocks activation without available speech models before allocating resources', async () => {
        const f = fixture()
        f.queryBus.execute.mockResolvedValue([])
        expect((await f.service.getDetail(input.pluginName, input.appName)).preflight).toMatchObject({
            canInitialize: false,
            reason: 'speech_to_text_model_required',
            speechToTextModels: []
        })
        await expect(f.service.initialize(input)).rejects.toThrow()
        expect(f.workspaceService.create).not.toHaveBeenCalled()
        expect(f.commandBus.execute).not.toHaveBeenCalled()
    })

    it.each([undefined, 'other-org/model', 'speech-provider/unknown'])(
        'rejects an unselected or unauthorized model: %s',
        async (id) => {
            const f = fixture()
            await expect(f.service.initialize({ ...input, speechToTextModelId: id })).rejects.toThrow()
            expect(f.installationRepo.save).not.toHaveBeenCalled()
            expect(f.commandBus.execute).not.toHaveBeenCalled()
        }
    )

    it('rejects a chat model returned by a provider instead of a speech model', async () => {
        const f = fixture()
        f.queryBus.execute.mockResolvedValue([
            {
                id: model.copilotId,
                providerWithModels: {
                    provider: 'speech',
                    models: [{ model: model.model, label: 'Chat', model_type: AiModelTypeEnum.LLM }]
                }
            }
        ])
        await expect(f.service.initialize(input)).rejects.toThrow()
        expect(f.workspaceService.create).not.toHaveBeenCalled()
        expect(f.commandBus.execute).not.toHaveBeenCalled()
    })

    it('detects a legacy ready installation with no speech model and repairs the same Assistant', async () => {
        const f = fixture(true)
        expect((await f.service.getDetail(input.pluginName, input.appName)).status).toMatchObject({
            status: 'degraded',
            errorCode: 'speech_to_text_model_missing',
            xpertId: 'assistant'
        })
        await expect(f.service.initialize(input)).resolves.toMatchObject({ status: 'ready', xpertId: 'assistant' })
        expect(f.workspaceService.create).not.toHaveBeenCalled()
        expect(f.commandBus.execute).toHaveBeenCalledWith(XpertPublishCommand.repairSpeechModel('assistant', model))
        expect(f.assistant.features.speechToText.copilotModel).toEqual(model)
    })

    it('does not publish unrelated existing drafts during repair', async () => {
        const f = fixture(true)
        f.assistant.draft = { team: { title: 'Unreviewed changes' }, nodes: [], connections: [] }
        await expect(f.service.initialize(input)).rejects.toThrow(ConflictException)
        expect(f.assistant.draft.team.title).toBe('Unreviewed changes')
    })

    it('leaves a healthy installation and its selected model unchanged on idempotent retry', async () => {
        const f = fixture(true)
        f.assistant.features = { ...f.assistant.features, speechToText: { enabled: true, copilotModel: model } }
        await expect(f.service.initialize({ ...input, speechToTextModelId: 'other/model' })).resolves.toMatchObject({
            status: 'ready'
        })
        expect(f.queryBus.execute).not.toHaveBeenCalled()
        expect(f.commandBus.execute).not.toHaveBeenCalled()
    })
})
