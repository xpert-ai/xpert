import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { Document } from 'langchain/document'
import { DocumentMetadata, DocumentParseResult, ENV_UNSTRUCTURED_API_BASE_URL, ENV_UNSTRUCTURED_API_TOKEN } from './types'

const BASE_URL = 'https://api.unstructuredapp.io'

@Injectable()
export class UnstructuredClient {
  private readonly logger = new Logger(UnstructuredClient.name)

  private baseUrl = BASE_URL
  private readonly token: string;
  
  constructor(
    @Inject(forwardRef(() => ConfigService))
		private readonly configService: ConfigService
    ) {
      // Read configuration or environment variables
      this.baseUrl = this.configService.get<string>(ENV_UNSTRUCTURED_API_BASE_URL)
      this.token = this.configService.get<string>(ENV_UNSTRUCTURED_API_TOKEN);
      if (!this.token && this.baseUrl === BASE_URL) {
        throw new Error('UNSTRUCTURED_API_TOKEN is not defined');
      }
  }

  async parseFromFile(filePath: string): Promise<DocumentParseResult> {
    this.logger.log(`Uploading file to Unstructured API: ${filePath}`)

    const url = `${this.baseUrl}/general/v0/general`

    // 1. 构建 FormData
    const form = new FormData()
    form.append('files', fs.createReadStream(filePath))

    // 2. 调用 Unstructured API
    const response = await axios.post(url, form, {
      headers: form.getHeaders()
    })

    const data = response.data

    // 3. 转换为 DocumentParseResult
    const chunks = data.map(
      (item: any) =>
        new Document({
          pageContent: item.text,
          metadata: {
            type: item.type,
            ...item.metadata
          }
        })
    )

    const metadata: DocumentMetadata = {
      parser: 'unstructured',
      source: filePath,
      rawResponse: data
    }

    return {
      chunks,
      metadata
    }
  }
}
