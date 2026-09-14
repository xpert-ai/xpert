import { AiModelTypeEnum } from '@xpert-ai/contracts'
import {
    automaticTaggingMessages,
    normalizeAutomaticTagging,
    parseAutomaticTags,
    sampleDocumentText,
    samplePositions,
    selectTaggingModel
} from './automatic-tagging'

describe('automatic tagging classification boundary', () => {
    it('uses bounded defaults even for malformed persisted settings', () => {
        expect(normalizeAutomaticTagging(undefined)).toMatchObject({
            enabled: false,
            maxTags: 3,
            confidenceThreshold: 0.7,
            allowWithManualTags: false
        })
        expect(normalizeAutomaticTagging({ enabled: true, maxTags: 100, confidenceThreshold: NaN })).toMatchObject({
            enabled: true,
            maxTags: 10,
            confidenceThreshold: 0.7
        })
        expect(normalizeAutomaticTagging({ enabled: 'true', maxTags: -2 })).toMatchObject({
            enabled: false,
            maxTags: 1
        })
    })

    it('samples the beginning, middle and end within a fixed total budget', () => {
        const sample = sampleDocumentText({
            name: 'file.pdf'.repeat(1000),
            summary: 'existing summary'.repeat(2000),
            body: ['START' + 'b'.repeat(30000) + 'MIDDLE' + 'b'.repeat(30000) + 'END'],
            visual: ['OCR and image description'.repeat(3000)]
        })
        expect(sample.length).toBeLessThanOrEqual(12000)
        expect(sample).toContain('START')
        expect(sample).toContain('MIDDLE')
        expect(sample).toContain('END')
        expect(sample).toContain('existing summary')
        expect(sample).toContain('OCR and image description')
        expect(samplePositions(1000, 12)).toHaveLength(12)
        expect(samplePositions(1000, 12)).toEqual(samplePositions(1000, 12))
        expect(samplePositions(1000, 12)).toEqual(expect.arrayContaining([0, 999]))
    })

    it('sends numbered labels without their database ids and explicitly allows abstention', () => {
        const messages = automaticTaggingMessages(
            [{ id: 'secret-tag-id', name: 'Finance', description: 'Invoices' }],
            'document',
            3
        )
        const serialized = JSON.stringify(messages)
        expect(serialized).not.toContain('secret-tag-id')
        expect(serialized).toContain('Finance')
        expect(serialized).toContain('confidence')
        expect(messages[0].content).toContain('{"tags":[]}')
        expect(JSON.parse(messages[1].content).candidates[0]).toEqual({
            number: 1,
            name: 'Finance',
            description: 'Invoices'
        })
    })

    it('rejects invalid JSON envelopes and filters invalid numbers, scores and duplicate selections', () => {
        const candidates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
        const result = parseAutomaticTags(
            JSON.stringify({
                tags: [
                    { number: 1, confidence: 0.8 },
                    { number: 1, confidence: 0.95 },
                    { number: 2, confidence: 0.4 },
                    { number: 3, confidence: 0.9 },
                    { number: 0, confidence: 1 },
                    { number: 4, confidence: 1 },
                    { number: '2', confidence: 1 },
                    { number: 1.5, confidence: 1 },
                    { number: 2, confidence: 1.1 },
                    { number: 2, confidence: '0.9' },
                    { id: 'b', confidence: 1 }
                ]
            }),
            candidates,
            0.7,
            1
        )
        expect(result).toEqual([{ tagId: 'a', confidence: 0.95 }])
        expect(parseAutomaticTags('{"tags":[]}', candidates, 0.7, 3)).toEqual([])
        for (const text of ['```json\n{"tags":[]}\n```', '{"tags":[],"explanation":"x"}', '{"tags":"a"}', 'null']) {
            expect(() => parseAutomaticTags(text, candidates, 0.7, 3)).toThrow()
        }
    })

    it('prefers the dedicated LLM, falls back only when unconfigured, and never uses embeddings', () => {
        const general = { model: 'general', copilotId: 'provider', modelType: AiModelTypeEnum.LLM }
        const dedicated = { ...general, model: 'dedicated' }
        expect(selectTaggingModel({ model: dedicated }, general)).toMatchObject({
            model: 'dedicated',
            options: { temperature: 0 }
        })
        expect(selectTaggingModel({}, general)).toMatchObject({ model: 'general' })
        expect(selectTaggingModel({}, { ...general, modelType: AiModelTypeEnum.TEXT_EMBEDDING })).toBeNull()
        expect(selectTaggingModel({}, undefined)).toBeNull()
    })
})
