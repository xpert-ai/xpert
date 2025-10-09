import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { Document } from 'langchain/document'
import path from 'path'
import {
  DocumentMetadata,
  DocumentParseResult,
  ENV_UNSTRUCTURED_API_BASE_URL,
  ENV_UNSTRUCTURED_API_TOKEN
} from './types'

const BASE_URL = 'https://api.unstructuredapp.io'

@Injectable()
export class UnstructuredClient {
  private readonly logger = new Logger(UnstructuredClient.name)

  private baseUrl = BASE_URL
  private readonly token: string

  constructor(
    @Inject(forwardRef(() => ConfigService))
    private readonly configService: ConfigService
  ) {
    // Read configuration or environment variables
    this.baseUrl = this.configService.get<string>(ENV_UNSTRUCTURED_API_BASE_URL)
    this.token = this.configService.get<string>(ENV_UNSTRUCTURED_API_TOKEN)
    if (!this.token && this.baseUrl === BASE_URL) {
      throw new Error('UNSTRUCTURED_API_TOKEN is not defined')
    }
  }

  async parseFromFile(filePath: string): Promise<DocumentParseResult> {
    this.logger.log(`Uploading file to Unstructured API: ${filePath}`)

    const url = `${this.baseUrl}/general/v0/general`

    // 1. Build FormData
    const form = new FormData()
    if (/^https?:\/\//i.test(filePath)) {
      // Remote URL
      const fileResponse = await axios.get(filePath, { responseType: 'stream' })
      const filename = path.basename(new URL(filePath).pathname) || 'remote-file'

      form.append('files', fileResponse.data, { filename })
    } else {
      // Local file
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`)
      }
      const filename = path.basename(filePath)
      form.append('files', fs.createReadStream(filePath), { filename })
    }

    const headers = {
        ...form.getHeaders(),
        Accept: 'application/json'
      }
    if (this.token) {
      Object.assign(headers, { Authorization: `Bearer ${this.token}` })
    }

    // 2. Call Unstructured API
    const response = await axios.post<
      {
        element_id: string
        coordinates: number[]
        text: string
        type: string
        metadata: any
      }[]
    >(url, form, {
      headers,
      maxBodyLength: Infinity // Avoid large file errors
    })

    const data = response.data

    // 3. Convert to Documents
    const chunks = data.map(
      (item) =>
        new Document({
          id: item.element_id,
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
