import { DocumentSourceProviderCategoryEnum, I18nObject, IDocumentSourceProvider, IIntegration } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { DocumentSourceStrategy, IDocumentSourceStrategy, IntegrationPermission } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { iconImage, LarkDocumentsParams, LarkName } from './types'
import { LarkClient } from './lark.client'

@DocumentSourceStrategy(LarkName)
@Injectable()
export class LarkSourceStrategy implements IDocumentSourceStrategy<LarkDocumentsParams> {
  readonly permissions = [
    {
      type: 'integration',
      service: LarkName,
      description: 'Access to Lark system integrations'
    } as IntegrationPermission
  ]

  readonly meta: IDocumentSourceProvider = {
    name: LarkName,
    category: DocumentSourceProviderCategoryEnum.OnlineDocument,
    label: {
      en_US: 'Lark',
      zh_Hans: '飞书'
    } as I18nObject,
    configSchema: {
      type: 'object',
      properties: {
        folderToken: {
          type: 'string',
          title: {
            en_US: 'Folder Token',
            zh_Hans: '文件夹 Token'
          } as I18nObject,
          description: {
            en_US: 'The folder token to fetch documents from.',
            zh_Hans: '从中获取文档的文件夹 Token。'
          } as I18nObject,
        }
      },
      required: ['folderToken']
    },
    icon: {
      type: 'image',
      value: iconImage,
      color: '#4CAF50'
    }
  }

  async validateConfig(config: LarkDocumentsParams): Promise<void> {
    if (!config.folderToken) {
      throw new Error('Folder Token is required')
    }
  }

  test(config: LarkDocumentsParams): Promise<any> {
    throw new Error('Method not implemented.')
  }

  async loadDocuments(config: LarkDocumentsParams, context?: { integration: IIntegration }): Promise<Document[]> {
    const integration = context?.integration
    if (!integration) {
      throw new Error('Integration system is required')
    }

    await this.validateConfig(config)

    const client = new LarkClient(integration)
    const children = await client.listDriveFiles(config.folderToken)

    const documents: Document[] = children.filter((item) => item.type !== 'folder').map((item) => {
      return new Document({
        id: item.token,
        pageContent: `${item.name}\n${item.url}`,
        metadata: {
          ...item,
          chunkId: item.token,
          title: item.name,
          url: item.url,
          createdAt: item.created_time,
        }
      })
    })

    return documents
  }

  async loadDocument?(document: Document, context: {integration?: IIntegration}): Promise<Document> {
    const integration = context?.integration
    if (!integration) {
      throw new Error('Integration system is required')
    }

    const client = new LarkClient(integration)
    const content = await client.getDocumentContent(document.id)

    return new Document({
      id: document.id,
      pageContent: content,
      metadata: {
        id: document.id,
        title: `Lark Document ${document.id}`,
      }
    })
  }
}
