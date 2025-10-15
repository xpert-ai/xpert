import { DocumentSourceProviderCategoryEnum, I18nObject, IDocumentSourceProvider, IIntegration } from '@metad/contracts'
import { Inject, Injectable } from '@nestjs/common'
import { DocumentSourceStrategy, IDocumentSourceStrategy, IntegrationPermission } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { FirecrawlService } from './firecrawl.service'
import { Firecrawl, FirecrawlParams, icon } from './types'

@DocumentSourceStrategy(Firecrawl)
@Injectable()
export class FirecrawlSourceStrategy implements IDocumentSourceStrategy<FirecrawlParams> {
  @Inject(FirecrawlService)
  private readonly firecrawlService: FirecrawlService

  readonly permissions = [
    {
      type: 'integration',
      service: Firecrawl,
      description: 'Access to Firecrawl system integrations'
    } as IntegrationPermission
  ]

  readonly meta: IDocumentSourceProvider = {
    name: Firecrawl,
    category: DocumentSourceProviderCategoryEnum.WebCrawl,
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
            en_US: 'The URL to crawl.',
            zh_Hans: '要抓取的 URL。'
          } as I18nObject,
          default: 'https://docs.firecrawl.dev/introduction'
        }
      },
      required: []
    },
    icon: {
      type: 'svg',
      value: icon,
      color: '#4CAF50'
    }
  }

  validateConfig(config: FirecrawlParams): Promise<void> {
    throw new Error('Method not implemented.')
  }
  test(config: FirecrawlParams): Promise<any> {
    throw new Error('Method not implemented.')
  }
  async loadDocuments(config: FirecrawlParams, context?: { integration: IIntegration }): Promise<Document[]> {
    const result = await this.firecrawlService.crawlUrl(context.integration, config)
    return result.webInfoList.map(
      (item) =>
        new Document({
          pageContent: item.content,
          metadata: {
            source: item.sourceUrl,
            title: item.title,
            description: item.description
          }
        })
    )
  }
}
