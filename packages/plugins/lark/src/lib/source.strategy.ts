import { DocumentSourceProviderCategoryEnum, I18nObject, IDocumentSourceProvider, IIntegration } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { DocumentSourceStrategy, IDocumentSourceStrategy, IntegrationPermission } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { iconImage, LarkDocumentsParams, LarkName } from './types'

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
        url: {
          type: 'string',
          title: {
            en_US: 'URL',
            zh_Hans: 'URL'
          } as I18nObject,
          description: {
            en_US: 'The URL to crawl.',
            zh_Hans: '要抓取的 URL。'
          } as I18nObject,
          default: 'https://docs.firecrawl.dev/introduction'
        }
      },
      required: []
    },
    icon: {
      type: 'image',
      value: iconImage,
      color: '#4CAF50'
    }
  }

  validateConfig(config: LarkDocumentsParams): Promise<void> {
    throw new Error('Method not implemented.')
  }
  test(config: LarkDocumentsParams): Promise<any> {
    throw new Error('Method not implemented.')
  }
  async loadDocuments(config: LarkDocumentsParams, context?: { integration: IIntegration }): Promise<Document[]> {
    return []
  }
}
