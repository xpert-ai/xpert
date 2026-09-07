import { BadRequestException } from '@nestjs/common'
import { AiModelTypeEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import {
    createKnowledgeWikiConfigFingerprint,
    KNOWLEDGE_WIKI_GENERATOR_VERSION,
    parseKnowledgebaseWikiConfig,
    prepareKnowledgeWikiCreateState,
    resolveKnowledgeWikiModel
} from './knowledge-wiki-config'

describe('knowledge Wiki configuration fingerprint', () => {
    it('is deterministic and changes with the generation contract', () => {
        const standard = createKnowledgeWikiConfigFingerprint({
            enabled: true,
            extractionGranularity: 'standard'
        })

        expect(standard).toBe(
            createKnowledgeWikiConfigFingerprint({ enabled: true, extractionGranularity: 'standard' })
        )
        expect(standard).not.toBe(
            createKnowledgeWikiConfigFingerprint({ enabled: true, extractionGranularity: 'focused' })
        )
        expect(KNOWLEDGE_WIKI_GENERATOR_VERSION).toMatch(/^wiki-v\d+$/)
    })

    it('uses the effective model configuration rather than a persistence id in the fingerprint', () => {
        const config = { enabled: true, extractionGranularity: 'standard' as const }
        const first = createKnowledgeWikiConfigFingerprint(config, {
            copilotId: 'copilot-1',
            modelType: AiModelTypeEnum.LLM,
            model: 'model-a',
            options: { temperature: 0.1, top_p: 0.9 }
        })

        expect(first).toBe(
            createKnowledgeWikiConfigFingerprint(config, {
                copilotId: 'copilot-1',
                modelType: AiModelTypeEnum.LLM,
                model: 'model-a',
                options: { top_p: 0.9, temperature: 0.1 }
            })
        )
        expect(first).not.toBe(
            createKnowledgeWikiConfigFingerprint(config, {
                copilotId: 'copilot-1',
                modelType: AiModelTypeEnum.LLM,
                model: 'model-a',
                options: { temperature: 0.2, top_p: 0.9 }
            })
        )
    })

    it('initializes an enabled empty knowledgebase without a model call', () => {
        expect(
            prepareKnowledgeWikiCreateState({
                type: KnowledgebaseTypeEnum.Standard,
                chatModel: {
                    copilotId: 'copilot-1',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'chat-model'
                },
                wikiConfig: { enabled: true, extractionGranularity: 'focused' }
            })
        ).toMatchObject({
            wikiConfig: { enabled: true, extractionGranularity: 'focused' },
            wikiStatus: 'ready',
            wikiAvailability: 'ready',
            wikiRevision: 0,
            wikiActiveRevision: 0,
            wikiStagedRevision: null,
            wikiGeneratorVersion: KNOWLEDGE_WIKI_GENERATOR_VERSION,
            wikiConfigFingerprint: expect.any(String)
        })
    })

    it('uses a dedicated Wiki model and falls back to the knowledgebase LLM when it is absent', () => {
        const chatModel = { copilotId: 'copilot-1', model: 'chat' }
        const wikiModel = { copilotId: 'copilot-1', model: 'wiki' }

        expect(resolveKnowledgeWikiModel({ chatModel, wikiModel })).toBe(wikiModel)
        expect(resolveKnowledgeWikiModel({ chatModel, wikiModel: null })).toBe(chatModel)
    })

    it('bounds and normalizes the two custom Wiki instructions', () => {
        expect(
            parseKnowledgebaseWikiConfig({
                enabled: true,
                extractionGranularity: 'standard',
                contentGenerationRequirements: '  Prefer timelines.  ',
                extractionFocus: '  Products and versions.  '
            })
        ).toEqual({
            enabled: true,
            extractionGranularity: 'standard',
            contentGenerationRequirements: 'Prefer timelines.',
            extractionFocus: 'Products and versions.'
        })

        expect(() =>
            parseKnowledgebaseWikiConfig({
                enabled: true,
                extractionGranularity: 'standard',
                contentGenerationRequirements: 'x'.repeat(4001),
                extractionFocus: ''
            })
        ).toThrow(BadRequestException)
    })

    it('requires a chat model and rejects unsupported knowledgebase types', () => {
        expect(() =>
            prepareKnowledgeWikiCreateState({
                type: KnowledgebaseTypeEnum.Standard,
                wikiConfig: { enabled: true, extractionGranularity: 'standard' }
            })
        ).toThrow(BadRequestException)
        expect(() =>
            prepareKnowledgeWikiCreateState({
                type: KnowledgebaseTypeEnum.FAQ,
                wikiConfig: { enabled: false, extractionGranularity: 'standard' }
            })
        ).toThrow(BadRequestException)
    })

    it('rejects client-supplied server state before normalization', () => {
        expect(() =>
            prepareKnowledgeWikiCreateState({
                type: KnowledgebaseTypeEnum.Standard,
                wikiStatus: 'ready'
            })
        ).toThrow(BadRequestException)
    })
})
