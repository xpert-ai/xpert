import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { AiModelTypeEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { createEmbeddingFingerprint } from '../embedding/embedding-state'
import { Knowledgebase } from '../persistence/knowledgebase.entity'
import { createService, runInRequestContext } from '../testing/knowledgebase-service.fixture'

function fixture(type: KnowledgebaseTypeEnum | null | undefined) {
    const knowledgebase = Object.assign(new Knowledgebase(), {
        id: 'kb-legacy',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        type,
        documentNum: 3,
        description: 'Before',
        wikiConfig: null,
        wikiStatus: 'disabled',
        chatModel: { model: 'chat-model', modelType: AiModelTypeEnum.LLM, copilotId: null },
        copilotModel: { model: 'embedding-model', modelType: AiModelTypeEnum.TEXT_EMBEDDING, copilotId: null }
    })
    const save = jest.fn(async (entity: Knowledgebase) => entity)
    const workspaceAccess = jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } })
    const queryBus = { execute: jest.fn() }
    const repository = { findOne: jest.fn().mockResolvedValue(knowledgebase), delete: jest.fn(), save }
    const service = createService({
        repository,
        commandBus: { execute: jest.fn() },
        queryBus,
        xpertService: { updateXpert: jest.fn() },
        workspaceAccessService: { assertCan: workspaceAccess }
    })
    return { knowledgebase, service, save, workspaceAccess, queryBus }
}

describe('legacy knowledgebase configuration', () => {
    afterEach(() => jest.restoreAllMocks())

    it.each([null, undefined])('saves ordinary settings with type %s and Wiki disabled', async (type) => {
        const f = fixture(type)
        const chatModel = { copilotId: 'selected-chat', model: 'chat-model', modelType: AiModelTypeEnum.LLM }
        const saved = await runInRequestContext(() =>
            f.service.updateWikiConfiguration('kb-legacy', {
                wikiConfig: { enabled: false, extractionGranularity: 'standard' },
                settings: { description: 'After', chatModel }
            })
        )
        expect(f.save).toHaveBeenCalledTimes(1)
        expect(saved).toMatchObject({ type, description: 'After', chatModel, wikiStatus: 'disabled' })
        expect(f.workspaceAccess).toHaveBeenCalled()
    })

    it('saves an explicitly selected embedding connection without rebuilding an unchanged index', async () => {
        const f = fixture(null)
        const modelProvider = { id: 'provider-1', providerName: 'test-provider' }
        f.queryBus.execute.mockResolvedValue({ id: 'selected-embedding', modelProvider })
        const copilotModel = {
            copilotId: 'selected-embedding',
            model: 'embedding-model',
            modelType: AiModelTypeEnum.TEXT_EMBEDDING,
            options: { dimensions: 1024 }
        }
        Object.assign(f.knowledgebase, {
            copilotModelId: 'old-binding',
            embeddingCollectionName: 'existing-index',
            embeddingRevision: 2,
            embeddingDimensions: 1024,
            embeddingModelFingerprint: createEmbeddingFingerprint({
                provider: modelProvider.providerName,
                model: copilotModel.model,
                dimensions: 1024,
                options: copilotModel.options,
                providerConfig: {
                    providerId: modelProvider.id,
                    providerName: modelProvider.providerName,
                    providerType: null,
                    options: null
                }
            })
        })
        const rebuild = jest.spyOn(f.service, 'startEmbeddingRebuild')
        const saved = await runInRequestContext(() =>
            f.service.updateWikiConfiguration('kb-legacy', {
                wikiConfig: { enabled: false, extractionGranularity: 'standard' },
                settings: { copilotModel }
            })
        )
        expect(f.save).toHaveBeenCalledWith(
            expect.objectContaining({ copilotModel: expect.objectContaining(copilotModel) })
        )
        expect(saved.copilotModel).toMatchObject(copilotModel)
        expect(saved.copilotModelId).not.toBe('old-binding')
        expect(saved.embeddingCollectionName).toBe('existing-index')
        expect(saved.embeddingRevision).toBe(2)
        expect(rebuild).not.toHaveBeenCalled()
    })

    it.each([KnowledgebaseTypeEnum.FAQ, KnowledgebaseTypeEnum.External])(
        'still rejects the Wiki settings endpoint for %s even with Wiki disabled',
        async (type) => {
            const f = fixture(type)
            await expect(
                runInRequestContext(() =>
                    f.service.updateWikiConfiguration('kb-legacy', {
                        wikiConfig: { enabled: false, extractionGranularity: 'standard' },
                        settings: { description: 'After' }
                    })
                )
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(f.save).not.toHaveBeenCalled()
            expect(f.knowledgebase.description).toBe('Before')
        }
    )

    it('does not save ordinary settings when enabling Wiki on a non-empty legacy library', async () => {
        const f = fixture(null)
        await expect(
            runInRequestContext(() =>
                f.service.updateWikiConfiguration('kb-legacy', {
                    wikiConfig: { enabled: true, extractionGranularity: 'standard' },
                    confirmModelCharges: true,
                    settings: { description: 'After' }
                })
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(f.save).not.toHaveBeenCalled()
        expect(f.knowledgebase.description).toBe('Before')
    })

    it('preserves workspace authorization for legacy settings saves', async () => {
        const f = fixture(null)
        f.workspaceAccess.mockRejectedValue(new ForbiddenException())
        await expect(
            runInRequestContext(() =>
                f.service.updateWikiConfiguration('kb-legacy', {
                    wikiConfig: { enabled: false, extractionGranularity: 'standard' },
                    settings: { description: 'After' }
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.save).not.toHaveBeenCalled()
        expect(f.knowledgebase.description).toBe('Before')
    })
})
