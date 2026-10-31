import { BadRequestException } from '@nestjs/common'
import { AiModelTypeEnum, KnowledgebasePermission, KnowledgebaseTypeEnum, RolesEnum } from '@xpert-ai/contracts'

import { Knowledgebase } from '../persistence/knowledgebase.entity'

import {
    KnowledgebaseRepositoryMock,
    runInRequestContext,
    createService
} from '../testing/knowledgebase-service.fixture'

describe('Knowledgebase wiki', () => {
    beforeEach(() => jest.clearAllMocks())
    afterEach(() => jest.restoreAllMocks())
    it('creates a Wiki knowledgebase without a separate organization feature grant', async () => {
        const repository = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn().mockRejectedValue(new Error('not found')),
            delete: jest.fn(),
            create: jest.fn().mockImplementation((entity) => entity),
            save: jest.fn().mockImplementation(async (entity) => entity)
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        const result = await runInRequestContext(() =>
            service.create({
                name: 'Wiki knowledgebase',
                type: KnowledgebaseTypeEnum.Standard,
                chatModel: {
                    copilotId: 'copilot-1',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'chat-model'
                },
                wikiConfig: {
                    enabled: true,
                    extractionGranularity: 'focused',
                    contentGenerationRequirements: '',
                    extractionFocus: ''
                }
            })
        )

        expect(result).toEqual(
            expect.objectContaining({
                wikiConfig: {
                    enabled: true,
                    extractionGranularity: 'focused',
                    contentGenerationRequirements: '',
                    extractionFocus: ''
                },
                wikiStatus: 'ready',
                wikiAvailability: 'ready',
                wikiRevision: 0,
                wikiActiveRevision: 0,
                wikiStagedRevision: null,
                wikiGeneratorVersion: 'wiki-v1',
                wikiConfigFingerprint: expect.any(String)
            })
        )
    })

    it('requires a chat model before enabling Wiki', async () => {
        const save = jest.fn()
        const repository = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn().mockRejectedValue(new Error('not found')),
            delete: jest.fn(),
            create: jest.fn(),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        await expect(
            runInRequestContext(() =>
                service.create({
                    name: 'Wiki without chat model',
                    type: KnowledgebaseTypeEnum.Standard,
                    wikiConfig: {
                        enabled: true,
                        extractionGranularity: 'standard'
                    }
                })
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(save).not.toHaveBeenCalled()
    })

    it('allows a dedicated Wiki model when the general LLM is not configured', async () => {
        const wikiModel = {
            copilotId: 'copilot-1',
            modelType: AiModelTypeEnum.LLM,
            model: 'wiki-model'
        }
        const repository = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn().mockRejectedValue(new Error('not found')),
            delete: jest.fn(),
            create: jest.fn().mockImplementation((entity) => entity),
            save: jest.fn().mockImplementation(async (entity) => entity)
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() }
        })

        const result = await runInRequestContext(() =>
            service.create({
                name: 'Wiki model knowledgebase',
                type: KnowledgebaseTypeEnum.Standard,
                wikiModel,
                wikiConfig: { enabled: true, extractionGranularity: 'standard' }
            })
        )

        expect(result).toEqual(expect.objectContaining({ wikiModel, wikiStatus: 'ready' }))
    })

    it.each([
        { currentEnabled: false, nextEnabled: true },
        { currentEnabled: true, nextEnabled: false }
    ])(
        'rejects changing the Wiki index strategy from $currentEnabled to $nextEnabled after documents have been added',
        async ({ currentEnabled, nextEnabled }) => {
            const knowledgebase = Object.assign(new Knowledgebase(), {
                id: 'kb-wiki',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                createdById: 'owner-user',
                permission: KnowledgebasePermission.Private,
                type: KnowledgebaseTypeEnum.Standard,
                documentNum: 3,
                chatModelId: 'chat-model-1',
                chatModel: {
                    id: 'chat-model-1',
                    copilotId: 'copilot-1',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'chat-model'
                },
                wikiModel: { id: 'wiki-model-old' },
                wikiModelId: 'wiki-model-old',
                wikiConfig: { enabled: currentEnabled, extractionGranularity: 'standard' },
                wikiStatus: currentEnabled ? 'ready' : 'disabled',
                wikiAvailability: currentEnabled ? 'ready' : 'unavailable'
            })
            const save = jest.fn().mockImplementation(async (entity) => entity)
            const repository = {
                findOne: jest.fn().mockResolvedValue(knowledgebase),
                delete: jest.fn(),
                save
            } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
            const service = createService({
                repository,
                commandBus: { execute: jest.fn() },
                xpertService: { updateXpert: jest.fn() },
                workspaceAccessService: {
                    assertCan: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } })
                }
            })

            const input = {
                wikiModel: null,
                wikiConfig: {
                    enabled: nextEnabled,
                    extractionGranularity: 'exhaustive' as const,
                    contentGenerationRequirements: '  Prefer timelines. ',
                    extractionFocus: ' Products and versions. '
                }
            }
            await expect(
                runInRequestContext(
                    () => service.updateWikiConfiguration('kb-wiki', { ...input, confirmModelCharges: true }),
                    'owner-user',
                    RolesEnum.AI_BUILDER
                )
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(save).not.toHaveBeenCalled()
        }
    )

    it('saves ordinary and Wiki settings together with the new general LLM fallback', async () => {
        const knowledgebase = Object.assign(new Knowledgebase(), {
            id: 'kb-wiki',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            type: KnowledgebaseTypeEnum.Standard,
            documentNum: 0,
            description: 'Before',
            wikiConfig: { enabled: false, extractionGranularity: 'standard' }
        })
        const save = jest.fn(async (entity: Knowledgebase) => entity)
        const service = createService({
            repository: {
                findOne: jest.fn().mockResolvedValue(knowledgebase),
                delete: jest.fn(),
                save
            } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            workspaceAccessService: { assertCan: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } }) }
        })
        const chatModel = { id: 'chat-1', copilotId: 'copilot-1', modelType: AiModelTypeEnum.LLM, model: 'new-llm' }
        const input = {
            wikiConfig: { enabled: true, extractionGranularity: 'standard' as const },
            settings: { description: 'After', chatModel }
        }
        const saved = await runInRequestContext(() => service.updateWikiConfiguration('kb-wiki', input))
        expect(save).toHaveBeenCalledTimes(1)
        expect(saved).toMatchObject({
            description: 'After',
            chatModel,
            wikiConfig: { enabled: true },
            wikiStatus: 'ready'
        })
    })

    it('does not persist ordinary settings when the Wiki strategy change is rejected', async () => {
        const knowledgebase = Object.assign(new Knowledgebase(), {
            id: 'kb-wiki',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            type: KnowledgebaseTypeEnum.Standard,
            documentNum: 3,
            description: 'Before',
            wikiConfig: { enabled: false, extractionGranularity: 'standard' }
        })
        const save = jest.fn()
        const service = createService({
            repository: {
                findOne: jest.fn().mockResolvedValue(knowledgebase),
                delete: jest.fn(),
                save
            } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            workspaceAccessService: { assertCan: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } }) }
        })
        const input = {
            wikiConfig: { enabled: true, extractionGranularity: 'standard' as const },
            settings: { description: 'After' }
        }
        await expect(
            runInRequestContext(() => service.updateWikiConfiguration('kb-wiki', input))
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(save).not.toHaveBeenCalled()
        expect(knowledgebase.description).toBe('Before')
    })

    it('updates Wiki generation settings without a separate organization feature grant', async () => {
        const knowledgebase = Object.assign(new Knowledgebase(), {
            id: 'kb-wiki',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            createdById: 'owner-user',
            permission: KnowledgebasePermission.Private,
            type: KnowledgebaseTypeEnum.Standard,
            documentNum: 3,
            chatModel: {
                id: 'chat-model-1',
                copilotId: 'copilot-1',
                modelType: AiModelTypeEnum.LLM,
                model: 'chat-model'
            },
            wikiConfig: { enabled: true, extractionGranularity: 'standard' },
            wikiStatus: 'ready',
            wikiAvailability: 'ready',
            wikiConfigFingerprint: 'old-fingerprint'
        })
        const save = jest.fn().mockImplementation(async (entity) => entity)
        const repository = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn(),
            save
        } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            workspaceAccessService: {
                assertCan: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } })
            }
        })

        const result = await runInRequestContext(
            () =>
                service.updateWikiConfiguration('kb-wiki', {
                    wikiConfig: {
                        enabled: true,
                        extractionGranularity: 'exhaustive',
                        contentGenerationRequirements: 'Prefer timelines.',
                        extractionFocus: 'Products and versions.'
                    },
                    confirmModelCharges: true
                }),
            'owner-user',
            RolesEnum.AI_BUILDER
        )

        expect(result).toEqual(
            expect.objectContaining({
                wikiConfig: {
                    enabled: true,
                    extractionGranularity: 'exhaustive',
                    contentGenerationRequirements: 'Prefer timelines.',
                    extractionFocus: 'Products and versions.'
                },
                wikiStatus: 'rebuild_required'
            })
        )
        expect(save).toHaveBeenCalledTimes(1)
    })

    it.each([KnowledgebaseTypeEnum.FAQ, KnowledgebaseTypeEnum.External])(
        'rejects Wiki enablement for %s knowledgebases',
        async (type) => {
            const save = jest.fn()
            const repository = {
                findOne: jest.fn(),
                findOneOrFail: jest.fn().mockRejectedValue(new Error('not found')),
                delete: jest.fn(),
                create: jest.fn(),
                save
            } as unknown as jest.Mocked<KnowledgebaseRepositoryMock>
            const service = createService({
                repository,
                commandBus: { execute: jest.fn() },
                xpertService: { updateXpert: jest.fn() }
            })

            await expect(
                runInRequestContext(() =>
                    service.create({
                        name: `${type} Wiki knowledgebase`,
                        type,
                        chatModelId: 'chat-model-1',
                        wikiConfig: {
                            enabled: true,
                            extractionGranularity: 'standard'
                        }
                    })
                )
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(save).not.toHaveBeenCalled()
        }
    )
})
