import { IntegrationEnum, TIntegrationProvider } from '../integration.model'
import { ParameterTypeEnum } from '../types'

export const IntegrationFirecrawlProvider: TIntegrationProvider = {
  name: IntegrationEnum.FIRECRAWL,
  label: {
    en_US: 'Firecrawl',
  },
  avatar: 'firecrawl.png',
  schema: {
    type: 'object',
    required: ['apiKey'],
    parameters: [
      {
        name: 'apiKey',
        type: ParameterTypeEnum.SECRET_INPUT,
        label: {
          en_US: 'API Key'
        },
        placeholder: {
          zh_Hans: '从 firecrawl.dev 获取 API Key',
          en_US: 'Get an API Key from firecrawl.dev'
        },
        help: {
          title: {
            en_US: 'Get an API Key',
            zh_Hans: '获取一个 API Key',
          },
          url: {
            en_US: 'https://firecrawl.dev'
          }
        }
      },
      {
        name: 'apiUrl',
        type: ParameterTypeEnum.STRING,
        label: {
          en_US: 'Base URL'
        },
        placeholder: {
          en_US: 'https://api.firecrawl.dev'
        },
      }
    ]
  },
}
