import { DocumentTypeEnum, IKnowledgeDocument, IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
import {
    computeKnowledgeDocumentProcessingHash,
    computeKnowledgeDocumentTransformFingerprint,
    computeKnowledgeDocumentChunkHash,
    computeStableHash,
    resolveKnowledgeDocumentTransformerIdentity,
    resolveKnowledgeDocumentSourceKey
} from './document-hash'
import { TDocChunkMetadata } from './types'
import * as chunkingRevision from './chunking-revision'

describe('knowledge document hashes', () => {
    it.each(['auto', 'structure-aware'])('expires %s processing results with stale version diagnostics', (provider) => {
        const document = {
            sourceHash: 'source-hash',
            type: 'md',
            parserConfig: { textSplitterType: provider }
        }
        const current = computeKnowledgeDocumentProcessingHash(document)
        const revision = jest.spyOn(chunkingRevision, 'knowledgeChunkingRevision').mockReturnValue('structured-2')
        let previous: string
        try {
            previous = computeKnowledgeDocumentProcessingHash(document)
        } finally {
            revision.mockRestore()
        }
        expect(current).not.toBe(previous)
    })

    it('keeps stable hashes for equivalent object key ordering', () => {
        expect(
            computeStableHash({
                name: 'document',
                config: {
                    chunkOverlap: 20,
                    chunkSize: 500
                }
            })
        ).toBe(
            computeStableHash({
                config: {
                    chunkSize: 500,
                    chunkOverlap: 20
                },
                name: 'document'
            })
        )
    })

    it('changes chunk hash when pageContent changes', () => {
        const chunk = {
            pageContent: 'first content',
            metadata: {
                chunkId: 'chunk-1',
                searchContent: 'indexed content'
            }
        } satisfies Partial<IKnowledgeDocumentChunk<TDocChunkMetadata>>

        expect(computeKnowledgeDocumentChunkHash(chunk as IKnowledgeDocumentChunk<TDocChunkMetadata>)).not.toBe(
            computeKnowledgeDocumentChunkHash({
                ...chunk,
                pageContent: 'second content'
            } as IKnowledgeDocumentChunk<TDocChunkMetadata>)
        )
    })

    it('changes chunk hash when searchContent changes', () => {
        const chunk = {
            pageContent: 'full content',
            metadata: {
                chunkId: 'chunk-1',
                searchContent: 'indexed content'
            }
        } satisfies Partial<IKnowledgeDocumentChunk<TDocChunkMetadata>>

        expect(computeKnowledgeDocumentChunkHash(chunk as IKnowledgeDocumentChunk<TDocChunkMetadata>)).not.toBe(
            computeKnowledgeDocumentChunkHash({
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    searchContent: 'different indexed content'
                }
            } as IKnowledgeDocumentChunk<TDocChunkMetadata>)
        )
    })

    it('ignores volatile metadata when hashing chunks', () => {
        const chunk = {
            pageContent: 'content',
            metadata: {
                chunkId: 'chunk-1',
                parentId: 'parent-1',
                searchContent: 'indexed content',
                tokens: 10,
                score: 0.5,
                embeddingRevision: 1,
                embeddingDimensions: 1536,
                vectorIdCollectionName: 'active'
            }
        } satisfies Partial<IKnowledgeDocumentChunk<TDocChunkMetadata>>

        expect(computeKnowledgeDocumentChunkHash(chunk as IKnowledgeDocumentChunk<TDocChunkMetadata>)).toBe(
            computeKnowledgeDocumentChunkHash({
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    chunkId: 'chunk-2',
                    parentId: 'parent-2',
                    tokens: 20,
                    score: 0.9,
                    embeddingRevision: 2,
                    embeddingDimensions: 3072,
                    vectorIdCollectionName: 'pending'
                }
            } as IKnowledgeDocumentChunk<TDocChunkMetadata>)
        )
    })

    it('changes processing hash when parserConfig changes', () => {
        const document = {
            sourceHash: 'source-hash',
            parserId: 'default',
            type: 'txt',
            name: 'document.txt',
            filePath: '/tmp/document.txt',
            sourceConfig: { key: 'source-key' },
            parserConfig: {
                chunkSize: 500,
                chunkOverlap: 50
            },
            options: {
                url: 'https://example.com/docs'
            }
        } satisfies Partial<IKnowledgeDocument>

        expect(computeKnowledgeDocumentProcessingHash(document as IKnowledgeDocument)).not.toBe(
            computeKnowledgeDocumentProcessingHash({
                ...document,
                parserConfig: {
                    ...document.parserConfig,
                    chunkSize: 800
                }
            } as IKnowledgeDocument)
        )
    })

    it('ignores the document diagnostic fingerprint but retains chunk provenance in the hash', () => {
        const chunk = {
            pageContent: 'unchanged section',
            metadata: {
                chunkId: 'chunk-1',
                chunking: {
                    inputHash: 'original-document',
                    requestedStrategy: 'auto' as const,
                    resolvedStrategy: 'structure-aware' as const,
                    reason: 'structured-blocks' as const,
                    algorithmVersion: 1 as const,
                    headingPath: ['# Section'],
                    sourceRanges: [{ sourceIndex: 0, startOffset: 0, endOffset: 17 }],
                    warnings: []
                }
            }
        }
        const updated = {
            ...chunk,
            metadata: { ...chunk.metadata, chunking: { ...chunk.metadata.chunking, inputHash: 'updated-document' } }
        }
        expect(computeKnowledgeDocumentChunkHash(updated)).toBe(computeKnowledgeDocumentChunkHash(chunk))
        updated.metadata.chunking.sourceRanges = [{ sourceIndex: 0, startOffset: 20, endOffset: 37 }]
        expect(computeKnowledgeDocumentChunkHash(updated)).not.toBe(computeKnowledgeDocumentChunkHash(chunk))
    })

    it('keeps transform fingerprint when only chunker config changes', () => {
        const document = {
            sourceHash: 'source-hash',
            type: 'pdf',
            filePath: 'files/document.pdf',
            parserConfig: {
                transformerType: 'unlimited-ocr',
                transformerIntegration: 'integration-1',
                transformer: { preserveRawOutput: true },
                textSplitterType: 'recursive-character',
                textSplitter: { chunkSize: 1000, chunkOverlap: 200 }
            }
        } satisfies Partial<IKnowledgeDocument>
        const documentWithUpdatedChunker = {
            ...document,
            parserConfig: {
                ...document.parserConfig,
                textSplitter: { chunkSize: 2000, chunkOverlap: 100 }
            }
        } satisfies Partial<IKnowledgeDocument>

        expect(
            computeKnowledgeDocumentTransformFingerprint(
                document,
                resolveKnowledgeDocumentTransformerIdentity(document)
            )
        ).toBe(
            computeKnowledgeDocumentTransformFingerprint(
                documentWithUpdatedChunker,
                resolveKnowledgeDocumentTransformerIdentity(documentWithUpdatedChunker)
            )
        )
    })

    it('changes transform fingerprint when transformer config changes', () => {
        const document = {
            sourceHash: 'source-hash',
            type: 'pdf',
            filePath: 'files/document.pdf'
        } satisfies Partial<IKnowledgeDocument>

        expect(
            computeKnowledgeDocumentTransformFingerprint(document, {
                provider: 'unlimited-ocr',
                integrationId: 'integration-1',
                config: { preserveRawOutput: true }
            })
        ).not.toBe(
            computeKnowledgeDocumentTransformFingerprint(document, {
                provider: 'unlimited-ocr',
                integrationId: 'integration-1',
                config: { preserveRawOutput: false }
            })
        )
    })

    it('does not derive a source key from source hash alone', () => {
        expect(
            resolveKnowledgeDocumentSourceKey({
                sourceHash: 'source-hash',
                sourceConfig: { key: 'source-node' }
            })
        ).toBeNull()
    })

    it('does not derive a source key from a display name', () => {
        expect(
            resolveKnowledgeDocumentSourceKey({
                sourceType: DocumentTypeEnum.FILE,
                sourceHash: 'source-hash',
                sourceConfig: { key: 'source-node' },
                name: 'policy.pdf'
            })
        ).toBeNull()
    })

    it('derives a source key from a stable file path', () => {
        expect(
            resolveKnowledgeDocumentSourceKey({
                sourceType: DocumentTypeEnum.FILE,
                sourceConfig: { key: 'source-node' },
                name: 'policy.pdf',
                filePath: 'files/policy-2.pdf'
            })
        ).toBe(`${DocumentTypeEnum.FILE}:source-node:files/policy-2.pdf`)
    })
})
