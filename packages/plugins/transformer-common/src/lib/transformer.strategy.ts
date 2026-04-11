import { Document, DocumentInterface } from '@langchain/core/documents'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { IconType, IKnowledgeDocument, KBDocumentCategoryEnum } from '@xpert-ai/contracts'
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
import fs from 'fs'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { randomUUID } from 'crypto'
import fsPromises from 'fs/promises'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { v4 as uuid } from 'uuid'
import path from 'path'
import { Default, icon, TDefaultTransformerConfig, TDefaultTransformerMetadata } from './types'

type TResolvedDocumentFile = {
  absolutePath: string
  runtimeFilePath: string
  runtimeFileUrl: string
}

@Injectable()
@DocumentTransformerStrategy(Default)
export class DefaultTransformerStrategy implements IDocumentTransformerStrategy<TDefaultTransformerConfig> {
  readonly #logger = new Logger(DefaultTransformerStrategy.name)

  readonly permissions = [
    {
      type: 'filesystem',
      operations: ['read', 'write', 'list'],
      scope: []
    } as FileSystemPermission
  ]
  
  readonly meta = {
    name: Default,
    label: {
      en_US: 'Default',
      zh_Hans: '默认'
    },
    description: {
      en_US: 'Default text transformer.',
      zh_Hans: '默认文本转换器。'
    },
    icon: {
      type: 'svg' as IconType,
      value: icon,
      color: '#14b8a6'
    },
    configSchema: {
      type: 'object',
      properties: {
        replaceWhitespace: {
          type: 'boolean',
          title: {
            en_US: 'Replace Whitespace',
            zh_Hans: '替换空白字符'
          },
          description: {
            en_US: 'Whether to replace all whitespace characters with a single space. Replace consecutive spaces, newlines, and tabs.',
            zh_Hans: '是否将所有空白字符替换为单个空格。替换掉连续的空格、换行符和制表符。'
          },
        },
        removeSensitive: {
          type: 'boolean',
          title: {
            en_US: 'Remove Sensitive Information',
            zh_Hans: '移除敏感信息'
          },
          description: {
            en_US: 'Whether to remove sensitive information from the document. Remove all URLs and email addresses.',
            zh_Hans: '是否从文档中移除敏感信息。删除所有 URL 和电子邮件地址。'
          },
        }
      },
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async transformDocuments(
    files: Partial<IKnowledgeDocument>[],
    config: TDefaultTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<TDefaultTransformerMetadata>>[]> {
    const xpFileSystem = config.permissions.fileSystem
    this.#logger.debug('Transforming common documents:')

    const results = []
    for await (const file of files) {
      const assets: TDocumentAsset[] = []
      const resolvedFile = await this.resolveDocumentFile(file, xpFileSystem)
      const fileAbsPath = resolvedFile.absolutePath
      const runtimeFilePath = resolvedFile.runtimeFilePath
      const runtimeFileUrl = resolvedFile.runtimeFileUrl

      let data: DocumentInterface[]
      const extension = file.name?.split('.').pop()
      switch (extension?.toLowerCase()) {
        case 'md':
        case 'mdx':
        case 'markdown':
          data = await this.processMarkdown(fileAbsPath)
          break
        case 'pdf':
          data = await this.processPdf(fileAbsPath)
          break
        case 'epub':
          data = await this.processEpub(fileAbsPath)
          break
        case 'doc':
          data = await this.processDoc(fileAbsPath)
          break
        case 'docx': {
          const {chunks, imageAssets} = await this.processDocx(fileAbsPath, xpFileSystem)
          data = chunks
          imageAssets.forEach((asset) => assets.push(asset))
          break
        }
        case 'pptx':
          data = await this.processPPT(fileAbsPath)
          break
        case 'xlsx':
          data = await this.processExcel(fileAbsPath)
          break
        case 'odt':
        case 'ods':
        case 'odp':
          data = await this.processOpenDocument(fileAbsPath)
          break
        default:
          switch (file.category) {
            case KBDocumentCategoryEnum.Image: {
              data = await this.processImage(file.name, runtimeFileUrl)
              assets.push({
                type: 'image',
                url: runtimeFileUrl,
                filePath: runtimeFilePath
              })
              break;
            }
            default: {
              data = await this.processText(fileAbsPath)
              break
            }
          }
          break
      }
      
      results.push({
        id: file.id,
        chunks: data.map((_) => {
          const doc = _ as DocumentInterface<ChunkMetadata>
          doc.metadata['chunkId'] ??= uuid()

          // Text Preprocessing
          if (config?.replaceWhitespace) {
            doc.pageContent = doc.pageContent.replace(/[\s\n\t]+/g, ' ') // Replace consecutive spaces, newlines, and tabs
          }
          if (config?.removeSensitive) {
            doc.pageContent = doc.pageContent.replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
            doc.pageContent = doc.pageContent.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '') // Remove email addresses
          }
          return doc
        }),
        metadata: {
          assets
        }
      })
    }

    return results
  }

  private async resolveDocumentFile(
    file: Partial<IKnowledgeDocument>,
    xpFileSystem: XpFileSystem
  ): Promise<TResolvedDocumentFile> {
    const providedFilePath = this.normalizeFilePath(file.filePath)
    if (providedFilePath) {
      const absolutePath = xpFileSystem.fullPath(providedFilePath)
      if (await this.exists(absolutePath)) {
        return {
          absolutePath,
          runtimeFilePath: providedFilePath,
          runtimeFileUrl: file.fileUrl ?? xpFileSystem.fullUrl(providedFilePath)
        }
      }

      this.#logger.debug(
        `File path '${providedFilePath}' for document '${file.name ?? file.id ?? 'unknown'}' is not available in the knowledge workspace. Falling back to fileUrl download.`
      )
    }

    if (file.fileUrl && isRemoteFile(file.fileUrl)) {
      const runtimeFilePath = path.join('tmp', this.buildTempFileName(file))
      const absolutePath = xpFileSystem.fullPath(runtimeFilePath)

      await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true })
      await this.removeFileIfExists(absolutePath)
      await downloadRemoteFile(file.fileUrl, absolutePath)

      return {
        absolutePath,
        runtimeFilePath,
        runtimeFileUrl: file.fileUrl
      }
    }

