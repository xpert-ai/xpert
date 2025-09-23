import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { Injectable } from '@nestjs/common'
import {
  DocumentTransformerStrategy,
  downloadRemoteFile,
  IDocumentTransformerStrategy,
  isRemoteFile,
  TDocumentTransformerFile
} from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import fsPromises from 'fs/promises'
import { Default, TDocumentParseResult, icon, TDefaultTransformerConfig } from './types'
import path from 'path'

@Injectable()
@DocumentTransformerStrategy(Default)
export class DefaultTransformerStrategy implements IDocumentTransformerStrategy<TDefaultTransformerConfig> {
  readonly permissions = []
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
    const results = []
    for await (const file of files) {
      if (isRemoteFile(file.url)) {
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
        file.url = await downloadRemoteFile(file.url, filePath)
      }
      let data: Document[]
      switch (file.extname?.toLowerCase()) {
        case 'md':
        case 'mdx':
        case 'markdown':
          data = await this.processMarkdown(file.url)
          break
        case 'pdf':
          data = await this.processPdf(file.url)
          break
        case 'epub':
          data = await this.processEpub(file.url)
          break
        case 'doc':
        case 'docx':
          data = await this.processDocx(file.url)
          break
        case 'pptx':
          data = await this.processPPT(file.url)
          break
        case 'xlsx':
          data = await this.processExcel(file.url)
          break
        case 'odt':
        case 'ods':
        case 'odp':
          data = await this.processOpenDocument(file.url)
          break
        default:
          data = await this.processText(file.url)
          break
      }

      results.push({
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
