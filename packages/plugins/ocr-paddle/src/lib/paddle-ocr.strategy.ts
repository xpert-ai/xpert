import { Injectable } from '@nestjs/common'
import {
  FileSystemPermission,
  IImageUnderstandingStrategy,
  ImageUnderstandingStrategy,
  TImageUnderstandingInput,
  TImageUnderstandingResult
} from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { svg } from './types'

@Injectable()
@ImageUnderstandingStrategy('paddle-ocr')
export class PaddleOCRStrategy implements IImageUnderstandingStrategy<any> {
  readonly permissions = [
    {
      type: 'filesystem',
      operations: ['read'],
      scope: []
    } as FileSystemPermission
  ]
  readonly meta = {
    name: 'paddle-ocr',
    label: { en_US: 'PaddleOCR', zh_Hans: 'PaddleOCR 图片文字识别' },
    description: {
      en_US: 'Use PaddleOCR to extract text from images. Requires a deployed PaddleOCR service.',
      zh_Hans: '使用 PaddleOCR 从图片中提取文字。需要部署 PaddleOCR 服务。'
    },
    configSchema: {
      type: 'object',
      properties: {
        lang: { type: 'string', default: 'ch', description: '语言模型 (ch/en/...)' },
        apiUrl: { type: 'string', description: 'PaddleOCR 服务 API 地址' }
      }
    },
    icon: {
      svg,
      color: '#2d8cf0'
    }
  }

  async validateConfig(config: any): Promise<void> {
    if (!config.apiUrl) {
      throw new Error('PaddleOCR requires `apiUrl` in config')
    }
  }

  async understandImages(params: TImageUnderstandingInput, config: any): Promise<TImageUnderstandingResult> {
    const chunks = []
    for (const file of params.files) {
      const ocrText = await this.runPaddleOCR(file.filePath, config)

      const doc = new Document({
        pageContent: ocrText,
        metadata: {
          chunkId: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          // parentChunkId: file.parentChunkId,
          // imagePath: file.path,
          // source: file.filename,
          type: 'ocr',
          engine: 'paddleocr'
        }
      })

      // results.push({ docs: [doc], metadata: { engine: 'paddleocr', } })
    }

    return {chunks, metadata: { engine: 'paddleocr' }}
  }

  private async runPaddleOCR(imagePath: string, config: any): Promise<string> {
    // 假设 PaddleOCR 部署在 HTTP API 服务中
    // 如果你有 Python gRPC/HTTP 微服务，可以在这里请求
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagePath, lang: config.lang || 'ch' })
    })

    if (!response.ok) {
      throw new Error(`PaddleOCR request failed: ${response.statusText}`)
    }

    const data = await response.json()
    return data.text || ''
  }
}
