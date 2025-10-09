import { Injectable, Logger } from '@nestjs/common'
import { ChunkMetadata, TDocumentAsset, XpFileSystem } from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import { Document } from 'langchain/document'
import path from 'path'
import unzipper from 'unzipper'
import { MinerU, TDocumentParseResult } from './types'
import { v4 as uuidv4 } from 'uuid'

@Injectable()
export class MinerUResultParserService {
  private readonly logger = new Logger(MinerUResultParserService.name)

  async parseFromUrl(fullZipUrl: string, taskId: string, fileSystem: XpFileSystem): Promise<TDocumentParseResult> {
    this.logger.log(`Downloading MinerU result from: ${fullZipUrl}`)

    // 1. Download the zip file to memory
    const response = await axios.get(fullZipUrl, { responseType: 'arraybuffer' })
    const zipBuffer = Buffer.from(response.data)

    // 2. Unzip the file
    const zipEntries: { entryName: string; data: Buffer }[] = []
    const assets: TDocumentAsset[] = []
    const directory = await unzipper.Open.buffer(zipBuffer)
    for (const entry of directory.files) {
      if (!entry.type || entry.type !== 'File') continue
      const data = await entry.buffer()
      zipEntries.push({ entryName: entry.path, data })
      // Write images to local file system
      if (entry.path.startsWith('images/')) {
        const url = await fileSystem.writeFile(entry.path, data)
        assets.push({
          type: 'image',
          url,
          filePath: entry.path
        })
      }
    }

    let layoutJson: any = null
    let contentListJson: any = null
    let fullMd = ''
    let originPdfUrl: string | undefined

    for (const entry of zipEntries) {
      console.log('MinerU zip entry:', entry.entryName)
      const fileName = entry.entryName
      const ext = path.extname(fileName)

      if (fileName.endsWith('layout.json')) {
        layoutJson = JSON.parse(entry.data.toString('utf-8'))
      } else if (fileName.endsWith('content_list.json')) {
        contentListJson = JSON.parse(entry.data.toString('utf-8'))
      } else if (fileName.endsWith('full.md')) {
        fullMd = entry.data.toString('utf-8')
      } else if (fileName.endsWith('origin.pdf')) {
        originPdfUrl = fileName
      }
    }

    // 3. Parse chunks (simple rule: split by two newlines)
    fullMd = fullMd.replace(/!\[(.*)\]\((images\/.+?)\)/g, (match, p1, p2) => {
      const localPath = assets.find((asset) => asset.filePath === p2)?.url
      return localPath ? `![${p1}](${localPath})` : match
    })
    const chunks = [new Document<ChunkMetadata>({ pageContent: fullMd, metadata: { parser: MinerU, taskId, chunkId: uuidv4() } })]

    // 4. metadata
    const metadata: TDocumentParseResult['metadata'] = {
      parser: MinerU,
      taskId,
      originPdfUrl,
      mineruBackend: layoutJson?._backend,
      mineruVersion: layoutJson?._version_name,
      layoutJson,
      contentListJson,
      assets
    }

    return {
      chunks,
      metadata
    }
  }
}
