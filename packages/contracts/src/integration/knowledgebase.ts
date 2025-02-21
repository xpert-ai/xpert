import { IntegrationEnum, TIntegrationProvider } from '../integration.model'
import { ParameterTypeEnum } from '../types'

export const IntegrationKnowledgebaseProvider: TIntegrationProvider = {
  name: IntegrationEnum.KNOWLEDGEBASE,
  label: {
    en_US: 'Knowledgebase',
  },
  avatar: 'knowledgebase.png',
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
          zh_Hans: '请输入',
          en_US: 'Please enter'
        },
      },
      {
        name: 'apiUrl',
        type: ParameterTypeEnum.STRING,
        label: {
          en_US: 'API URL'
        },
        placeholder: {
          zh_Hans: '请输入',
          en_US: 'Please enter'
        },
        help: {
          title: {
            zh_Hans: '了解如何创建外部知识库 API',
            en_US: ''
          },
          url: {
            zh_Hans: '了解如何创建外部知识库 API',
            en_US: ''
          },
        }
      }
    ]
  },
}
