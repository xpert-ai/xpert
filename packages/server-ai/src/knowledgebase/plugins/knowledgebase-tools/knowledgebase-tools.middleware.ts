import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
    isAIMessage,
    isToolMessage
} from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import type { ToolOutputImageAttachment, ToolOutputPresentation } from '@xpert-ai/chatkit-types'
import { getToolCallIdFromConfig, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    ArtifactsRuntimeCapability,
    type ArtifactsApi,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    type KnowledgeDocumentPreparedImageArtifact,
    type KnowledgeDocumentViewedImage,
    KnowledgeDocumentVisualAssetsRuntimeCapability,
    type KnowledgeDocumentVisualAssetsApi,
    type ModelRequest
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
    KNOWLEDGEBASE_TOOLS_FEATURE,
    KNOWLEDGEBASE_TOOLS_PROVIDER_KEY,
    KNOWLEDGE_DOCUMENT_IMAGE_BATCH_METADATA_KEY,
    KNOWLEDGE_DOCUMENT_VIEW_IMAGES_TOOL
} from './constants'

const KNOWLEDGE_DOCUMENT_ARTIFACT_PLUGIN = 'xpert.platform.knowledgebase'
const KNOWLEDGE_DOCUMENT_IMAGE_RESOURCE_TYPE = 'knowledge-document-visual-asset'
const KNOWLEDGE_DOCUMENT_VIEW_IMAGES_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-icon="eye">
  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
  <circle cx="12" cy="12" r="3" />
