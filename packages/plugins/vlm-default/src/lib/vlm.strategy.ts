import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Injectable } from '@nestjs/common'
import {
  ChunkMetadata,
  FileSystemPermission,
  IImageUnderstandingStrategy,
  ImageUnderstandingStrategy,
  LLMPermission,
  TImageUnderstandingConfig,
  TImageUnderstandingInput,
  TImageUnderstandingResult
} from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { v4 as uuid } from 'uuid'
import sharp from 'sharp'
import { VlmDefault } from './types'

// Regex for markdown image tag: ![](image.png) or ![alt](image.png)
const IMAGE_REGEX = /!\[[^\]]*\]\s*\(((?:https?:\/\/[^)]+|[^)\s]+))(\s*"[^"]*")?\)/g;

@Injectable()
@ImageUnderstandingStrategy(VlmDefault)
export class VlmDefaultStrategy implements IImageUnderstandingStrategy {
  readonly permissions = [
    {
      type: 'filesystem',
      operations: ['read'],
      scope: []
    } as FileSystemPermission,
    {
      type: 'llm',
      capability: 'vision',
    } as LLMPermission
  ]
  
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

  async validateConfig(config: TImageUnderstandingConfig): Promise<void> {
    if (!config?.visionModel) {
      throw new Error('Vision Model is required')
    }
  }

  async understandImages(
    params: TImageUnderstandingInput,
    config: TImageUnderstandingConfig
  ): Promise<TImageUnderstandingResult> {

    await this.validateConfig(config)

    const client = config.visionModel // ✅ 已由核心系统注入
    const chunks: Document<Partial<ChunkMetadata>>[] = []
    const pages : Document<Partial<ChunkMetadata>>[] = []

    for await (const chunk of params.chunks) {
      const assets: string[] = []
      chunk.metadata.chunkId ??= uuid()

      // Find image tags inside the chunk
      const matches = Array.from(chunk.pageContent.matchAll(IMAGE_REGEX))
      for (const match of matches) {
        const url = match[1] // image-url.png
        const asset = params.files.find((a) => a.url === url)
        if (asset && !assets.some((_) => _ === asset.url)) {
          const description = await this.runV(client, chunk.pageContent, asset.filePath, config)
          assets.push(asset.url)
          chunks.push(new Document({
            pageContent: description,
            metadata: {
              chunkId: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              parentId: chunk.metadata.parentId ?? chunk.metadata.chunkId,
              imagePath: asset.filePath,
              // source: asset.filename,
              parser: 'vlm'
            }
          }))
        }
      }

      if (assets.length === 0) {
        chunks.push(chunk)
      } else {
        pages.push(chunk) // 原始块，保留图片引用
        chunks.push(new Document({
          pageContent: chunk.pageContent,
          metadata: {
            ...chunk.metadata,
            assets: (chunk.metadata.assets || []).concat(params.files.filter((a) => assets.includes(a.url))),
            chunkId: `txt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            parentId: chunk.metadata.parentId ?? chunk.metadata.chunkId,
          }
        }))
      }
    }

    return {
      chunks,
      pages,
      metadata: {}
    }
  }

  private async runV(client: BaseChatModel, context: string, imagePath: string, config: TImageUnderstandingConfig): Promise<string> {
    const imageStr = await config.permissions.fileSystem.readFile(imagePath)
    const sharped = sharp(imageStr)
    const imageData = await sharped.resize(1024).toBuffer()
    const fileInfo = await sharped.metadata()
    const mimetype = fileInfo.format ? `image/${fileInfo.format}` : 'image/png'

    const response = await client.invoke([
      {
        role: 'system',
        content: 'You are a professional assistant, helping people understand images in context. Please provide a narrative description of the image.'
      },
      {
        role: 'user',
        content: [
          // { type: 'text', text: context },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimetype};base64,${imageData.toString('base64')}`
            }
          }
        ]
      }
    ])

    return response.content as string
  }
}
