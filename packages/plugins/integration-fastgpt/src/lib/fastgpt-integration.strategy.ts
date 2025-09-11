import { IIntegration, IntegrationFeatureEnum, TIntegrationProvider } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { FastGPT } from './types'

@Injectable()
@IntegrationStrategyKey(FastGPT)
export class FastGPTIntegrationStrategy implements IntegrationStrategy {
  meta: TIntegrationProvider = {
    name: FastGPT,
    label: {
      en_US: 'FastGPT',
      zh_Hans: 'FastGPT'
    },
    description: {
      en_US: 'FastGPT is a knowledge base Q&A system based on LLM large language models.',
      zh_Hans: 'FastGPT 是一个基于 LLM 大语言模型的知识库问答系统。'
    },
    avatar: 'fastgpt.svg',
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The url of FastGPT server'
        },
        apiKey: {
          type: 'string',
          description: 'The API Key of the FastGPT server'
        }
      }
    },
    features: [IntegrationFeatureEnum.KNOWLEDGE],
    helpUrl: 'https://doc.fastgpt.io/docs/introduction/development/openapi/dataset'
  }

  execute(integration: IIntegration, payload: TIntegrationStrategyParams): Promise<any> {
    throw new Error('Method not implemented.')
  }
}
