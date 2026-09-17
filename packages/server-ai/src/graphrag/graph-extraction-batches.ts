// Invariants: every source character is submitted. Only parser failures are retried;
// shrinking a batch never converts a partial model response into published graph data.
import { IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
import { t } from 'i18next'
import { TDocChunkMetadata } from '../knowledge-document/types'
import { TKnowledgeGraphExtraction } from './types'

const logger = new Logger('KnowledgeGraphExtraction')

export type GraphExtractionPart = {
    chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>
    sourceIndex: number
    lastPart: boolean
}

export function planGraphExtractionBatches(
    chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
    batchSize: number,
    maxCharacters: number
): GraphExtractionPart[][] {
    const budget = Math.max(1, Math.floor(maxCharacters))
    const batches: GraphExtractionPart[][] = []
    let batch: GraphExtractionPart[] = []
    let characters = 0
    chunks.forEach((chunk, sourceIndex) => {
        const content = chunk.pageContent ?? ''
        for (let start = 0; start < Math.max(1, content.length); start += budget) {
            const text = content.slice(start, start + budget)
            if (batch.length && (batch.length >= batchSize || characters + text.length > budget)) {
                batches.push(batch)
                batch = []
                characters = 0
            }
            batch.push({
                chunk: { ...chunk, pageContent: text },
                sourceIndex,
                lastPart: start + budget >= content.length
            })
            characters += text.length
        }
    })
    if (batch.length) batches.push(batch)
    return batches
}

export function isGraphOutputParsingError(error: unknown): boolean {
    // Provider plugins can return errors from another VM realm or serialize them over RPC.
    // Use the external error contract, not instanceof Error, at this boundary.
    return (
        typeof error === 'object' &&
        error !== null &&
        (('name' in error && error.name === 'OutputParserException') ||
            ('lc_error_code' in error && error.lc_error_code === 'OUTPUT_PARSING_FAILURE') ||
            ('message' in error &&
                typeof error.message === 'string' &&
                /OUTPUT_PARSING_FAILURE|are not valid JSON|Unexpected end of JSON input/.test(error.message)))
    )
}

export async function extractGraphBatch(
    batch: GraphExtractionPart[],
    invoke: (parts: GraphExtractionPart[]) => Promise<TKnowledgeGraphExtraction>,
    depth = 0
): Promise<TKnowledgeGraphExtraction[]> {
    try {
        return [await invoke(batch)]
    } catch (error) {
        if (!isGraphOutputParsingError(error)) throw error
        logger.warn(
            `Structured output failed for ${batch.length} graph chunks; reducing batch (attempt depth ${depth}).`
        )
        if (depth < 8) {
            if (batch.length > 1) {
                const midpoint = Math.ceil(batch.length / 2)
                const left = await extractGraphBatch(batch.slice(0, midpoint), invoke, depth + 1)
                return [...left, ...(await extractGraphBatch(batch.slice(midpoint), invoke, depth + 1))]
            }
            const part = batch[0]
            const content = part.chunk.pageContent ?? ''
            if (content.length > 1000) {
                const midpoint = Math.ceil(content.length / 2)
                const left = await extractGraphBatch(
                    [{ ...part, chunk: { ...part.chunk, pageContent: content.slice(0, midpoint) }, lastPart: false }],
                    invoke,
                    depth + 1
                )
                return [
                    ...left,
                    ...(await extractGraphBatch(
                        [{ ...part, chunk: { ...part.chunk, pageContent: content.slice(midpoint) } }],
                        invoke,
                        depth + 1
                    ))
                ]
            }
        }
        const defaultValue =
            'The graph model returned incomplete structured data after smaller-batch retries. Check the model output limit and retry the failed document.'
        throw new Error(t('server-ai:Error.GraphExtractionOutputInvalid', { defaultValue }) || defaultValue)
    }
}
