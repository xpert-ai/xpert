import { Injectable } from '@nestjs/common'
import { Document } from '@langchain/core/documents'
import {
  DocumentTransformerStrategy,
  IDocumentTransformerStrategy,
  IntegrationPermission,
  TDocumentTransformerConfig,
} from '@xpert-ai/plugin-sdk'
import { IconType, IKnowledgeDocument } from '@metad/contracts'
import { iconImage, LarkDocumentMetadata, LarkDocumentName, LarkName } from './types'
import { LarkClient } from './lark.client'

@Injectable()
@DocumentTransformerStrategy(LarkDocumentName)
export class LarkDocTransformerStrategy implements IDocumentTransformerStrategy<TDocumentTransformerConfig> {

  readonly permissions = [
    {
      type: 'integration',
      service: LarkName,
      description: 'Access to Lark system integrations'
    } as IntegrationPermission,
  ]

  readonly meta = {
    name: LarkDocumentName,
    label: {
      en_US: 'Lark Document',
      zh_Hans: '飞书文档'
    },
    description: {
      en_US: 'Load content from Lark documents',
      zh_Hans: '加载飞书文档内容'
    },
    icon: {
      type: 'image' as IconType,
      value: iconImage,
      color: '#14b8a6'
    },
    helpUrl: 'https://open.feishu.cn/document/server-docs/docs/docs-overview',
    configSchema: {
      type: 'object',
      properties: {
        isOcr: {
          type: 'boolean',
          title: {
            en_US: 'Enable OCR',
            zh_Hans: '启用 OCR'
          },
          description: {
            en_US: 'Enable OCR for image-based PDFs.',
            zh_Hans: '对基于图像的 PDF 启用 OCR。'
          },
          default: true
        }
      },
      required: []
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async transformDocuments(
    files: Partial<IKnowledgeDocument<LarkDocumentMetadata>>[],
    config: TDocumentTransformerConfig
  ): Promise<Partial<IKnowledgeDocument<LarkDocumentMetadata>>[]> {
    const integration = config?.permissions?.integration
    if (!integration) {
      throw new Error('Integration system is required')
    }

    console.log('LarkDocTransformerStrategy transformDocuments', files, config)

    const client = new LarkClient(integration)
    
    const results: Partial<IKnowledgeDocument<LarkDocumentMetadata>>[] = []
    for await (const file of files) {
      const content = await client.getDocumentContent(file.metadata.token)
      results.push({
        id: file.id,
        chunks: [
          new Document({
            id: file.id,
            pageContent: content,
            metadata: {
              chunkId: file.id,
              source: LarkName,
              sourceId: file.id
            }
          })
        ],
        metadata: {
          assets: []
        } as LarkDocumentMetadata
      })
    }
    return results
  }
}