    throw new Error(
      `Unable to resolve a readable file for document '${file.name ?? file.id ?? 'unknown'}'.`
    )
  }

  private buildTempFileName(file: Partial<IKnowledgeDocument>) {
    const extension = this.getFileExtension(file)
    return `${randomUUID()}${extension ? `.${extension}` : ''}`
  }

  private getFileExtension(file: Partial<IKnowledgeDocument>) {
    const candidates = [file.name, file.filePath, file.fileUrl]
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        continue
      }

      const sanitized = candidate.split('?')[0].split('#')[0]
      const baseName = path.basename(sanitized)
      const extension = baseName.split('.').pop()?.trim().toLowerCase()
      if (extension && extension !== baseName.toLowerCase()) {
        return extension
      }
    }

    return ''
  }

  private normalizeFilePath(filePath?: string | null) {
    if (typeof filePath !== 'string') {
      return null
    }

    const normalized = filePath.trim()
    return normalized.length ? normalized : null
  }

  private async exists(filePath: string) {
    try {
      await fsPromises.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async removeFileIfExists(filePath: string) {
    try {
      const stat = await fsPromises.stat(filePath)
      if (!stat.isFile()) {
        throw new Error(`Destination path exists and is not a file: ${filePath}`)
      }
      await fsPromises.unlink(filePath)
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }
  }

  async processMarkdown(url: string): Promise<Document<Record<string, any>>[]> {
    return this.processText(url)
  }

  async processPdf(url: string): Promise<Document<Record<string, any>>[]> {
    const loader = new PDFLoader(url)
    return await loader.load()
  }

  async processEpub(url: string): Promise<Document<Record<string, any>>[]> {
    const loader = new EPubLoader(url, { splitChapters: false })
    return await loader.load()
  }

  async processDoc(filePath: string): Promise<Document<Record<string, any>>[]> {
    const loader = new DocxLoader(filePath)
    return await loader.load()
  }

  async processText(url: string): Promise<Document<Record<string, any>>[]> {
    const loader = new TextLoader(url)
    return await loader.load()
  }

  async processPPT(url: string): Promise<Document<Record<string, any>>[]> {
    const loader = new PPTXLoader(url)
    return await loader.load()
  }

  async processExcel(url: string): Promise<Document<Record<string, any>>[]> {
    const loader = new PPTXLoader(url)
    return await loader.load()
  }
  async processOpenDocument(url: string): Promise<Document<Record<string, any>>[]> {
    const loader = new PPTXLoader(url)
    return await loader.load()
  }

  async processImage(name: string, url: string) {
    return [
      new Document({
        pageContent: `![${name}](${url})`,
        metadata: {
          source: url
        }
      })
    ]
  }

  /**
   * Parse DOCX => Markdown + Extract Images + Return LangChain Documents
   */
  async processDocx(filePath: string, xpFileSystem: XpFileSystem): Promise<{chunks: Document[]; imageAssets: TDocumentAsset[]}> {
    const imageOutputDir = xpFileSystem.fullPath('images')

    if (!fs.existsSync(imageOutputDir)) {
      fs.mkdirSync(imageOutputDir, { recursive: true })
    }

    const imageAssets: TDocumentAsset[] = []
    const result = await mammoth.convertToHtml(
      { path: filePath },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          // Reading image binary
          const imageBuffer = await image.read();
          const ext = image.contentType?.split("/")[1] ?? "png";

          // Random filename
          const fileName = `${randomUUID()}.${ext}`;

          // Save to disk
          const url = await xpFileSystem.writeFile(`images/${fileName}`, imageBuffer)

          imageAssets.push({
            type: 'image',
            filePath: `images/${fileName}`,
            url: url
          });

          // Returns the src path used internally by the HTML.
          return {
            src: url, // Used to generate HTML/Markdown
          };
        }),
      },
    )

    const html = result.value // HTML text

    // --- 2) HTML → Markdown ---
    const md = htmlToMarkdown(html)

    // --- 3) Generate LangChain Document[] ---
    const chunks: Document[] = [
      new Document({
        pageContent: md,
        metadata: {
          // source: filePath,
        },
      }),
    ]

    return { chunks, imageAssets: imageAssets }
  }
}

/**
 * Convert html → markdown
 */
function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService()
  const md = turndown.turndown(html)

  return md
}
