import { Document, DocumentInterface } from '@langchain/core/documents'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { IconType, IKnowledgeDocument } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  ChunkMetadata,
  DocumentTransformerStrategy,
  downloadRemoteFile,
  FileSystemPermission,
  IDocumentTransformerStrategy,
  isRemoteFile,
  TDocumentAsset,
  XpFileSystem
} from '@xpert-ai/plugin-sdk'
import fsPromises from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { v4 as uuid } from 'uuid'
import { icon, PdfVisual, TDefaultTransformerConfig } from './types'

const DEFAULT_MAX_RENDERED_PAGES = 300
const DEFAULT_RENDER_SCALE = 2

type PdfToImgDocument = {
  length: number
  getPage(pageNumber: number): Promise<Buffer>
  destroy(): Promise<void>
}

type PdfToImgModule = {
  pdf(input: string, options?: { scale?: number }): Promise<PdfToImgDocument>
}

const importPdfToImg = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<PdfToImgModule>

type TPdfVisualTransformerConfig = TDefaultTransformerConfig & {
  renderPageImages?: boolean
  maxPages?: number
  renderScale?: number
}

@Injectable()
@DocumentTransformerStrategy(PdfVisual)
export class PdfVisualTransformerStrategy implements IDocumentTransformerStrategy<TPdfVisualTransformerConfig> {
  readonly #logger = new Logger(PdfVisualTransformerStrategy.name)

  readonly permissions = [
    {
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: []
    } as FileSystemPermission
  ]

  readonly meta = {
    name: PdfVisual,
    label: {
      en_US: 'PDF Visual',
      zh_Hans: 'PDF 图文'
    },
    description: {
      en_US: 'Extract PDF text and render page images for downstream OCR or VLM understanding.',
      zh_Hans: '提取 PDF 文本并渲染页图，供后续 OCR 或视觉大模型理解。'
    },
    icon: {
      type: 'svg' as IconType,
      value: icon,
      color: '#ef4444'
    },
    configSchema: {
      type: 'object',
      properties: {
        renderPageImages: {
          type: 'boolean',
          default: true,
          title: {
            en_US: 'Render Page Images',
            zh_Hans: '渲染页图'
          }
        },
        maxPages: {
          type: 'number',
          default: DEFAULT_MAX_RENDERED_PAGES,
          title: {
            en_US: 'Max Pages',
            zh_Hans: '最大页数'
          }
        },
        renderScale: {
          type: 'number',
          default: DEFAULT_RENDER_SCALE,
          title: {
            en_US: 'Render Scale',
            zh_Hans: '渲染倍率'
          }
        }
      },
      required: []
    }
  }

  async validateConfig(): Promise<void> {
    //
  }

