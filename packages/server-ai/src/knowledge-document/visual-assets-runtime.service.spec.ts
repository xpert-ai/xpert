import { NotFoundException } from '@nestjs/common'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { KnowledgeDocumentVisualAssetsRuntimeService } from './visual-assets-runtime.service'

describe('KnowledgeDocumentVisualAssetsRuntimeService', () => {
    let rootPath: string
    let imagePath: string
    let document: Record<string, unknown>
    let cacheValues: Map<string, unknown>
    let service: KnowledgeDocumentVisualAssetsRuntimeService
    let workspaceFiles: { writeRuntimeBuffer: jest.Mock }

    beforeEach(async () => {
        rootPath = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-knowledge-visual-assets-'))
        imagePath = path.join(rootPath, 'page-2.png')
        await sharp({
            create: {
                width: 12,
                height: 8,
                channels: 3,
                background: { r: 255, g: 255, b: 255 }
            }
        })
            .png()
            .toFile(imagePath)
        document = {
            id: 'doc-1',
            knowledgebaseId: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            disabled: false,
            sourceHash: 'source-v1',
            processingHash: 'processing-v1',
            contentHash: 'content-v1',
            version: 1,
            metadata: { analysisSnapshot: { transformFingerprint: 'snapshot-v1' } }
        }
        cacheValues = new Map()
        workspaceFiles = {
            writeRuntimeBuffer: jest.fn(async (input) => ({
                reference: {
                    source: 'platform.workspace.files',
                    tenantId: 'tenant-1',
                    catalog: 'xperts',
                    scopeId: 'xpert-1',
                    xpertId: 'xpert-1',
                    filePath: `.xpert/tool-output/knowledge-document-images/${input.fileName}`,
                    workspacePath: `/workspace/.xpert/tool-output/knowledge-document-images/${input.fileName}`,
                    originalName: input.originalName,
                    name: input.fileName,
                    mimeType: input.mimeType,
                    size: input.size
                }
            }))
        }
        service = new KnowledgeDocumentVisualAssetsRuntimeService(
            {
                get: jest.fn(async (key: string) => cacheValues.get(key)),
                set: jest.fn(async (key: string, value: unknown) => {
                    cacheValues.set(key, value)
                }),
                del: jest.fn(async (key: string) => {
                    cacheValues.delete(key)
                })
            } as never,
            { findOne: jest.fn(async () => document) } as never,
            { findAll: jest.fn(async () => ({ items: [] })) } as never,
            {
                getVisualCatalog: jest.fn(async () => ({
                    snapshotFingerprint: 'snapshot-v1',
                    assets: [
                        {
                            visualAssetId: 'asset-page-2',
                            page: 2,
                            order: 0,
                            sourceBlockIds: ['block-2'],
                            summary: 'Motor nameplate rated power table'
                        }
                    ]
                })),
                resolveAsset: jest.fn(async () => ({ absolutePath: imagePath, mimeType: 'image/png' }))
            } as never,
            {
                resolve: jest.fn(async () => ({
                    volume: { path: (relativePath: string) => path.join(rootPath, relativePath) }
                }))
            } as never
        )
    })

    afterEach(async () => {
        await fsPromises.rm(rootPath, { recursive: true, force: true })
    })

    it('issues governed relative paths and injects bytes only inside the same Agent execution', async () => {
        const api = service.createScopedApi(executionScope(), { workspaceFiles: workspaceFiles as never })
        const result = await api.issueCandidates(candidateRequest())

        expect(result.candidates).toEqual([
            expect.objectContaining({
                filePath: 'knowledge-documents/doc-1/sources/source-1/visual-assets/asset-page-2',
                knowledgeDocumentId: 'doc-1',
                sourceDocumentId: 'source-1',
                page: 2,
                sourceBlockIds: ['block-2'],
                visualAssetId: 'asset-page-2',
                candidateReason: 'same_block'
            })
        ])
        expect(JSON.stringify(result)).not.toContain(imagePath)
        expect(JSON.stringify(result)).not.toContain('url')

        const filePath = result.candidates[0].filePath
        await expect(
            service
                .createScopedApi({ ...executionScope(), agentKey: 'Agent_Other' } as never, {
                    workspaceFiles: workspaceFiles as never
                })
                .prepareImages({ filePaths: [filePath] })
        ).rejects.toBeInstanceOf(NotFoundException)

        await expect(api.prepareImages({ filePaths: ['/tmp/page-2.png'] })).rejects.toBeInstanceOf(NotFoundException)
        await expect(api.prepareImages({ filePaths: ['../page-2.png'] })).rejects.toBeInstanceOf(NotFoundException)

        const prepared = await api.prepareImages({ filePaths: [filePath] })
        expect(prepared.images).toEqual([
            expect.objectContaining({
                index: 1,
                mimeType: 'image/png',
                size: expect.any(Number),
                visualAssetId: 'asset-page-2'
            })
        ])
        expect(JSON.stringify(prepared)).not.toContain('dataBase64')
        expect(prepared.artifactInputs).toEqual([
            expect.objectContaining({
                index: 1,
                fileName: expect.stringMatching(/^[a-f0-9]{64}\.png$/),
                workspaceFileRef: expect.objectContaining({ source: 'platform.workspace.files' })
            })
        ])
        expect(workspaceFiles.writeRuntimeBuffer).toHaveBeenCalledWith(
            expect.objectContaining({
                mimeType: 'image/png',
                folder: '.xpert/tool-output/knowledge-document-images',
                metadata: expect.objectContaining({
                    knowledgeDocumentId: 'doc-1',
                    visualAssetId: 'asset-page-2'
                })
            })
        )

        const payloads = await api.consumeImageBatch(prepared.batchRef)
        expect(payloads[0]).toEqual(expect.objectContaining({ dataBase64: expect.any(String) }))
        await expect(api.consumeImageBatch(prepared.batchRef)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('binds visual candidates to the child Agent execution available at tool invocation time', async () => {
        const { executionId: _executionId, conversationId: _conversationId, ...graphBuildScope } = executionScope()
        const api = service.createScopedApi(graphBuildScope, { workspaceFiles: workspaceFiles as never })

        const result = await AsyncLocalStorageProviderSingleton.runWithConfig(
            {
                configurable: {
                    thread_id: 'thread-1',
                    executionId: 'child-execution-1',
                    agentKey: 'Agent_RequirementEvidenceSpecialist'
                }
            },
            () => api.issueCandidates(candidateRequest())
        )

        await expect(
            AsyncLocalStorageProviderSingleton.runWithConfig(
                {
                    configurable: {
                        thread_id: 'thread-1',
                        executionId: 'child-execution-2',
                        agentKey: 'Agent_RequirementEvidenceSpecialist'
                    }
                },
                () => api.prepareImages({ filePaths: [result.candidates[0].filePath] })
            )
        ).rejects.toThrow('does not belong to this Agent execution')

        await expect(
            AsyncLocalStorageProviderSingleton.runWithConfig(
                {
                    configurable: {
                        thread_id: 'thread-1',
                        executionId: 'child-execution-1',
                        agentKey: 'Agent_RequirementEvidenceSpecialist'
                    }
                },
                () => api.prepareImages({ filePaths: [result.candidates[0].filePath] })
            )
        ).resolves.toEqual(
            expect.objectContaining({ images: [expect.objectContaining({ visualAssetId: 'asset-page-2' })] })
        )
    })

    it('invalidates a governed path when its KnowledgeDocument fingerprint changes', async () => {
        const api = service.createScopedApi(executionScope(), { workspaceFiles: workspaceFiles as never })
        const result = await api.issueCandidates(candidateRequest())
        document.sourceHash = 'source-v2'

        await expect(api.prepareImages({ filePaths: [result.candidates[0].filePath] })).rejects.toThrow(
            'KnowledgeDocument was reprocessed'
        )
    })

    it('uses a guarded KnowledgeWorkArea fallback without exposing its physical storage path', async () => {
        const legacyRelativePath = 'ocr/images/page-4.png'
        await fsPromises.mkdir(path.dirname(path.join(rootPath, legacyRelativePath)), { recursive: true })
        await fsPromises.copyFile(imagePath, path.join(rootPath, legacyRelativePath))
        const snapshots = service['snapshots'] as unknown as { getVisualCatalog: jest.Mock }
        snapshots.getVisualCatalog.mockRejectedValueOnce(new Error('snapshot missing'))
        const chunks = service['chunks'] as unknown as { findAll: jest.Mock }
        chunks.findAll.mockResolvedValueOnce({
            items: [
                {
                    id: 'chunk-4',
                    pageContent: 'Scanned motor drawing',
                    metadata: {
                        page: 4,
                        sourceBlockIds: ['scan-block-4'],
                        assets: [{ type: 'image', filePath: legacyRelativePath, order: 1 }]
                    }
                }
            ]
        })

        const result = await service
            .createScopedApi(executionScope(), { workspaceFiles: workspaceFiles as never })
            .issueCandidates({
                ...candidateRequest(),
                textAnchors: []
            })

        expect(result.warnings).toEqual([expect.stringContaining('guarded legacy work-area allow-list')])
        expect(result.candidates[0]).toEqual(
            expect.objectContaining({
                page: 4,
                chunkId: 'chunk-4',
                sourceBlockIds: ['scan-block-4'],
                candidateReason: 'visual_summary_match'
            })
        )
        expect(JSON.stringify(result)).not.toContain(legacyRelativePath)
    })

    it('continues to guarded fallbacks when the immutable snapshot has no image assets', async () => {
        const legacyRelativePath = 'ocr/images/page-1.png'
        await fsPromises.mkdir(path.dirname(path.join(rootPath, legacyRelativePath)), { recursive: true })
        await fsPromises.copyFile(imagePath, path.join(rootPath, legacyRelativePath))
        const snapshots = service['snapshots'] as unknown as { getVisualCatalog: jest.Mock }
        snapshots.getVisualCatalog.mockResolvedValueOnce({ snapshotFingerprint: 'snapshot-v1', assets: [] })
        const chunks = service['chunks'] as unknown as { findAll: jest.Mock }
        chunks.findAll.mockResolvedValueOnce({
            items: [
                {
                    id: 'chunk-1',
                    pageContent: 'Output shaft diameter drawing',
                    metadata: {
                        page: 1,
                        sourceBlockIds: ['drawing-block-1'],
                        assets: [{ type: 'image', filePath: legacyRelativePath, order: 1 }]
                    }
                }
            ]
        })

        const result = await service
            .createScopedApi(executionScope(), { workspaceFiles: workspaceFiles as never })
            .issueCandidates({
                ...candidateRequest(),
                textAnchors: [{ page: 1, chunkId: 'chunk-1', sourceBlockIds: ['drawing-block-1'] }]
            })

        expect(result.warnings).toContain(
            'The immutable analysis snapshot contains no image assets; visual candidates use a guarded source fallback.'
        )
        expect(result.candidates[0]).toEqual(
            expect.objectContaining({ page: 1, visualAssetId: expect.any(String), candidateReason: 'same_block' })
        )
    })

    it('renders governed source PDF pages when parsed metadata contains no visual assets', async () => {
        document.type = 'pdf'
        document.mimeType = 'application/pdf'
        document.filePath = 'files/drawing.pdf'
        const snapshots = service['snapshots'] as unknown as { getVisualCatalog: jest.Mock }
        snapshots.getVisualCatalog.mockResolvedValueOnce({ snapshotFingerprint: 'snapshot-v1', assets: [] })
        const fallback = jest.spyOn(service as never, 'buildPdfPageFallbackCatalog').mockResolvedValueOnce([
            {
                visualAssetId: 'rendered-pdf-page-1',
                page: 1,
                order: 0,
                sourceBlockIds: ['drawing-block-1'],
                chunkId: 'chunk-1',
                locator: { kind: 'legacy', relativePath: '.knowledge/visual-page-fallback/doc-1/page-1.png' }
            }
        ] as never)

        const result = await service
            .createScopedApi(executionScope(), { workspaceFiles: workspaceFiles as never })
            .issueCandidates({
                ...candidateRequest(),
                textAnchors: [{ page: 1, chunkId: 'chunk-1', sourceBlockIds: ['drawing-block-1'] }]
            })

        expect(fallback).toHaveBeenCalled()
        expect(result.candidates[0]).toEqual(
            expect.objectContaining({ page: 1, visualAssetId: 'rendered-pdf-page-1', candidateReason: 'same_block' })
        )
    })
})

function executionScope() {
    return {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        agentKey: 'Agent_RequirementEvidenceSpecialist',
        executionId: 'execution-1'
    }
}

function candidateRequest() {
    return {
        knowledgebaseId: 'kb-1',
        knowledgeDocumentId: 'doc-1',
        query: 'motor nameplate rated power',
        textAnchors: [{ page: 2, chunkId: 'chunk-2', sourceBlockIds: ['block-2'] }],
        maxAssets: 3,
        businessScope: {
            namespace: 'bom.requirement-evidence' as const,
            caseId: 'case-1',
            baselineId: 'baseline-1',
            runId: 'run-1',
            sourceDocumentId: 'source-1'
        }
    }
}
