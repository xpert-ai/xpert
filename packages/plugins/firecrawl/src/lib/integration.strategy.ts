import { IIntegration, TIntegrationProvider } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, ISchemaSecretField, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { Firecrawl, icon } from './types'

@Injectable()
@IntegrationStrategyKey(Firecrawl)
export class FirecrawlIntegrationStrategy implements IntegrationStrategy {
  readonly meta: TIntegrationProvider = {
    name: Firecrawl,
    label: {
      en_US: 'Firecrawl',
    },
    description: {
      en_US:
        'Firecrawl is an API service that takes a URL, crawls it, and converts it into clean markdown or structured data. We crawl all accessible subpages and give you clean data for each.',
      zh_Hans:
        'Firecrawl 是一个 API 服务，它接受一个 URL，爬取它，并将其转换为干净的 markdown 或结构化数据。我们爬取所有可访问的子页面，并为每个页面提供干净的数据。'
    },
    icon: {
      svg: icon,
      color: '#4CAF50'
    },
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          title: {
            en_US: 'Base URL'
          },
          description: {
            en_US: 'https://api.firecrawl.dev',
          },
        },
        apiKey: {
          type: 'string',
          title: {
            en_US: 'API Key'
          },
          description: {
            en_US: 'The API Key of the Firecrawl server'
          },
          'x-ui': <ISchemaSecretField>{
            component: 'secretInput',
            label: 'API Key',
            placeholder: '请输入您的 OpenAI API Key',
            revealable: true,
            maskSymbol: '*',
            persist: true
          }
        }
      }
    },
    features: [],
    helpUrl: ''
  }

  execute(integration: IIntegration, payload: TIntegrationStrategyParams): Promise<any> {
    throw new Error('Method not implemented.')
  }
}
