import { IntegrationEnum, IntegrationFeatureEnum, TIntegrationProvider } from '../integration.model'

export const IntegrationDifyProvider: TIntegrationProvider = {
  name: IntegrationEnum.Dify,
  label: {
    en_US: 'Dify',
    zh_Hans: 'Dify'
  },
  description: {
    en_US:
      'Dify’s Knowledge feature visualizes each stage of the RAG pipeline, developers can upload internal company documents, FAQs, and standard working guides, then process them into structured data that large language models (LLMs) can query.',
    zh_Hans:
      'Dify 的知识功能将 RAG 管道的每个阶段可视化，开发人员可以上传公司内部文档、常见问题解答和标准工作指南，然后将它们处理成大型语言模型 (LLM) 可以查询的结构化数据。'
  },
  avatar: 'dify.svg',
  schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The url of Dify server',
      },
      apiKey: {
        type: 'string',
        description: 'The API Key of the Dify server'
      }
    }
  },
  features: [IntegrationFeatureEnum.KNOWLEDGE],
  helpUrl: 'https://docs.dify.ai/en/guides/knowledge-base/readme'
}
