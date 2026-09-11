import { Injectable } from '@nestjs/common'
import { DocumentInterface } from '@langchain/core/documents'
import {
    KNOWLEDGE_CHUNKING_ALGORITHM_VERSION,
    KnowledgeStructureEnum,
    type KnowledgeChunkingDecision
} from '@xpert-ai/contracts'
import {
    TextSplitterStrategy,
    type ChunkMetadata,
    type ITextSplitterStrategy,
    type TextSplitterExecutionContext,
    type TextSplitterResult
} from '@xpert-ai/plugin-sdk'
import { validateMaxChunkTokens } from '../../../knowledge-document/parser-validation'
import { computeStableHash } from '../../../knowledge-document/document-hash'
import { analyzeStructuredDocuments, type StructuredDocument } from './structured-document'
import { createStructureChunks } from './structure-chunks'
import { parseStructuredOptions, structuredProvider } from './structured-options'
import { RecursiveCharacterStrategy } from './recursive-character.strategy'

@Injectable()
@TextSplitterStrategy('structure-aware')
export class StructureAwareStrategy implements ITextSplitterStrategy<unknown> {
    readonly structure = KnowledgeStructureEnum.General
    readonly meta = structuredProvider('structure-aware')

    constructor(private readonly recursive: RecursiveCharacterStrategy) {}

    async validateConfig(options: unknown) {
        parseStructuredOptions(options)
    }

    async splitDocuments(
        documents: DocumentInterface<ChunkMetadata>[],
        options?: unknown,
        context?: TextSplitterExecutionContext
    ) {
        return this.splitAnalyzed(analyzeStructuredDocuments(documents), options, context)
    }

    async splitAnalyzed(
        groups: StructuredDocument[],
        options?: unknown,
        context: TextSplitterExecutionContext = {}
    ): Promise<TextSplitterResult & Required<Pick<TextSplitterResult, 'decisions'>>> {
        const config = parseStructuredOptions(options)
        validateMaxChunkTokens(context.maxChunkTokens)
        const chunks: DocumentInterface<ChunkMetadata>[] = []
        const decisions: KnowledgeChunkingDecision[] = []
        for (const group of groups) {
            const hasStructure = group.units.some((unit) => !['paragraph', 'other'].includes(unit.kind))
            const decision = createDecision(
                group,
                'structure-aware',
                hasStructure ? 'structure-aware' : 'recursive-character',
                hasStructure ? 'explicit-structure' : 'missing-structure'
            )
            decisions.push(decision)
            if (hasStructure) {
                chunks.push(
                    ...createStructureChunks(
                        group,
                        decision,
                        config.chunkSize,
                        config.chunkOverlap,
                        context.maxChunkTokens,
                        typeof config.separators === 'string' ? [config.separators] : config.separators,
                        config.separators === undefined
                            ? (context.resolvedLanguages?.get(group.sources[0].document) ?? context.resolvedLanguage)
                            : undefined
                    )
                )
            } else {
                const result = await this.recursive.splitDocuments(
                    group.sources
                        .filter(
                            (source) =>
                                !source.document.metadata.mediaType || source.document.metadata.mediaType === 'text'
                        )
                        .map((source) => source.document),
                    config,
                    context
                )
                chunks.push(...result.chunks.map((chunk) => traceLegacyChunk(chunk, decision)))
            }
            chunks.push(
                ...group.sources
                    .filter(
                        (source) => source.document.metadata.mediaType && source.document.metadata.mediaType !== 'text'
                    )
                    .map((source) => source.document)
            )
        }
        return {
            chunks: chunks.map((chunk, index) =>
                chunk.metadata.mediaType && chunk.metadata.mediaType !== 'text'
                    ? chunk
                    : { ...chunk, metadata: { ...chunk.metadata, chunkIndex: index } }
            ),
            decisions
        }
    }
}

export function createDecision(
    group: StructuredDocument,
    requestedStrategy: KnowledgeChunkingDecision['requestedStrategy'],
    resolvedStrategy: KnowledgeChunkingDecision['resolvedStrategy'],
    reason: KnowledgeChunkingDecision['reason']
): KnowledgeChunkingDecision {
    const blockCounts: KnowledgeChunkingDecision['blockCounts'] = {}
    for (const unit of group.units) blockCounts[unit.kind] = (blockCounts[unit.kind] ?? 0) + 1
    const inputHash = computeStableHash(
        group.sources.map(({ document }) => ({
            text: document.pageContent,
            contentFormat: document.metadata.contentFormat,
            documentLayout: document.metadata.documentLayout,
            sourceMap: document.metadata.markdownSourceMap,
            sourceMapping: document.metadata.sourceMapping
        }))
    )
    return {
        inputHash,
        sourceIndexes: group.sources.map((source) => source.index),
        requestedStrategy,
        resolvedStrategy,
        reason,
        algorithmVersion: KNOWLEDGE_CHUNKING_ALGORITHM_VERSION,
        blockCounts,
        warnings: [...new Set(group.warnings)]
    }
}

export function traceDecision(decision: KnowledgeChunkingDecision) {
    const { inputHash, requestedStrategy, resolvedStrategy, reason, algorithmVersion } = decision
    return { inputHash, requestedStrategy, resolvedStrategy, reason, algorithmVersion }
}

/** Legacy algorithms retain their boundaries; their copied source metadata is only coarse evidence. */
export function traceLegacyChunk(chunk: DocumentInterface<ChunkMetadata>, decision: KnowledgeChunkingDecision) {
    const { markdownSourceMap, documentLayout, startOffset, endOffset, ...metadata } = chunk.metadata
    if (!decision.warnings.includes('coarse-provenance')) decision.warnings.push('coarse-provenance')
    return {
        ...chunk,
        metadata: {
            ...metadata,
            ...(metadata.searchContent !== undefined ? { searchContent: chunk.pageContent } : {}),
            sourceMapping: 'coarse' as const,
            chunking: {
                ...traceDecision(decision),
                headingPath: [],
                sourceRanges: [],
                warnings: [...decision.warnings]
            }
        }
    }
}
