import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import {
    ArtifactsRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    KnowledgeDocumentVisualAssetsRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { KNOWLEDGE_DOCUMENT_IMAGE_BATCH_METADATA_KEY } from './constants'
import { KnowledgebaseToolsMiddleware } from './knowledgebase-tools.middleware'

describe('KnowledgebaseToolsMiddleware', () => {
    const filePath = 'knowledge-documents/doc-1/sources/source-1/visual-assets/visual-2'
    const imagePayload = {
        index: 1,
        mimeType: 'image/png' as const,
        size: 8,
        width: 12,
        height: 8,
        sha256: 'a'.repeat(64),
        knowledgeDocumentId: 'doc-1',
        sourceDocumentId: 'source-1',
        page: 2,
        chunkId: 'chunk-2',
        sourceBlockIds: ['block-2'],
        visualAssetId: 'visual-2',
        candidateReason: 'same_block' as const,
        dataBase64: 'aW1hZ2U='
    }

    it('requires an explicit allow-list and exposes only the governed viewer', () => {
        const { middleware } = createSubject()
        expect(() => middleware.createMiddleware({ tools: [] }, context({}) as never)).toThrow()
        expect(() => middleware.createMiddleware({ tools: ['view_image'] } as never, context({}) as never)).toThrow()

        const created = middleware.createMiddleware({ tools: ['knowledge_document_view_images'] }, context({}) as never)
        expect(middleware.meta.features).toEqual(['knowledgebase-tools'])
        expect(created.tools?.map((item) => item.name)).toEqual(['knowledge_document_view_images'])
        const schema = (
            created.tools?.[0] as unknown as { schema: { safeParse: (input: unknown) => { success: boolean } } }
        ).schema
        expect(schema.safeParse({ filePaths: [filePath] }).success).toBe(true)
        expect(schema.safeParse({ filePaths: ['/tmp/image.png'] }).success).toBe(false)
        expect(schema.safeParse({ filePaths: ['../image.png'] }).success).toBe(false)
        expect(schema.safeParse({ filePaths: [filePath], fileId: 'file-1' }).success).toBe(false)
        expect(schema.safeParse({ filePaths: Array.from({ length: 4 }, () => filePath) }).success).toBe(false)
    })

    it('injects validated image bytes at high detail after the viewer ToolMessage', async () => {
        const visualAssets = {
            prepareImages: jest.fn(),
            consumeImageBatch: jest.fn(async () => [imagePayload]),
            discardImageBatch: jest.fn(),
            issueCandidates: jest.fn()
        }
        const { middleware } = createSubject()
        const created = middleware.createMiddleware(
            { tools: ['knowledge_document_view_images'] },
            context(visualAssets) as never
        )
        const handler = jest.fn(async (request: unknown) => {
            expect(request).toBeDefined()
            return new AIMessage('done')
        })
        const toolMessage = new ToolMessage({
            content: JSON.stringify({
                message: '1 governed image will be attached.',
                images: [{ ...imagePayload, dataBase64: undefined }]
            }),
            name: 'knowledge_document_view_images',
            tool_call_id: 'view-call-1',
            status: 'success',
            metadata: {
                [KNOWLEDGE_DOCUMENT_IMAGE_BATCH_METADATA_KEY]: { batchRef: 'kdvb_batch-1' }
            }
        })

        await created.wrapModelCall?.(
            {
                model: {},
                messages: [
                    new AIMessage({
                        content: '',
                        tool_calls: [
                            {
                                id: 'view-call-1',
                                name: 'knowledge_document_view_images',
                                args: { filePaths: [filePath] }
                            }
                        ]
                    }),
                    toolMessage
                ],
                tools: [],
                state: {},
                runtime: {},
                systemMessage: new SystemMessage('Base prompt')
            } as never,
            handler
        )

        expect(visualAssets.consumeImageBatch).toHaveBeenCalledWith('kdvb_batch-1')
        const forwarded = handler.mock.calls[0]?.[0] as {
            systemMessage: SystemMessage
            messages: Array<AIMessage | ToolMessage | HumanMessage>
        }
        expect(forwarded.systemMessage.content).toContain('Never use an absolute path')
        expect(forwarded.messages).toHaveLength(3)
        expect(forwarded.messages[2]).toBeInstanceOf(HumanMessage)
        expect(forwarded.messages[2].content).toEqual([
            expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('visual asset visual-2')
            }),
            {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,aW1hZ2U=', detail: 'high' }
            }
        ])
        expect(toolMessage.content).not.toContain('aW1hZ2U=')
    })

    it('persists fixed ArtifactVersions and exposes only stable image descriptors to ChatKit', async () => {
        const workspaceFileRef = {
            source: 'platform.workspace.files' as const,
            tenantId: 'tenant-1',
            catalog: 'xperts' as const,
            scopeId: 'xpert-1',
            xpertId: 'xpert-1',
            filePath: '.xpert/tool-output/knowledge-document-images/image.png',
            workspacePath: '/workspace/.xpert/tool-output/knowledge-document-images/image.png',
            originalName: 'image.png',
            name: 'image.png',
            mimeType: 'image/png',
            size: 8
        }
        const visualAssets = {
            prepareImages: jest.fn(async () => ({
                batchRef: 'kdvb_batch-1',
                images: [{ ...imagePayload, dataBase64: undefined }],
                artifactInputs: [{ index: 1, fileName: 'image.png', workspaceFileRef }]
            })),
            consumeImageBatch: jest.fn(),
            discardImageBatch: jest.fn(),
            issueCandidates: jest.fn()
        }
        const artifacts = {
            createArtifact: jest.fn(async () => ({ id: 'artifact-1' })),
            ensureArtifactVersion: jest.fn(async () => ({
                outcome: 'created',
                version: { id: 'artifact-version-1', sha256: imagePayload.sha256 }
            }))
        }
        const { middleware } = createSubject()
        const created = middleware.createMiddleware(
            { tools: ['knowledge_document_view_images'] },
            context(visualAssets, artifacts) as never
        )

        const result = (await created.tools?.[0].invoke(
            { filePaths: [filePath] },
            { metadata: { tool_call_id: 'view-call-1' } }
        )) as ToolMessage

        expect(artifacts.createArtifact).toHaveBeenCalledWith(
            expect.objectContaining({
                source: expect.objectContaining({
                    resourceId: 'doc-1:visual-2',
                    checksum: imagePayload.sha256
                }),
                kind: 'image'
            })
        )
        expect(artifacts.ensureArtifactVersion).toHaveBeenCalledWith(
            expect.objectContaining({
                artifactId: 'artifact-1',
                idempotencyKey: imagePayload.sha256,
                workspaceFileRef,
                sha256: imagePayload.sha256
            })
        )
        expect(result.artifact).toEqual({
            type: 'xpert.tool-output',
            version: 1,
            attachments: [
                expect.objectContaining({
                    type: 'image',
                    artifactId: 'artifact-1',
                    artifactVersionId: 'artifact-version-1',
                    sha256: imagePayload.sha256,
                    modelDetail: 'high',
                    anchors: expect.objectContaining({
                        knowledgeDocumentId: 'doc-1',
                        visualAssetId: 'visual-2'
                    })
                })
            ]
        })
        expect(result.content).not.toContain('workspaceFileRef')
        expect(result.content).not.toContain('/workspace/')
        expect(JSON.stringify(result.artifact)).not.toContain('previewUrl')
    })

    function createSubject() {
        return { middleware: new KnowledgebaseToolsMiddleware() }
    }

    function context(
        visualAssets: Record<string, unknown>,
        artifacts: Record<string, unknown> = {
            createArtifact: jest.fn(),
            ensureArtifactVersion: jest.fn()
        }
    ) {
        return {
            runtime: {
                capabilities: new DefaultRuntimeCapabilityRegistry([
                    [KnowledgeDocumentVisualAssetsRuntimeCapability, visualAssets],
                    [ArtifactsRuntimeCapability, artifacts]
                ])
            }
        }
    }
})