  async transformDocuments(
    files: Partial<IKnowledgeDocument>[],
    config: TPdfVisualTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]> {
    const xpFileSystem = config.permissions.fileSystem
    const results: Partial<IKnowledgeDocument<ChunkMetadata>>[] = []

    for await (const file of files) {
      const resolvedFile = await this.resolveDocumentFile(file, xpFileSystem, config)
      const textDocuments = await this.loadTextDocuments(resolvedFile.absolutePath)
      const renderPageImages = config.renderPageImages !== false
      const assets: TDocumentAsset[] = []
      let chunks: DocumentInterface<ChunkMetadata>[] = textDocuments

      if (renderPageImages) {
        try {
          const rendered = await this.renderPageImageDocuments(
            file,
            resolvedFile.absolutePath,
            textDocuments,
            xpFileSystem,
            config
          )
          chunks = rendered.chunks
          assets.push(...rendered.assets)
        } catch (error) {
          this.#logger.warn(
            `Failed to render PDF page images for '${file.name ?? file.filePath ?? file.id ?? 'unknown'}': ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
      }

      results.push({
        id: file.id,
        chunks: chunks.map((chunk) => {
          const metadata = (chunk.metadata ?? {}) as ChunkMetadata
          metadata.chunkId ??= uuid()
          chunk.metadata = metadata
          return chunk
        }),
        metadata: {
          ...(file.metadata ?? {}),
          chunkId: ((file.metadata ?? {}) as Partial<ChunkMetadata>).chunkId ?? uuid(),
          assets
        } as ChunkMetadata
      })
    }

    return results
  }

  private async loadTextDocuments(filePath: string) {
    const loader = new PDFLoader(filePath)
    return (await loader.load()) as DocumentInterface<ChunkMetadata>[]
  }

  private async renderPageImageDocuments(
    file: Partial<IKnowledgeDocument>,
    filePath: string,
    textDocuments: DocumentInterface<ChunkMetadata>[],
    xpFileSystem: XpFileSystem,
    config: TPdfVisualTransformerConfig
  ): Promise<{ chunks: DocumentInterface<ChunkMetadata>[]; assets: TDocumentAsset[] }> {
    const { pdf } = await importPdfToImg('pdf-to-img')
    const document = await pdf(filePath, { scale: normalizePositiveNumber(config.renderScale, DEFAULT_RENDER_SCALE) })
    try {
      const maxPages = Math.min(document.length, normalizePositiveInteger(config.maxPages, DEFAULT_MAX_RENDERED_PAGES))
      const textByPage = new Map<number, DocumentInterface<ChunkMetadata>>()
      textDocuments.forEach((chunk, index) => {
        const metadata = chunk.metadata as Record<string, any> | undefined
        const page = Number(metadata?.['loc']?.pageNumber ?? metadata?.['page'] ?? index + 1)
        textByPage.set(page, chunk)
      })

      const assets: TDocumentAsset[] = []
      const chunks: DocumentInterface<ChunkMetadata>[] = []
      for (let page = 1; page <= maxPages; page++) {
        const buffer = await document.getPage(page)
        const fileName = `${safeBaseName(file.name ?? file.filePath ?? 'pdf')}-page-${String(page).padStart(4, '0')}-${randomUUID()}.png`
        const filePath = `images/${fileName}`
        const url = await xpFileSystem.writeFile(filePath, buffer)
        const asset = {
          type: 'image',
          filePath,
          url
        } satisfies TDocumentAsset
        assets.push(asset)

        const text = textByPage.get(page)?.pageContent?.trim()
        chunks.push(
          new Document({
            pageContent: [text, `![Page ${page}](${url})`].filter(Boolean).join('\n\n'),
            metadata: {
              ...(textByPage.get(page)?.metadata ?? {}),
              page,
              source: file.filePath ?? file.fileUrl,
              mediaType: 'image',
              sourceType: 'pdf_page'
            }
          }) as DocumentInterface<ChunkMetadata>
        )
      }

      if (textDocuments.length > maxPages) {
        chunks.push(...textDocuments.slice(maxPages))
      }

      return { chunks, assets }
    } finally {
      await document.destroy().catch(() => undefined)
    }
  }

  private async resolveDocumentFile(
    file: Partial<IKnowledgeDocument>,
    xpFileSystem: XpFileSystem,
    config: TPdfVisualTransformerConfig
  ) {
    const providedFilePath = normalizeFilePath(file.filePath)
    if (providedFilePath) {
      const absolutePath = xpFileSystem.fullPath(providedFilePath)
      if (await exists(absolutePath)) {
        return { absolutePath }
      }
    }

    if (file.fileUrl && isRemoteFile(file.fileUrl)) {
      const tempFileName = `${randomUUID()}.pdf`
      const configuredTempDir = normalizeFilePath(config.tempDir)
      const absolutePath = configuredTempDir
        ? path.join(configuredTempDir, tempFileName)
        : xpFileSystem.fullPath(path.join('tmp', tempFileName))
      await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true })
      await downloadRemoteFile(file.fileUrl, absolutePath)
      return { absolutePath }
    }

    throw new Error(`Unable to resolve a readable PDF for document '${file.name ?? file.id ?? 'unknown'}'.`)
  }
}

function safeBaseName(value: string) {
  return (
    path
      .basename(value)
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 80) || 'pdf'
  )
}

function normalizeFilePath(filePath?: string | null) {
  if (typeof filePath !== 'string') {
    return null
  }
  const normalized = filePath.trim()
  return normalized.length ? normalized : null
}

async function exists(filePath: string) {
  try {
    await fsPromises.access(filePath)
    return true
  } catch {
    return false
  }
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const normalized = typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const normalized = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback
}
