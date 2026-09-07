import { BadRequestException } from '@nestjs/common'
import { KnowledgebaseTypeEnum, TKBRecallParams } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { XpertWorkspaceBaseService } from '../xpert-workspace'

describe('Knowledgebase retrieval settings persistence', () => {
    function setup(overrides: Partial<Knowledgebase> = {}) {
        const stored = Object.assign(new Knowledgebase(), {
            id: 'kb-1',
            name: 'Knowledgebase',
            type: KnowledgebaseTypeEnum.Standard,
            wikiConfig: { enabled: true, extractionGranularity: 'standard' },
            graphRag: { enabled: true },
            recall: { mode: 'vector' },
            ...overrides
        })
        const service = Object.create(KnowledgebaseService.prototype) as KnowledgebaseService
        jest.spyOn(service, 'assertKnowledgebaseWriteAccess').mockResolvedValue(stored)
        const save = jest
            .spyOn(XpertWorkspaceBaseService.prototype, 'save')
            .mockImplementation(async (entity) => entity)
        return { service, stored, save }
    }

    afterEach(() => jest.restoreAllMocks())

    it.each(['graph', 'hybrid'] as const)(
        'rejects saving Wiki-only %s defaults with no usable source',
        async (mode) => {
            const { service, save } = setup()
            await expect(
                service.update('kb-1', {
                    recall: {
                        contentScope: 'wiki',
                        mode,
                        fusion: { mode: 'weighted_rrf', weights: { vector: 0, keyword: 0, graph: 1 } }
                    }
                })
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(save).not.toHaveBeenCalled()
        }
    )

    it.each(['vector', 'keyword', 'hybrid'] as const)(
        'accepts Wiki-only %s defaults with a usable source',
        async (mode) => {
            const { service } = setup()
            const result = await service.update('kb-1', {
                recall: {
                    contentScope: 'wiki',
                    mode,
                    fusion: { mode: 'weighted_rrf', weights: { vector: 1, keyword: 1, graph: 1 } }
                }
            })
            expect(result.recall.contentScope).toBe('wiki')
        }
    )

    it('ignores inactive Wiki scope when Wiki is disabled', async () => {
        const { service } = setup({ wikiConfig: { enabled: false, extractionGranularity: 'standard' } })
        await expect(service.update('kb-1', { recall: { contentScope: 'wiki', mode: 'graph' } })).resolves.toBeDefined()
    })

    it('does not block unrelated edits to an older invalid configuration', async () => {
        const { service } = setup({ recall: { contentScope: 'wiki', mode: 'graph' } })
        await expect(service.update('kb-1', { description: 'new description' })).resolves.toBeDefined()
    })

    it('clears a saved FAQ threshold through the serialized update while preserving other recall fields', async () => {
        const { service, stored } = setup({
            type: KnowledgebaseTypeEnum.FAQ,
            recall: { mode: 'vector', topK: 12, rerankThreshold: 0.6 }
        })
        const recall: TKBRecallParams = JSON.parse('{"rerankThreshold":null}')
        await service.update('kb-1', { recall })
        expect(stored.recall).toMatchObject({ topK: 12, mode: 'vector', rerankThreshold: null })
    })

    it('rejects invalid Wiki defaults at creation before any database write', async () => {
        const { service, save } = setup()
        const repository = { findOneOrFail: jest.fn().mockRejectedValue(new Error('not found')) }
        Object.defineProperty(service, 'repository', { value: repository as unknown as Repository<Knowledgebase> })
        await expect(
            service.create({
                name: 'Invalid Wiki',
                wikiConfig: { enabled: true, extractionGranularity: 'standard' },
                chatModel: { copilotId: 'copilot-1', model: 'wiki-model' },
                graphRag: { enabled: true },
                recall: { mode: 'graph', contentScope: 'wiki' }
            })
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(repository.findOneOrFail).not.toHaveBeenCalled()
        expect(save).not.toHaveBeenCalled()
    })
})
