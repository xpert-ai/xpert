import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Injectable } from '@nestjs/common'
import {
  ChunkMetadata,
  FileSystemPermission,
  IImageUnderstandingStrategy,
  ImageUnderstandingStrategy,
  LLMPermission,
  TImageUnderstandingConfig,
  TImageUnderstandingResult
} from '@xpert-ai/plugin-sdk'
import { buildChunkTree, collectTreeLeaves, IconType, IKnowledgeDocument } from '@metad/contracts'
import { Document, DocumentInterface } from '@langchain/core/documents'
import { join } from 'path'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import { SvgIcon, VlmDefault } from './types'

// Regex for markdown image tag: ![](image.png) or ![alt](image.png)
const IMAGE_REGEX = /!\[[^\]]*\]\s*\(((?:https?:\/\/[^)]+|[^)\s]+))(\s*"[^"]*")?\)/g;

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
      capability: 'vision',
    } as LLMPermission
  ]
  
  readonly meta = {
    name: VlmDefault,
    label: { en_US: 'VLM', zh_Hans: '视觉语言模型' },
    description: {
      en_US: 'Use V(ision)LM to understand images, the knowledge base needs to be configured with a visual model.',
      zh_Hans: '使用视觉大模型来理解图片，知识库需要配置视觉模型。'
    },
    configSchema: {
      type: 'object',
      properties: {}
    },
    icon: {
      type: 'svg' as IconType,
      value: SvgIcon,
      color: '#2d8cf0'
    }
  }

  async validateConfig(config: TImageUnderstandingConfig): Promise<void> {
    if (!config?.visionModel) {
      throw new Error('Vision Model is required')
    }
  }

  async understandImages(
    doc: IKnowledgeDocument<ChunkMetadata>,
    config: TImageUnderstandingConfig
  ): Promise<TImageUnderstandingResult> {

    await this.validateConfig(config)

    const client = config.visionModel // ✅ Injected by the core system
    const params = {
      files: doc.metadata?.assets?.filter((asset) => asset.type === 'image'),
      chunks: doc.chunks as DocumentInterface<ChunkMetadata>[]
    }

    const tree = buildChunkTree(doc.chunks)
    const leaves = collectTreeLeaves(tree)

    const chunks: Document<Partial<ChunkMetadata>>[] = []
    // const pages : Document<Partial<ChunkMetadata>>[] = []

    for await (const chunk of leaves) {
      const assets: string[] = []
      chunk.metadata['chunkId'] ??= uuid()

      // Source Document Block
      chunks.push(chunk)

      // Find image tags inside the chunk
      const matches = Array.from(chunk.pageContent.matchAll(IMAGE_REGEX))
      for (const match of matches) {
        const url = match[1] // image-url.png
        const asset = params.files.find((a) => a.url === url)
        if (asset && !assets.some((_) => _ === asset.url)) {
          const description = await this.runV(client, chunk.pageContent, asset.filePath, config)
          assets.push(asset.url)
          chunks.push(new Document({
            pageContent: description,
            metadata: {
              mediaType: 'image',
              chunkId: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              parentId: chunk.metadata['chunkId'],
              imagePath: asset.filePath,
              // source: asset.filename,
              parser: 'vlm'
            }
          }))
        }
      }
    }

    return {
      chunks,
      // pages,
      metadata: {}
    }
  }

  private async runV(client: BaseChatModel, context: string, imagePath: string, config: TImageUnderstandingConfig): Promise<string> {
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

    // Keep system message concise to minimize token usage
    const systemMessage = 'You are a professional assistant, helping people understand images in context. Please provide a narrative description of the image.'
    
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
      const errorMessage = error?.message || String(error)
      if (errorMessage.includes('Range of input length') || errorMessage.includes('2048')) {
        throw new Error(`Image understanding failed: Input length exceeds model limit (2048 tokens). The image may be too large or the model service has strict input length restrictions. Please try with a smaller image or adjust the model configuration. Original error: ${errorMessage}`)
      }
      // Re-throw other errors
      throw error
    }
  }
}
