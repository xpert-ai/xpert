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
} from '@xpert-ai/plugin-sdk'
import fsPromises from 'fs/promises'
import { Document, DocumentInterface } from '@langchain/core/documents'
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
        fileAbsPath = xpFileSystem.fullPath(file.filePath)
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
        case 'docx':
          data = await this.processDocx(fileAbsPath)
          break
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

  async processDocx(url: string): Promise<Document<Record<string, any>>[]> {
    const loader = new DocxLoader(url)
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
}
