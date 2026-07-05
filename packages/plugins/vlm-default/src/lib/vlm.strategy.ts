import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Injectable } from '@nestjs/common'
import {
  ChunkMetadata,
  FileSystemPermission,
  getErrorMessage,
  IImageUnderstandingStrategy,
  ImageUnderstandingStrategy,
  LLMPermission,
  TImageUnderstandingConfig,
  TImageUnderstandingResult
} from '@xpert-ai/plugin-sdk'
import { buildChunkTree, collectTreeLeaves, IconType, IKnowledgeDocument } from '@xpert-ai/contracts'
import { Document, DocumentInterface } from '@langchain/core/documents'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import { SvgIcon, VlmDefault } from './types'

// Regex for markdown image tag: ![](image.png) or ![alt](image.png)
const IMAGE_REGEX = /!\[[^\]]*\]\s*\(((?:https?:\/\/[^)]+|[^)\s]+))(\s*"[^"]*")?\)/g
const DEFAULT_PROMPT_TEMPLATE =
  'You are a professional assistant, helping people understand images in context. Please provide a narrative description of the image.'
const CONTEXT_PLACEHOLDER = '{{context}}'

type VlmDefaultConfig = TImageUnderstandingConfig & {
  promptTemplate?: string
}

type ImageUnderstandingWarning = {
  imagePath?: string
  imageUrl?: string
  parentChunkId?: string
  message: string
}

@Injectable()
@ImageUnderstandingStrategy(VlmDefault)
export class VlmDefaultStrategy implements IImageUnderstandingStrategy {
  readonly permissions = [
    {
      type: 'filesystem',
      operations: ['read'],
      scope: []
    } as FileSystemPermission,
    {
      type: 'llm',
      capability: 'vision'
    } as LLMPermission
  ]

  readonly meta = {
    name: VlmDefault,
    label: { en_US: 'VLM', zh_Hans: '视觉语言模型' },
    description: {
      en_US: 'Use V(ision)LM to understand images. Configure a vision model on this node or on the knowledge base.',
      zh_Hans: '使用视觉大模型来理解图片。可在当前节点或知识库上配置视觉模型。'
    },
    configSchema: {
      type: 'object',
      properties: {
        promptTemplate: {
          type: 'string',
          title: {
            en_US: 'Prompt Template',
            zh_Hans: '提示词模板'
          },
          description: {
            en_US:
              'Optional system prompt template for image understanding. Supports {{context}} to inject the current chunk content. Leave empty to use the default prompt.',
            zh_Hans: '可选的视觉理解系统提示词模板。支持使用 {{context}} 注入当前分块内容；留空时使用默认提示词。'
          },
          default: DEFAULT_PROMPT_TEMPLATE,
          'x-ui': {
            component: 'textarea',
            span: 2,
            inputs: {
              rows: 6
            }
          }
        }
      }
    },
    icon: {
      type: 'svg' as IconType,
      value: SvgIcon,
      color: '#2d8cf0'
    }
  }

  async validateConfig(config: VlmDefaultConfig): Promise<void> {
    if (!config?.visionModel) {
      throw new Error('Vision Model is required')
    }
  }

  async understandImages(
    doc: IKnowledgeDocument<ChunkMetadata>,
    config: VlmDefaultConfig
  ): Promise<TImageUnderstandingResult> {
    await this.validateConfig(config)

    const client = config.visionModel // ✅ Injected by the core system
    const params = {
      files: doc.metadata?.assets?.filter((asset) => asset.type === 'image') ?? [],
      chunks: doc.chunks as DocumentInterface<ChunkMetadata>[]
    }

    const tree = buildChunkTree(doc.chunks)
    const leaves = collectTreeLeaves(tree)

    const chunks: Document<Partial<ChunkMetadata>>[] = []
    const warnings: ImageUnderstandingWarning[] = []
    // const pages : Document<Partial<ChunkMetadata>>[] = []

    for await (const chunk of leaves) {
      const assets: string[] = []
      chunk.metadata['chunkId'] ??= uuid()
      const parentChunkId = String(chunk.metadata['chunkId'])
      const parentChunkIndex = getNumber(chunk.metadata['chunkIndex'], chunks.length)
      let imageOffset = 0

      // Source Document Block
      chunks.push(chunk)

      // Find image tags inside the chunk
      const matches = Array.from(chunk.pageContent.matchAll(IMAGE_REGEX))
      for (const match of matches) {
        const url = match[1] // image-url.png
        const asset = params.files.find((a) => a.url === url)
        if (asset && !assets.some((_) => _ === asset.url)) {
          let description: string
          try {
            description = await this.runV(client, chunk.pageContent, asset.filePath, config)
          } catch (error) {
            warnings.push({
              imagePath: asset.filePath,
              imageUrl: asset.url,
              parentChunkId,
              message: getErrorMessage(error)
            })
            continue
          }

          imageOffset++
          assets.push(asset.url)
          chunks.push(
            new Document({
              pageContent: description,
              metadata: {
                mediaType: 'image',
                chunkId: buildImageChunkId(parentChunkId, asset.filePath, asset.order ?? imageOffset),
                chunkIndex: parentChunkIndex + imageOffset / 1000,
                parentId: parentChunkId,
                imagePath: asset.filePath,
                imageUrl: asset.url,
                sourceType: asset.sourceType,
                page: asset.page,
                order: asset.order,
                altText: asset.altText,
                parser: 'vlm'
              }
            })
          )
        }
      }
    }

    return {
      chunks,
      // pages,
      metadata: {
        warnings
      }
    }
  }

  private async runV(
    client: BaseChatModel,
    context: string,
    imagePath: string,
    config: VlmDefaultConfig
  ): Promise<string> {
    const imageStr = await config.permissions.fileSystem.readFile(imagePath)
    const sharped = sharp(imageStr)

    // Reduce image size to minimize Base64 encoding length and avoid exceeding token limits
    // Some model services (e.g., Xinference) have strict input length limits (2048 tokens)
    // Resize to smaller dimension and compress to reduce Base64 string length
    const imageData = await sharped
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()

    const mimetype = 'image/jpeg'

    const systemMessage = this.buildSystemMessage(context, config)

    try {
      const response = await client.invoke([
        {
          role: 'system',
          content: systemMessage
        },
        {
          role: 'user',
          content: [
            // { type: 'text', text: context },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimetype};base64,${imageData.toString('base64')}`
              }
            }
          ]
        }
      ])

      return response.content as string
    } catch (error) {
      // Handle specific error about input length limit
      const errorMessage = getErrorMessage(error)
      if (errorMessage.includes('Range of input length') || errorMessage.includes('2048')) {
        throw new Error(
          `Image understanding failed: Input length exceeds model limit (2048 tokens). The image may be too large or the model service has strict input length restrictions. Please try with a smaller image or adjust the model configuration. Original error: ${errorMessage}`
        )
      }
      // Re-throw other errors
      throw error
    }
  }

  private buildSystemMessage(context: string, config: VlmDefaultConfig): string {
    const promptTemplate = config.promptTemplate?.trim() || DEFAULT_PROMPT_TEMPLATE
    const normalizedContext = context?.trim() || ''

    return promptTemplate
      .split(CONTEXT_PLACEHOLDER)
      .join(normalizedContext)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
}

function buildImageChunkId(parentChunkId: string, imagePath: string, order: number) {
  return `img-${parentChunkId}-${order}-${imagePath}`.replace(/[^a-zA-Z0-9._:-]+/g, '-').slice(0, 180)
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
