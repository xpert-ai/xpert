import { QueryBus } from '@nestjs/cqrs'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { createKnowledgeRetriever } from './retriever'
import {
    KnowledgebaseGetOneQuery,
    KnowledgeFilterValueOptionsQuery,
    KnowledgeFolderOptionsQuery,
    KnowledgeGraphExploreQuery
} from './queries'

describe('KnowledgeRetriever', () => {
    it('selects workspace scope fields when building a knowledgebase tool', async () => {
        const execute = jest.fn().mockResolvedValue({
            id: 'knowledgebase-1',
            name: 'Docs',
            description: 'Knowledgebase docs',
            metadataSchema: []
        })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1')

        await retriever.toTool()

        expect(execute).toHaveBeenCalledWith(expect.any(KnowledgebaseGetOneQuery))
        const query = execute.mock.calls[0]?.[0]
        expect(query).toBeInstanceOf(KnowledgebaseGetOneQuery)
        if (!(query instanceof KnowledgebaseGetOneQuery)) {
            throw new Error('Expected knowledgebase query')
        }
        expect(query.input.options?.select).toEqual(
            expect.objectContaining({
                id: true,
                name: true,
                description: true,
                metadataSchema: true,
                workspaceId: true,
                tenantId: true,
                organizationId: true
            })
        )
    })

    it('returns citation-aware JSON from the knowledgebase tool', async () => {
        const execute = jest
            .fn()
            .mockResolvedValueOnce({
                id: 'knowledgebase-1',
                name: 'Docs',
                description: 'Knowledgebase docs',
                metadataSchema: []
            })
            .mockResolvedValueOnce({
                documents: [
                    {
                        id: 'chunk-1',
                        pageContent: '质量控制内容',
                        metadata: {
                            chunkId: 'chunk-1',
                            knowledgeId: 'doc-1',
                            score: 0.89,
                            relevanceScore: 0.93,
                            sourceBlockIds: ['block-7'],
                            sourceMapAsset: {
                                type: 'file',
                                url: 'https://files.local/doc-1-source-map.json',
                                filePath: 'analysis/doc-1-source-map.json'
                            },
                            markdownSourceMap: {
                                schemaVersion: 1,
                                entries: Array.from({ length: 1_000 }, (_, index) => ({
                                    startOffset: index * 10,
                                    endOffset: index * 10 + 9,
                                    pageStart: 1,
                                    pageEnd: 1,
                                    blockIds: [`block-${index}`]
                                }))
                            }
                        },
                        document: {
                            id: 'doc-1',
                            name: '质量手册.pdf',
                            fileUrl: 'https://files.local/doc-1.pdf',
                            mimeType: 'application/pdf'
                        }
                    }
                ],
                diagnostics: [{ filterVersion: 2, filterStatus: 'not_applied', hitCount: 1 }]
            })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1')

        const knowledgeTool = await retriever.toTool()
        expect(knowledgeTool.description).toContain('Use the exact citationMarkdown string verbatim')
        expect(knowledgeTool.description).toContain('[label](url)')
        const output = await knowledgeTool.invoke({ input: '质量' })
        const parsed = JSON.parse(String(output))

        expect(execute).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                input: expect.objectContaining({
                    knowledgebases: ['knowledgebase-1'],
                    query: '质量'
                })
            })
        )
        expect(parsed.chunks).toEqual([
            expect.objectContaining({
                index: 1,
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                knowledgebaseId: 'knowledgebase-1',
                documentName: '质量手册.pdf',
                fileUrl: 'https://files.local/doc-1.pdf',
                content: '质量控制内容',
                citationLabel: '⟦1⟧',
                citationUrl:
                    'xpert://knowledgebase/chunk?knowledgebaseId=knowledgebase-1&documentId=doc-1&chunkId=chunk-1',
                citationMarkdown:
                    '[⟦1⟧](xpert://knowledgebase/chunk?knowledgebaseId=knowledgebase-1&documentId=doc-1&chunkId=chunk-1)'
            })
        ])
        expect(parsed.citations).toEqual([
            expect.objectContaining({
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                citationMarkdown:
                    '[⟦1⟧](xpert://knowledgebase/chunk?knowledgebaseId=knowledgebase-1&documentId=doc-1&chunkId=chunk-1)'
            })
        ])
        expect(parsed.instructions).toContain('Use the exact citationMarkdown string verbatim')
        expect(parsed.instructions).toContain('[label](url)')
        expect(parsed.instructions).toContain('do not rewrite it as a footnote')
        expect(parsed.chunks[0].metadata).toEqual(
            expect.objectContaining({
                sourceBlockIds: ['block-7'],
                sourceMapAsset: expect.objectContaining({ filePath: 'analysis/doc-1-source-map.json' })
            })
        )
        expect(parsed.chunks[0].metadata).not.toHaveProperty('markdownSourceMap')
        expect(parsed.citations[0]).not.toHaveProperty('metadata')
        expect(Buffer.byteLength(String(output))).toBeLessThan(10_000)
    })

    it('accepts a provider JSON-encoded dynamic filter and normalizes it before retrieval', async () => {
        const execute = jest
            .fn()
            .mockResolvedValueOnce({
                id: 'knowledgebase-1',
                name: 'Docs',
                description: 'Knowledgebase docs',
                metadataSchema: []
            })
            .mockResolvedValueOnce({ documents: [], diagnostics: [] })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1', {
            recall: {},
            retrieval: { mode: 'vector', filtering: { agent: { enabled: true } } }
        })
        const dynamicFilter = {
            kind: 'condition',
            field: 'document.folderPath',
            operator: 'contains',
            value: { kind: 'literal', value: '水利' }
        }

        const knowledgeTool = await retriever.toTool()
        await expect(
            knowledgeTool.invoke({ input: 'GOODSPRINGS', dynamicFilter: JSON.stringify(dynamicFilter) })
        ).resolves.toEqual(expect.any(String))

        expect(execute).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                input: expect.objectContaining({
                    query: 'GOODSPRINGS',
                    filters: expect.objectContaining({ dynamic: dynamicFilter })
                })
            })
        )
    })

    it('lets malformed dynamic filters reach runtime fallback instead of failing tool schema validation', async () => {
        const execute = jest
            .fn()
            .mockResolvedValueOnce({
                id: 'knowledgebase-1',
                name: 'Docs',
                description: 'Knowledgebase docs',
                metadataSchema: []
            })
            .mockResolvedValueOnce({ documents: [], diagnostics: [] })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1', {
            recall: {},
            retrieval: { mode: 'vector', filtering: { agent: { enabled: true } } }
        })

        const knowledgeTool = await retriever.toTool()
        await expect(knowledgeTool.invoke({ input: 'GOODSPRINGS', dynamicFilter: '{not-valid-json' })).resolves.toEqual(
            expect.any(String)
        )

        expect(execute).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                input: expect.objectContaining({
                    filters: expect.objectContaining({ dynamic: '{not-valid-json' })
                })
            })
        )
    })

    it('keeps the provider-facing dynamic-filter schema compact', async () => {
        const execute = jest.fn().mockResolvedValue({
            id: 'knowledgebase-1',
            name: 'Docs',
            description: 'Knowledgebase docs',
            metadataSchema: Array.from({ length: 24 }, (_, index) => ({
                key: `field_${index}`,
                type: index % 2 ? ('string' as const) : ('number' as const),
                scope: 'document' as const
            }))
        })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1', {
            recall: {},
            retrieval: { mode: 'vector', filtering: { agent: { enabled: true } } }
        })

        const knowledgeTool = await retriever.toTool()
        const schemaJson = JSON.stringify(zodToJsonSchema(knowledgeTool.schema))

        expect(Buffer.byteLength(schemaJson)).toBeLessThan(30_000)
        expect(schemaJson.match(/"anyOf"/g)?.length ?? 0).toBeLessThanOrEqual(2)
        expect(schemaJson).toContain('document.folderPath')
        expect(schemaJson).toContain('metadata.field_23')
    })

    it('provides folder values through the fixed-boundary-aware filter discovery tool', async () => {
        const fixedFilter = {
            kind: 'condition' as const,
            field: 'metadata.domain',
            operator: 'eq' as const,
            value: { kind: 'literal' as const, value: '水利' }
        }
        const execute = jest
            .fn()
            .mockResolvedValueOnce({
                id: 'knowledgebase-1',
                name: 'Docs',
                description: 'Knowledgebase docs',
                metadataSchema: [{ key: 'domain', type: 'string', scope: 'document' }]
            })
            .mockResolvedValueOnce({
                knowledgebaseId: 'knowledgebase-1',
                items: [
                    {
                        folderPath: '水利/华东',
                        name: '华东',
                        parentPath: '水利',
                        depth: 2,
                        directDocumentCount: 1,
                        documentCount: 1
                    }
                ],
                total: 1,
                truncated: false,
                nextOffset: undefined
            })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1', {
            recall: {},
            retrieval: {
                mode: 'vector',
                filtering: { fixed: fixedFilter, agent: { enabled: true } }
            }
        })

        const knowledgeTool = await retriever.toTool()
        const filterOptionsTool = await retriever.toFilterOptionsTool()
        const output = await filterOptionsTool.invoke(
            { field: 'document.folderPath', search: '华东', limit: 20, offset: 0 },
            { configurable: { runtimeState: { input: { region: 'east' } } } }
        )
        const parsed = JSON.parse(String(output))

        expect(knowledgeTool.description).toContain("call 'knowledge-filter-options-knowledgebase-1' first")
        expect(filterOptionsTool.name).toBe('knowledge-filter-options-knowledgebase-1')
        expect(execute).toHaveBeenCalledTimes(2)
        expect(execute).toHaveBeenNthCalledWith(2, expect.any(KnowledgeFolderOptionsQuery))
        const folderQuery = execute.mock.calls[1][0]
        expect(folderQuery.input).toEqual(
            expect.objectContaining({
                knowledgebaseId: 'knowledgebase-1',
                fixedFilter,
                variables: { input: { region: 'east' } },
                search: '华东',
                limit: 20,
                offset: 0
            })
        )
        expect(parsed).toEqual(
            expect.objectContaining({
                field: 'document.folderPath',
                optionKind: 'folderTree',
                items: [expect.objectContaining({ folderPath: '水利/华东' })],
                allowedOperators: expect.arrayContaining(['eq', 'under'])
            })
        )
        expect(parsed.pathFormat).toContain('no leading or trailing slash')
    })

    it('lets an Agent inspect discoverable fields before querying live scalar and metadata values', async () => {
        const execute = jest
            .fn()
            .mockResolvedValueOnce({
                id: 'knowledgebase-1',
                name: 'Docs',
                description: 'Knowledgebase docs',
                metadataSchema: [
                    { key: 'effectiveYear', type: 'number', scope: 'document' },
                    { key: 'specialty', type: 'string[]', scope: 'chunk' }
                ]
            })
            .mockResolvedValueOnce({
                knowledgebaseId: 'knowledgebase-1',
                field: 'document.fileExtension',
                fieldType: 'string',
                optionKind: 'values',
                items: [
                    { value: 'pdf', documentCount: 12, chunkCount: 80 },
                    { value: 'docx', documentCount: 3, chunkCount: 14 }
                ],
                total: 2,
                truncated: false,
                statistics: {
                    eligibleDocumentCount: 15,
                    eligibleChunkCount: 94,
                    existingDocumentCount: 15,
                    existingChunkCount: 94
                }
            })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1', {
            recall: {},
            retrieval: { mode: 'vector', filtering: { agent: { enabled: true } } }
        })
        const filterOptionsTool = await retriever.toFilterOptionsTool()

        const catalog = JSON.parse(String(await filterOptionsTool.invoke({})))
        expect(catalog.mode).toBe('fields')
        expect(catalog.fields).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: 'document.folderPath', optionKind: 'folderTree' }),
                expect.objectContaining({ field: 'metadata.effectiveYear', optionKind: 'rangeValues' }),
                expect.objectContaining({ field: 'chunk.metadata.specialty', optionKind: 'arrayValues' })
            ])
        )
        expect(execute).toHaveBeenCalledTimes(1)

        const values = JSON.parse(
            String(await filterOptionsTool.invoke({ field: 'document.fileExtension', limit: 20 }))
        )
        expect(execute).toHaveBeenNthCalledWith(2, expect.any(KnowledgeFilterValueOptionsQuery))
        expect(execute.mock.calls[1][0].input).toEqual(
            expect.objectContaining({
                knowledgebaseId: 'knowledgebase-1',
                field: 'document.fileExtension',
                limit: 20
            })
        )
        expect(values).toEqual(
            expect.objectContaining({
                mode: 'values',
                field: 'document.fileExtension',
                items: expect.arrayContaining([expect.objectContaining({ value: 'pdf', documentCount: 12 })]),
                allowedOperators: expect.arrayContaining(['eq', 'contains'])
            })
        )
    })

    it('provides a compact iterative graph explorer and carries the fixed boundary into every call', async () => {
        const fixedFilter = {
            kind: 'condition' as const,
            field: 'metadata.domain',
            operator: 'eq' as const,
            value: { kind: 'literal' as const, value: '水利' }
        }
        const execute = jest
            .fn()
            .mockResolvedValueOnce({
                id: 'knowledgebase-1',
                name: 'Docs',
                description: 'Knowledgebase docs',
                metadataSchema: [{ key: 'domain', type: 'string', scope: 'document' }],
                graphRag: { enabled: true },
                graphStatus: 'ready'
            })
            .mockResolvedValueOnce({
                action: 'search',
                entities: [{ id: 'entity-1', name: 'GOODSPRINGS', type: 'company' }],
                retrievalHints: {
                    terms: ['GOODSPRINGS'],
                    suggestedRetrievalQuery: '泵站 GOODSPRINGS'
                }
            })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1', {
            recall: {},
            retrieval: { mode: 'vector', filtering: { fixed: fixedFilter, agent: { enabled: true } } }
        })

        const graphTool = await retriever.toGraphExplorerTool()
        expect(graphTool).not.toBeNull()
        if (!graphTool) throw new Error('Expected graph explorer tool')
        expect(graphTool.name).toBe('knowledge-graph-explorer-knowledgebase-1')
        expect(Buffer.byteLength(JSON.stringify(zodToJsonSchema(graphTool.schema)))).toBeLessThan(5_000)

        const missingQuery = JSON.parse(String(await graphTool.invoke({ action: 'search' })))
        expect(missingQuery).toEqual(expect.objectContaining({ errorCode: 'graph_query_required' }))
        expect(execute).toHaveBeenCalledTimes(1)

        const output = JSON.parse(
            String(
                await graphTool.invoke(
                    { action: 'search', query: '泵站' },
                    { configurable: { runtimeState: { input: { region: 'east' } } } }
                )
            )
        )
        expect(execute).toHaveBeenNthCalledWith(2, expect.any(KnowledgeGraphExploreQuery))
        expect(execute.mock.calls[1][0].input).toEqual(
            expect.objectContaining({
                knowledgebaseId: 'knowledgebase-1',
                action: 'search',
                query: '泵站',
                filters: expect.objectContaining({ fixed: fixedFilter }),
                variables: { input: { region: 'east' } }
            })
        )
        expect(output.instructions).toContain('suggestedRetrievalQuery')
        expect(output.instructions).toContain('do not treat graph evidence quotes as the final answer')
    })

    it('does not expose a graph explorer when GraphRAG is disabled', async () => {
        const execute = jest.fn().mockResolvedValue({
            id: 'knowledgebase-1',
            name: 'Docs',
            description: 'Knowledgebase docs',
            metadataSchema: [],
            graphRag: { enabled: false },
            graphStatus: 'disabled'
        })
        const queryBus = { execute } as unknown as QueryBus
        const retriever = createKnowledgeRetriever(queryBus, 'knowledgebase-1')

        await expect(retriever.toGraphExplorerTool()).resolves.toBeNull()
    })
})
