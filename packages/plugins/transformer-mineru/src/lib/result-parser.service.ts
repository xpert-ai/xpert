import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import { Document } from 'langchain/document'
import path from 'path'
import unzipper from 'unzipper'

import { DocumentMetadata, DocumentParseResult, MinerU } from './types'

@Injectable()
export class MinerUResultParserService {
  private readonly logger = new Logger(MinerUResultParserService.name)

  async parseFromUrl(fullZipUrl: string, taskId: string): Promise<DocumentParseResult> {
    this.logger.log(`Downloading MinerU result from: ${fullZipUrl}`)

    // 1. 下载 zip 文件到内存
    const response = await axios.get(fullZipUrl, { responseType: 'arraybuffer' })
    const zipBuffer = Buffer.from(response.data)

    // 2. 解压缩
    const zipEntries: { entryName: string; data: Buffer }[] = []
    const directory = await unzipper.Open.buffer(zipBuffer)
    for (const entry of directory.files) {
      if (!entry.type || entry.type !== 'File') continue
      const data = await entry.buffer()
      zipEntries.push({ entryName: entry.path, data })
    }

    let layoutJson: any = null
    let contentListJson: any = null
    let fullMd = ''
    let originPdfUrl: string | undefined

    for (const entry of zipEntries) {
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

    // 3. 解析 chunks（简单规则：按两行换行符切分）
    const chunks = [new Document({ pageContent: fullMd })]

    // 4. metadata
    const metadata: DocumentMetadata = {
      parser: MinerU,
      taskId,
      originPdfUrl,
      mineruBackend: layoutJson?._backend,
      mineruVersion: layoutJson?._version_name,
      layoutJson,
      contentListJson
    }

    return {
      chunks,
      metadata
    }
  }
}
