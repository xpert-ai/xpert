import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Injectable } from '@nestjs/common'
import {
  IImageUnderstandingStrategy,
  ImageUnderstandingStrategy,
  TImageUnderstandingConfig,
  TImageUnderstandingFile,
  TImageUnderstandingResult
} from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { VlmDefault } from './types'

@Injectable()
@ImageUnderstandingStrategy(VlmDefault)
export class VlmDefaultStrategy implements IImageUnderstandingStrategy {
  readonly meta = {
    name: VlmDefault,
    label: { en_US: 'VLM', zh_Hans: '视觉语言模型' },
    description: {
      en_US: 'Use V(ision)LM to understand images, the knowledge base needs to be configured with a visual model.',
      zh_Hans: '使用视觉大模型来理解图片，知识库需要配置视觉模型。'
    },
    configSchema: {
      type: 'object',
      properties: {}
    },
    icon: {
      svg: `<?xml version="1.0" encoding="utf-8"?>
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 960 960" style="enable-background:new 0 0 960 960;" xml:space="preserve">
<style type="text/css">
	.st0{fill:#135468;}
	.st1{fill:#FFFFFF;}
	.st2{fill:#6DBCDB;}
	.st3{fill:#333333;}
	.st4{fill:none;stroke:#FFFFFF;stroke-width:22.1618;stroke-linecap:round;stroke-miterlimit:10;}
</style>
<g>
	<circle class="st0" cx="480" cy="480" r="300.9"/>
	<path class="st1" d="M750.4,480c0,0-121.1,130-270.4,130S209.6,480,209.6,480S330.7,350,480,350S750.4,480,750.4,480z"/>
	<path class="st1" d="M750.4,480c0,0-121.1,130-270.4,130S209.6,480,209.6,480S330.7,350,480,350S750.4,480,750.4,480z"/>
	<circle class="st2" cx="480" cy="478.4" r="102.8"/>
	<circle class="st3" cx="480" cy="478.4" r="58.6"/>
	<circle class="st1" cx="441.2" cy="444.1" r="24.3"/>
	<line class="st4" x1="363.1" y1="323.7" x2="328.1" y2="286.8"/>
	<line class="st4" x1="631.9" y1="286.8" x2="596.9" y2="323.7"/>
	<line class="st4" x1="482.7" y1="300.9" x2="482.7" y2="256.8"/>
</g>
</svg>
`,
      color: '#2d8cf0'
    }
  }

  async validateConfig(config: any): Promise<void> {
    if (!config.apiUrl) {
      throw new Error('PaddleOCR requires `apiUrl` in config')
    }
  }

  async understandImages(
    files: TImageUnderstandingFile[],
    config: TImageUnderstandingConfig
  ): Promise<TImageUnderstandingResult[]> {
    const client = config.chatModel // ✅ 已由核心系统注入
    const results: TImageUnderstandingResult[] = []

    for (const file of files) {
      const description = await this.runGPT4V(client, file.path, config)

      const doc = new Document({
        pageContent: description,
        metadata: {
          chunkId: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          parentChunkId: file.parentChunkId,
          imagePath: file.path,
          source: file.filename,
          type: 'vlm'
        }
      })

      results.push({
        docs: [doc],
        metadata: { file: file.filename }
      })
    }

    return results
  }

  private async runGPT4V(client: BaseChatModel, imagePath: string, config: any): Promise<string> {
    // client 已经是 openai client，由核心系统实例化
    const response = await client.invoke([
      {
        role: 'user',
        content: [
          { type: 'text', text: config.prompt || 'Describe this image in detail.' },
          { type: 'image_url', image_url: { url: imagePath } }
        ]
      }
    ])

    return response.content as string
  }
}
