import { Injectable } from '@nestjs/common'
import { DocumentInterface } from '@langchain/core/documents'
import { KnowledgeStructureEnum, type KnowledgeChunkingDecision } from '@xpert-ai/contracts'
import {
    TextSplitterStrategy,
    type ChunkMetadata,
    type ITextSplitterStrategy,
    type TextSplitterExecutionContext,
    type TextSplitterResult
} from '@xpert-ai/plugin-sdk'
import { validateMaxChunkTokens } from '../../../knowledge-document/parser-validation'
import { analyzeStructuredDocuments } from './structured-document'
import { parseStructuredOptions, structuredProvider } from './structured-options'
import { StructureAwareStrategy, createDecision, traceDecision, traceLegacyChunk } from './structure-aware.strategy'
import { MarkdownRecursiveStrategy } from './markdown-recursive.strategy'
import { RecursiveCharacterStrategy } from './recursive-character.strategy'

@Injectable()
@TextSplitterStrategy('auto')
export class AutoTextSplitterStrategy implements ITextSplitterStrategy<unknown> {
    readonly structure = KnowledgeStructureEnum.General
    readonly meta = structuredProvider('auto')

    constructor(
        private readonly structured: StructureAwareStrategy,
        private readonly markdown: MarkdownRecursiveStrategy,
        private readonly recursive: RecursiveCharacterStrategy
    ) {}

    async validateConfig(options: unknown) {
        parseStructuredOptions(options)
    }

    async splitDocuments(
        documents: DocumentInterface<ChunkMetadata>[],
        options?: unknown,
        context: TextSplitterExecutionContext = {}
    ): Promise<Required<TextSplitterResult>> {
        const config = parseStructuredOptions(options)
        validateMaxChunkTokens(context.maxChunkTokens)
        const groups = analyzeStructuredDocuments(documents)
        const chunks: DocumentInterface<ChunkMetadata>[] = []
        const decisions: KnowledgeChunkingDecision[] = []
        for (const group of groups) {
            const complex = group.units.some((unit) => ['table', 'list', 'code', 'formula'].includes(unit.kind))
            const headings = group.units.filter((unit) => unit.kind === 'heading')
            const legacy = headings.length > 0 && headings.every((unit) => unit.legacyHeading && unit.headingLevel <= 3)
            const resolved =
                complex || (headings.length && !legacy)
                    ? 'structure-aware'
                    : legacy
                      ? 'markdown-recursive'
                      : 'recursive-character'
            const reason = complex
                ? 'structured-blocks'
                : legacy
                  ? 'markdown-headings'
                  : headings.length
                    ? 'layout-headings'
                    : 'plain-text'
            const decision = createDecision(group, 'auto', resolved, reason)
            decisions.push(decision)
            if (resolved === 'structure-aware') {
                const result = await this.structured.splitAnalyzed([group], config, context)
                decision.warnings = result.decisions[0].warnings
                chunks.push(
                    ...result.chunks.map((chunk) =>
                        chunk.metadata.chunking
                            ? {
                                  ...chunk,
                                  metadata: {
                                      ...chunk.metadata,
                                      chunking: { ...chunk.metadata.chunking, ...traceDecision(decision) }
                                  }
                              }
                            : chunk
                    )
                )
            } else {
                const input = group.sources
                    .filter(
                        (source) => !source.document.metadata.mediaType || source.document.metadata.mediaType === 'text'
                    )
                    .map((source) => source.document)
                const result =
                    resolved === 'markdown-recursive'
                        ? await this.markdown.splitDocuments(input, {
                              chunkSize: config.chunkSize,
                              chunkOverlap: config.chunkOverlap
                          })
                        : await this.recursive.splitDocuments(input, config)
                chunks.push(...result.chunks.map((chunk) => traceLegacyChunk(chunk, decision)))
                chunks.push(
                    ...group.sources
                        .filter(
                            (source) =>
                                source.document.metadata.mediaType && source.document.metadata.mediaType !== 'text'
                        )
                        .map((source) => source.document)
                )
            }
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
