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
  TDocumentAsset,
  TImageUnderstandingResult
} from '@xpert-ai/plugin-sdk'
import { buildChunkTree, collectTreeLeaves, IconType, IKnowledgeDocument } from '@xpert-ai/contracts'
import { Document } from '@langchain/core/documents'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import { SvgIcon, VlmDefault } from './types'

// Regex for markdown image tag: ![](image.png) or ![alt](image.png)
const IMAGE_REGEX = /!\[[^\]]*\]\s*\(((?:https?:\/\/[^)]+|[^)\s]+))(\s*"[^"]*")?\)/g
const DEFAULT_PROMPT_TEMPLATE =
  'You are a professional assistant, helping people understand images in context. Please provide a narrative description of the image.'
const CONTEXT_PLACEHOLDER = '{{context}}'
const PAGE_TRANSCRIPTION_PROMPT =
  'Transcribe all visible content of this document page into Markdown in reading order. Preserve headings, lists, table rows and merged-cell relationships. Copy numbers, leading zeroes, codes and punctuation exactly. Do not summarize, describe the page, invent text, or add a preface. Mark unreadable text as [unreadable].'
const PDF_PAGE_SOURCE_TYPE = 'pdf_page'
const PDF_PAGE_MAX_EDGE = 2200
// 512px turned body text on a page render into a few pixels. Keep JPEG, and do not enlarge icons.
const IMAGE_MAX_EDGE = 2048

type VlmDefaultConfig = TImageUnderstandingConfig & {
  promptTemplate?: string
}

