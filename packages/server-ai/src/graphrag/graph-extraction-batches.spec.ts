import { extractGraphBatch, planGraphExtractionBatches } from './graph-extraction-batches'
import { runInNewContext } from 'node:vm'

const chunk = (id: string, pageContent: string) => ({ id, metadata: { chunkId: id }, pageContent })
const emptyGraph = { entities: [], relations: [] }
const parserError = () => Object.assign(new Error('Truncated output'), { lc_error_code: 'OUTPUT_PARSING_FAILURE' })

describe('Graph extraction batches', () => {
    it('handles parser errors from plugin VM realms and serialized provider errors', async () => {
        const foreignError: unknown = runInNewContext('new Error("OUTPUT_PARSING_FAILURE")')
        expect(foreignError).not.toBeInstanceOf(Error)
        for (const error of [foreignError, { message: 'Unexpected end of JSON input' }]) {
            const batch = planGraphExtractionBatches([chunk('a', 'one'), chunk('b', 'two')], 4, 100)[0]
            const invoke = jest.fn().mockRejectedValueOnce(error).mockResolvedValue(emptyGraph)
            expect(await extractGraphBatch(batch, invoke)).toHaveLength(2)
            expect(invoke).toHaveBeenCalledTimes(3)
        }
    })
    it('preserves all characters and chunk provenance when a batch exceeds the character budget', () => {
        const sources = [chunk('large', 'ABCDEFGHIJKLM'), chunk('small', 'tail'), chunk('empty', '')]
        const batches = planGraphExtractionBatches(sources, 4, 5)
        expect(batches.every((batch) => batch.reduce((sum, part) => sum + part.chunk.pageContent.length, 0) <= 5)).toBe(
            true
        )
        sources.forEach((source, index) => {
            const parts = batches.flat().filter((part) => part.sourceIndex === index)
            expect(parts.map((part) => part.chunk.pageContent).join('')).toBe(source.pageContent)
            expect(parts.filter((part) => part.lastPart)).toHaveLength(1)
            expect(parts.every((part) => part.chunk.metadata.chunkId === source.id)).toBe(true)
        })
    })

    it('retries parser failures as smaller batches and retains every successful result', async () => {
        const batch = planGraphExtractionBatches([chunk('a', 'one'), chunk('b', 'two')], 4, 100)[0]
        const invoke = jest.fn(async (parts: typeof batch) => {
            if (parts.length > 1) throw parserError()
            return emptyGraph
        })
        expect(await extractGraphBatch(batch, invoke)).toEqual([emptyGraph, emptyGraph])
        expect(invoke.mock.calls.map(([parts]) => parts.map((part) => part.chunk.id))).toEqual([
            ['a', 'b'],
            ['a'],
            ['b']
        ])
    })

    it('splits oversized singleton output with a bounded retry and no source loss', async () => {
        const content = 'x'.repeat(2400)
        const batch = planGraphExtractionBatches([chunk('a', content)], 1, 3000)[0]
        const accepted: string[] = []
        await extractGraphBatch(batch, async ([part]) => {
            if (part.chunk.pageContent.length > 1000) throw parserError()
            accepted.push(part.chunk.pageContent)
            return emptyGraph
        })
        expect(accepted.join('')).toBe(content)
        expect(accepted).toHaveLength(4)
    })

    it('fails without publishing partial results or echoing raw model JSON when retries are exhausted', async () => {
        const batch = planGraphExtractionBatches([chunk('a', 'small')], 1, 100)[0]
        const invoke = jest.fn(async () => {
            throw parserError()
        })
        await expect(extractGraphBatch(batch, invoke)).rejects.toThrow('smaller-batch retries')
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it('does not retry authorization, cancellation or evidence-validation failures', async () => {
        for (const error of [new Error('Forbidden'), new Error('Aborted'), new Error('Invalid evidence')]) {
            const invoke = jest.fn(async () => {
                throw error
            })
            await expect(
                extractGraphBatch(planGraphExtractionBatches([chunk('a', 'text')], 1, 100)[0], invoke)
            ).rejects.toBe(error)
            expect(invoke).toHaveBeenCalledTimes(1)
        }
    })
})
