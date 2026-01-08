import { Document, DocumentInterface } from '@langchain/core/documents'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { IconType, IKnowledgeDocument, KBDocumentCategoryEnum } from '@metad/contracts'
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
      let fileAbsPath = ''
      if (!file.filePath && isRemoteFile(file.fileUrl)) {
        const tempDir = config.tempDir || '/tmp/'
        const filePath = path.join(tempDir, file.filePath)
        // Ensure the temp directory exists
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true })

        // If file already exists, remove it
        try {
          const stat = await fsPromises.stat(filePath)
          if (stat.isFile()) {
            await fsPromises.unlink(filePath)
          } else {
            // If it's a directory, remove or throw
            throw new Error(`Destination path exists and is a directory: ${filePath}`)
          }
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            throw err
          }
          // ENOENT means "not exist", safe to continue
        }

        // Download the remote file to a local temporary directory
        fileAbsPath = await downloadRemoteFile(file.fileUrl, filePath)
      } else {
        // Check if file.filePath is already an absolute path or contains full path segments
        // If it is, use it directly; otherwise, use xpFileSystem.fullPath() to resolve it
        if (file.filePath) {
          const isAbsolutePath = path.isAbsolute(file.filePath)
          // Also check if it looks like a full path even without leading slash
          // (e.g., contains /apps/api/public/ or /项目/ or starts with Users/ or home/)
          const looksLikeFullPath = !isAbsolutePath && (
            file.filePath.startsWith('Users/') ||
            file.filePath.startsWith('home/')
          )
          
          if (isAbsolutePath) {
            fileAbsPath = file.filePath
          } else if (looksLikeFullPath) {
            // If it looks like a full path but doesn't start with /, add it
            fileAbsPath = file.filePath.startsWith('/') ? file.filePath : '/' + file.filePath
          } else {
            // Use xpFileSystem.fullPath() to resolve relative path to absolute path
            // xpFileSystem.basePath is set to storage provider's rootPath
            fileAbsPath = xpFileSystem.fullPath(file.filePath)
          }
          
          // Verify file exists and log path for debugging
          try {
            await fsPromises.access(fileAbsPath)
            // Use warn level to ensure it's visible (default log level is 'warn', so debug/log may not output)
            this.#logger.warn(`[Transformer] File found: ${fileAbsPath}, original filePath: ${file.filePath}`)
          } catch (err: any) {
            // Log error with detailed information for debugging
            const basePath = xpFileSystem ? (xpFileSystem as any).basePath : 'N/A'
            this.#logger.error(`[Transformer] File not found: ${fileAbsPath}, original filePath: ${file.filePath}, xpFileSystem.basePath: ${basePath}`)
            throw new Error(`File not found: ${fileAbsPath}`)
          }
        } else {
          fileAbsPath = ''
        }
        file.fileUrl ??= xpFileSystem.fullUrl(file.filePath)
      }
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
              data = await this.processImage(file.name, file.fileUrl)
              assets.push({
                type: 'image',
                url: file.fileUrl,
                filePath: file.filePath
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
