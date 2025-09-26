import { I18nObject, IIntegration } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { DocumentSourceStrategy, IDocumentSourceStrategy, IntegrationPermission } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { Firecrawl, icon } from './types'

interface FirecrawlConfig {
  url: string; // Crawl URL
}

@DocumentSourceStrategy(Firecrawl)
@Injectable()
export class FirecrawlSourceStrategy implements IDocumentSourceStrategy<FirecrawlConfig> {

  readonly permissions = [
    {
      type: 'integration',
      service: 'firecrawl',
      description: 'Access to Firecrawl system integrations',
    } as IntegrationPermission
  ]
  
  readonly meta = {
    name: Firecrawl,
    label: {
      en_US: 'Firecrawl',
      zh_Hans: 'Firecrawl'
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
            en_US: 'The URL of the Firecrawl instance.',
            zh_Hans: 'Firecrawl 实例的 URL。'
          } as I18nObject,
          default: 'https://docs.firecrawl.dev/introduction',
        }
      },
      required: []
    },
    icon: {
      svg: icon,
      color: '#4CAF50'
    }
  }

  validateConfig(config: FirecrawlConfig): Promise<void> {
    throw new Error('Method not implemented.')
  }
  test(config: FirecrawlConfig): Promise<any> {
    throw new Error('Method not implemented.')
  }
  async loadDocuments(config: FirecrawlConfig, context?: {integration: IIntegration}): Promise<Document[]> {
    console.log(config, context)

    return []
  }
}