</svg>`

const optionsSchema = z
    .object({
        tools: z.array(z.literal(KNOWLEDGE_DOCUMENT_VIEW_IMAGES_TOOL)).min(1).max(1)
    })
    .strict()

const inputSchema = z
    .object({
        filePaths: z
            .array(
                z
                    .string()
                    .trim()
                    .min(1)
                    .max(1024)
                    .regex(
                        /^knowledge-documents\/[^/]+\/sources\/[^/]+\/visual-assets\/[^/]+$/,
                        'Use only a governed relative filePath returned by the exact KnowledgeDocument search'
                    )
            )
            .min(1)
            .max(3)
    })
    .strict()

type KnowledgebaseToolsOptions = z.infer<typeof optionsSchema>

type ReadyToolCallSet = {
    toolCalls: NonNullable<AIMessage['tool_calls']>
    toolMessagesById: Map<string, ToolMessage>
}

@Injectable()
@AgentMiddlewareStrategy(KNOWLEDGEBASE_TOOLS_PROVIDER_KEY)
export class KnowledgebaseToolsMiddleware implements IAgentMiddlewareStrategy<KnowledgebaseToolsOptions> {
    readonly meta: TAgentMiddlewareMeta = {
        name: KNOWLEDGEBASE_TOOLS_PROVIDER_KEY,
        label: {
            en_US: 'Knowledgebase Tools',
            zh_Hans: '知识库工具'
        },
        description: {
            en_US: 'General, execution-scoped tools for inspecting governed KnowledgeDocument assets.',
            zh_Hans: '提供受执行作用域约束的通用知识库文档工具；首个能力为查看受控图片资产。'
        },
        icon: {
            type: 'svg',
            value: KNOWLEDGE_DOCUMENT_VIEW_IMAGES_ICON
        },
        features: [KNOWLEDGEBASE_TOOLS_FEATURE],
        configSchema: {
            type: 'object',
            properties: {
                tools: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 1,
                    uniqueItems: true,
                    items: {
                        type: 'string',
                        enum: [KNOWLEDGE_DOCUMENT_VIEW_IMAGES_TOOL]
                    },
                    description: {
                        en_US: 'Explicit allow-list of Knowledgebase Tools exposed to this Agent.',
                        zh_Hans: '显式授权给当前 Agent 的知识库工具白名单。'
                    }
                }
            },
            required: ['tools']
        }
    }

    createMiddleware(options: KnowledgebaseToolsOptions, context: IAgentMiddlewareContext): AgentMiddleware {
        const parsedOptions = optionsSchema.parse(options)
        const visualAssets = requireVisualAssets(context)
        const artifacts = requireArtifacts(context)
        const tools = parsedOptions.tools.includes(KNOWLEDGE_DOCUMENT_VIEW_IMAGES_TOOL)
            ? [this.createViewImagesTool(visualAssets, artifacts)]
            : []

        return {
            name: KNOWLEDGEBASE_TOOLS_PROVIDER_KEY,
            tools,
            wrapModelCall: async (request, handler) => {
                const prepared = await prepareModelRequest(request, visualAssets)
                return await handler(prepared)
            }
        }
    }

    private createViewImagesTool(visualAssets: KnowledgeDocumentVisualAssetsApi, artifacts: ArtifactsApi) {
        return tool(
            async (input, config) => {
                const toolCallId = getToolCallIdFromConfig(config) ?? KNOWLEDGE_DOCUMENT_VIEW_IMAGES_TOOL
                const parsed = inputSchema.parse(input)
                if (!parsed.filePaths) throw new BadRequestException('filePaths are required')
                const result = await visualAssets.prepareImages({ filePaths: parsed.filePaths })
                const artifact = await createToolOutputPresentation(result.images, result.artifactInputs, artifacts)
                return new ToolMessage({
                    content: JSON.stringify({
                        message: `${result.images.length} governed KnowledgeDocument image(s) will be attached to the next model step.`,
                        images: result.images
                    }),
                    name: KNOWLEDGE_DOCUMENT_VIEW_IMAGES_TOOL,
                    tool_call_id: toolCallId,
                    status: 'success',
                    artifact,
                    metadata: {
                        [KNOWLEDGE_DOCUMENT_IMAGE_BATCH_METADATA_KEY]: {
                            batchRef: result.batchRef
                        }
                    }
                })
            },
            {
                name: KNOWLEDGE_DOCUMENT_VIEW_IMAGES_TOOL,
                description:
                    'Load up to 3 governed relative filePaths returned by an exact KnowledgeDocument evidence search in the current Agent execution. The platform revalidates the KnowledgeDocument scope and snapshot, then attaches the images at high detail. Absolute paths, URLs, arbitrary relative paths, file IDs and document IDs are rejected.',
                schema: inputSchema,
                verboseParsingErrors: true,
                metadata: {
                    toolName: {
                        en_US: 'View governed source images',
                        zh_Hans: '查看受控来源图像'
                    }
                }
            }
        )
    }
}

function requireArtifacts(context: IAgentMiddlewareContext) {
    const capability = context.runtime.capabilities?.get(ArtifactsRuntimeCapability)
    if (!capability) throw new Error('Artifacts capability is unavailable')
    return capability
}

function requireVisualAssets(context: IAgentMiddlewareContext) {
    const capability = context.runtime.capabilities?.get(KnowledgeDocumentVisualAssetsRuntimeCapability)
    if (!capability) throw new Error('KnowledgeDocument visual assets capability is unavailable')
    return capability
}

async function createToolOutputPresentation(
    images: KnowledgeDocumentViewedImage[],
    artifactInputs: KnowledgeDocumentPreparedImageArtifact[],
    artifacts: ArtifactsApi
): Promise<ToolOutputPresentation> {
    const inputsByIndex = new Map(artifactInputs.map((input) => [input.index, input]))
    const attachments = await Promise.all(
        images.map(async (image): Promise<ToolOutputImageAttachment> => {
            const artifactInput = inputsByIndex.get(image.index)
            if (!artifactInput) {
                throw new Error(`Artifact materialization is missing for KnowledgeDocument image ${image.index}`)
            }
            const title = knowledgeDocumentImageTitle(image)
            const artifact = await artifacts.createArtifact({
                source: {
                    pluginName: KNOWLEDGE_DOCUMENT_ARTIFACT_PLUGIN,
                    resourceType: KNOWLEDGE_DOCUMENT_IMAGE_RESOURCE_TYPE,
                    resourceId: `${image.knowledgeDocumentId}:${image.visualAssetId}`,
                    checksum: image.sha256
                },
                kind: 'image',
                title,
                description: 'Governed KnowledgeDocument image prepared for an Agent vision step.',
                metadata: stableImageMetadata(image)
            })
            const { version } = await artifacts.ensureArtifactVersion({
                artifactId: artifact.id,
                idempotencyKey: image.sha256,
                workspaceFileRef: artifactInput.workspaceFileRef,
                mimeType: image.mimeType,
                fileName: artifactInput.fileName,
                title,
                size: image.size,
                sha256: image.sha256,
                checksum: image.sha256,
                setCurrent: true,
                metadata: stableImageMetadata(image)
            })

            return {
                type: 'image',
                artifactId: artifact.id,
                artifactVersionId: version.id,
                sha256: version.sha256 ?? image.sha256,
                mimeType: image.mimeType,
                ...(image.width ? { width: image.width } : {}),
                ...(image.height ? { height: image.height } : {}),
                title,
                alt: title,
                source: 'knowledge-document',
                modelDetail: 'high',
                anchors: {
                    knowledgeDocumentId: image.knowledgeDocumentId,
                    ...(image.page ? { page: image.page } : {}),
                    ...(image.chunkId ? { chunkId: image.chunkId } : {}),
                    sourceBlockIds: image.sourceBlockIds,
                    visualAssetId: image.visualAssetId
                }
            }
        })
    )

    return {
        type: 'xpert.tool-output',
        version: 1,
        attachments
    }
}

function knowledgeDocumentImageTitle(image: KnowledgeDocumentViewedImage) {
    return image.page ? `KnowledgeDocument image · page ${image.page}` : `KnowledgeDocument image ${image.index}`
}

function stableImageMetadata(image: KnowledgeDocumentViewedImage) {
    return {
        source: 'knowledge-document',
        knowledgeDocumentId: image.knowledgeDocumentId,
        sourceDocumentId: image.sourceDocumentId,
        visualAssetId: image.visualAssetId,
        ...(image.page ? { page: image.page } : {}),
        ...(image.chunkId ? { chunkId: image.chunkId } : {}),
        sourceBlockIds: image.sourceBlockIds,
        candidateReason: image.candidateReason,
        modelDetail: 'high',
        width: image.width,
        height: image.height,
        sha256: image.sha256
    }
}

async function prepareModelRequest<TState extends Record<string, unknown>>(
    request: ModelRequest<TState>,
    visualAssets: KnowledgeDocumentVisualAssetsApi
): Promise<ModelRequest<TState>> {
    const basePrompt = toSystemMessageText(request.systemMessage?.content)
    const systemMessage = new SystemMessage({
        content: [basePrompt, buildSystemPrompt()].filter(Boolean).join('\n\n')
    })
    const ready = findReadyToolCallSet(request.messages)
    if (!ready) return { ...request, systemMessage }

    const batchRefs = ready.toolCalls
        .filter((call) => call.name === KNOWLEDGE_DOCUMENT_VIEW_IMAGES_TOOL && call.id)
        .map((call) => readBatchRef(ready.toolMessagesById.get(call.id as string)))
        .filter((value): value is string => Boolean(value))
    if (!batchRefs.length) return { ...request, systemMessage }

    const batches = await Promise.all(batchRefs.map((batchRef) => visualAssets.consumeImageBatch(batchRef)))
    const images = batches.flat()
    if (images.length > 3) {
        throw new BadRequestException('At most 3 KnowledgeDocument images may be loaded in one model step')
    }
    if (!images.length) return { ...request, systemMessage }

    return {
        ...request,
        systemMessage,
        messages: [
            ...request.messages,
            new HumanMessage({
                content: [
                    {
                        type: 'text',
                        text: buildAttachmentText(images)
                    },
                    ...images.map((image) => ({
                        type: 'image_url',
                        image_url: {
                            url: `data:${image.mimeType};base64,${image.dataBase64}`,
                            detail: 'high' as const
                        }
                    }))
                ]
            })
        ]
    }
}

function buildSystemPrompt() {
    return [
        '<knowledge_document_images>',
        'Only call `knowledge_document_view_images` with governed relative filePaths returned by the exact KnowledgeDocument search in the current execution.',
        'Never use an absolute path, URL, fileId, KnowledgeDocument ID, invented relative path, `view_image`, or `parsed_file_*` call.',
        'Treat an image as evidence only when its visible text, table cells, dimensions, symbols or drawing labels explicitly support the fact.',
        'Persist stable KnowledgeDocument/page/chunk/sourceBlock/visualAssetId anchors, never the execution-scoped filePath.',
        '</knowledge_document_images>'
    ].join('\n')
}

function buildAttachmentText(images: Awaited<ReturnType<KnowledgeDocumentVisualAssetsApi['consumeImageBatch']>>) {
    const anchors = images.map((image) => {
        const values = [
            `image ${image.index}`,
            `KnowledgeDocument ${image.knowledgeDocumentId}`,
            image.page ? `page ${image.page}` : null,
            image.chunkId ? `chunk ${image.chunkId}` : null,
            image.sourceBlockIds.length ? `source blocks ${image.sourceBlockIds.join(', ')}` : null,
            `visual asset ${image.visualAssetId}`
        ].filter(Boolean)
        return values.join(' · ')
    })
    return `The platform loaded the following governed KnowledgeDocument images at high detail. Use only explicit visible content and retain these stable anchors in evidence:\n${anchors.join('\n')}`
}

function readBatchRef(message: ToolMessage | undefined) {
    if (!message?.metadata || typeof message.metadata !== 'object') return undefined
    const value = (message.metadata as Record<string, unknown>)[KNOWLEDGE_DOCUMENT_IMAGE_BATCH_METADATA_KEY]
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const batchRef = (value as Record<string, unknown>)['batchRef']
    return typeof batchRef === 'string' ? batchRef : undefined
}

function findReadyToolCallSet(messages: BaseMessage[]): ReadyToolCallSet | null {
    if (!messages.length) return null
    const trailingToolMessages: ToolMessage[] = []
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (!message || !isToolMessage(message)) {
            if (!trailingToolMessages.length || !isAIMessage(message)) return null
            const toolCalls = (message as AIMessage).tool_calls ?? []
            if (!toolCalls.length) return null
            const expectedIds = new Set(toolCalls.map((call) => call.id).filter(Boolean))
            const toolMessagesById = trailingToolMessages.reduce<Map<string, ToolMessage>>((map, toolMessage) => {
                if (toolMessage.tool_call_id && expectedIds.has(toolMessage.tool_call_id)) {
                    map.set(toolMessage.tool_call_id, toolMessage)
                }
                return map
            }, new Map())
            if (toolMessagesById.size !== expectedIds.size) return null
            return { toolCalls, toolMessagesById }
        }
        trailingToolMessages.unshift(message as ToolMessage)
    }
    return null
}

function toSystemMessageText(content: unknown): string {
    if (typeof content === 'string') return content.trim()
    if (!Array.isArray(content)) return ''
    return content
        .map((item) => {
            if (typeof item === 'string') return item
            if (item && typeof item === 'object' && 'text' in item) {
                return String((item as Record<string, unknown>)['text'] ?? '')
            }
            return ''
        })
        .filter(Boolean)
        .join('\n')
        .trim()
}
