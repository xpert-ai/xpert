import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { Injectable, Logger } from '@nestjs/common'
import {
  DocumentTransformerStrategy,
  downloadRemoteFile,
  FileSystemPermission,
  IDocumentTransformerStrategy,
  isRemoteFile,
  TDocumentTransformerFile
} from '@xpert-ai/plugin-sdk'
import fsPromises from 'fs/promises'
import { Document } from 'langchain/document'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import path from 'path'
import { Default, icon, TDefaultTransformerConfig, TDocumentParseResult } from './types'

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
  meta = {
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
      svg: icon,
      color: '#14b8a6'
    },
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async transformDocuments(
    files: TDocumentTransformerFile[],
    config: TDefaultTransformerConfig
  ): Promise<TDocumentParseResult[]> {
    const xpFileSystem = config.permissions.fileSystem
    this.#logger.debug('Transforming documents:')
    this.#logger.debug('Files:', files)

    const results = []
    for await (const file of files) {
      if (!file.filePath && isRemoteFile(file.fileUrl)) {
        const tempDir = config.tempDir || '/tmp/'
        const filePath = path.join(tempDir, file.filename)
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
        file.filePath = await downloadRemoteFile(file.fileUrl, filePath)
      } else {
        file.filePath = xpFileSystem.fullPath(file.filePath)
      }
      let data: Document[]
      switch (file.extension?.toLowerCase()) {
        case 'md':
        case 'mdx':
        case 'markdown':
          data = await this.processMarkdown(file.filePath)
          break
        case 'pdf':
          data = await this.processPdf(file.filePath)
          break
        case 'epub':
          data = await this.processEpub(file.filePath)
          break
        case 'doc':
        case 'docx':
          data = await this.processDocx(file.filePath)
          break
        case 'pptx':
          data = await this.processPPT(file.filePath)
          break
        case 'xlsx':
          data = await this.processExcel(file.filePath)
          break
        case 'odt':
        case 'ods':
        case 'odp':
          data = await this.processOpenDocument(file.filePath)
          break
        default:
          data = await this.processText(file.filePath)
          break
      }

      results.push({
        id: file.id,
        chunks: data
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
}