type ImageUnderstandingWarning = {
  type: 'image_understanding_failed' | 'image_understanding_skipped'
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
    doc: IKnowledgeDocument<Partial<ChunkMetadata>>,
    config: VlmDefaultConfig
  ): Promise<TImageUnderstandingResult> {
    await this.validateConfig(config)

    const client = config.visionModel
    if (!client) {
      throw new Error('Vision Model is required')
    }
    const files = doc.metadata?.assets?.filter((asset) => asset.type === 'image') ?? []
    // Keep every source chunk; only leaf chunks need image descriptions.
    const chunks: Document<ChunkMetadata>[] = (doc.chunks ?? []).map((chunk) => ({
      ...chunk,
      metadata: { ...chunk.metadata, chunkId: chunk.metadata.chunkId ?? chunk.id ?? uuid() }
    }))
    const sourceOrder = new Map(chunks.map((chunk, index) => [chunk.metadata.chunkId, index]))
    const tree = buildChunkTree(chunks)
    const leaves = collectTreeLeaves(tree)

    const warnings: ImageUnderstandingWarning[] = []
    const processedAssets = new Set<string>()
    const generated = new Map<string, Document<ChunkMetadata>[]>()

    for await (const chunk of leaves) {
      const assets: string[] = []
      const parentChunkId = String(chunk.metadata['chunkId'])
      const parentChunkIndex = getNumber(chunk.metadata['chunkIndex'], sourceOrder.get(parentChunkId) ?? 0)
      let imageOffset = 0

      // Find image tags inside the chunk
      const matches = Array.from(chunk.pageContent.matchAll(IMAGE_REGEX))
      for (const match of matches) {
        const url = match[1] // image-url.png
        const matched = files.find((item) => item.url === url)
        const asset = matched ? resolvePdfPageAsset(matched, chunks) : undefined
        if (asset && !assets.some((item) => item === asset.url)) {
          if (processedAssets.has(asset.filePath)) continue
          if (asset.sourceType === PDF_PAGE_SOURCE_TYPE) processedAssets.add(asset.filePath)
          assets.push(asset.url)
          let description: string
          try {
            const result = await this.runV(client, chunk.pageContent, asset, config)
            if (result.type === 'skipped') {
              processedAssets.add(asset.filePath)
              warnings.push({
                type: 'image_understanding_skipped',
                imagePath: asset.filePath,
                imageUrl: asset.url,
                parentChunkId,
                message: result.reason
              })
              continue
            }
            description = result.text
            if (!description.trim()) throw new Error('The vision model returned no text.')
          } catch (error) {
            warnings.push({
              type: 'image_understanding_failed',
              imagePath: asset.filePath,
              imageUrl: asset.url,
              parentChunkId,
              message: getErrorMessage(error)
            })
            continue
          }

          imageOffset++
          const additions = generated.get(parentChunkId) ?? []
          additions.push(
            new Document({
              pageContent: description,
              metadata: {
                mediaType: 'image',
                chunkId: buildImageChunkId(parentChunkId, asset.filePath, asset.order ?? imageOffset),
                chunkIndex: parentChunkIndex + imageOffset / 1000,
                ...(asset.sourceType === PDF_PAGE_SOURCE_TYPE
                  ? { contentFormat: 'markdown' }
                  : { parentId: parentChunkId }),
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
          generated.set(parentChunkId, additions)
        }
      }
    }

    return {
      chunks: chunks.flatMap((chunk) => [chunk, ...(generated.get(chunk.metadata.chunkId) ?? [])]),
      metadata: {
        warnings
      }
    }
  }

  private async runV(
    client: BaseChatModel,
    context: string,
    asset: TDocumentAsset,
    config: VlmDefaultConfig
  ): Promise<{ type: 'recognized'; text: string } | { type: 'skipped'; reason: string }> {
    const imageStr = await config.permissions.fileSystem.readFile(asset.filePath)
    const sharped = sharp(imageStr)
    const page = asset.sourceType === PDF_PAGE_SOURCE_TYPE
    const { width, height } = await sharped.metadata()
    if (width === 1 || height === 1) {
      if (page) throw new Error(`PDF page image is too small to recognize (${width}x${height}).`)
      return { type: 'skipped', reason: `Skipped a ${width}x${height} placeholder image.` }
    }

    const maxEdge = page ? PDF_PAGE_MAX_EDGE : IMAGE_MAX_EDGE
    const resized = sharped.resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
    const imageData = await (page ? resized.png() : resized.jpeg({ quality: 85, mozjpeg: true })).toBuffer()

    const mimetype = page ? 'image/png' : 'image/jpeg'

    const systemMessage = page ? PAGE_TRANSCRIPTION_PROMPT : this.buildSystemMessage(context, config)

    try {
      const response = await client.invoke([
        {
          role: 'system',
          content: systemMessage
        },
        {
          role: 'user',
          content: [
            ...(page && config.promptTemplate?.trim()
              ? [{ type: 'text', text: this.buildSystemMessage(context, config) }]
              : []),
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

      return {
        type: 'recognized',
        text:
          typeof response.content === 'string'
            ? response.content
            : response.content
                .flatMap((part) => (part.type === 'text' && typeof part.text === 'string' ? [part.text] : []))
                .join('\n')
      }
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

/** A copied document asset can omit sourceType while a chunk, or that chunk's asset list, still marks the page. */
function resolvePdfPageAsset(asset: TDocumentAsset, chunks: Document<ChunkMetadata>[]): TDocumentAsset {
  if (asset.sourceType === PDF_PAGE_SOURCE_TYPE) {
    return asset
  }
  const listed = chunks
    .flatMap((chunk) => chunk.metadata.assets ?? [])
    .find((item) => item.sourceType === PDF_PAGE_SOURCE_TYPE && isSameImageAsset(item, asset))
  if (listed) {
    return withPdfPage(asset, listed.page)
  }
  const markedChunk = chunks.find(
    (chunk) => chunk.metadata['sourceType'] === PDF_PAGE_SOURCE_TYPE && chunkReferencesImage(chunk, asset)
  )
  if (!markedChunk) {
    return asset
  }
  return withPdfPage(asset, markedChunk.metadata.page)
}

function withPdfPage(asset: TDocumentAsset, page: unknown): TDocumentAsset {
  if (asset.page !== undefined || typeof page !== 'number') {
    return { ...asset, sourceType: PDF_PAGE_SOURCE_TYPE }
  }
  return { ...asset, sourceType: PDF_PAGE_SOURCE_TYPE, page }
}

function isSameImageAsset(left: TDocumentAsset, right: TDocumentAsset): boolean {
  return (
    (left.url.length > 0 && left.url === right.url) || (left.filePath.length > 0 && left.filePath === right.filePath)
  )
}

function chunkReferencesImage(chunk: Document<ChunkMetadata>, asset: TDocumentAsset): boolean {
  return asset.url.length > 0 && chunk.pageContent.includes(asset.url)
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
