import { IIntegration, TIntegrationProvider } from '@metad/contracts'
import { Inject, Injectable } from '@nestjs/common'
import {
  IntegrationStrategy,
  IntegrationStrategyKey,
  ISchemaSecretField,
  TIntegrationStrategyParams
} from '@xpert-ai/plugin-sdk'
import { icon, Unstructured, TUnstructuredIntegrationOptions } from './types'
import { UnstructuredService } from './unstructured.service'

@Injectable()
@IntegrationStrategyKey(Unstructured)
export class UnstructuredIntegrationStrategy implements IntegrationStrategy<TUnstructuredIntegrationOptions> {
  readonly meta: TIntegrationProvider = {
    name: Unstructured,
    label: {
      en_US: 'Unstructured'
    },
    description: {
      en_US: 'Designed specifically for converting multi-format documents into "LLM-friendly" structured paragraphs/elements, it is modular and oriented towards modern LLM pipelines.',
      zh_Hans: '专为将多格式文档转为“对 LLM 友好”结构化段落/元素而设计，模块化、面向现代 LLM 流水线。'
    },
    icon: {
      type: 'svg',
      value: icon,
      color: '#4CAF50'
    },
    schema: {
      type: 'object',
      properties: {
        apiUrl: {
          type: 'string',
          title: {
            en_US: 'Base URL'
          },
          description: {
            en_US: 'https://api.unstructuredapp.io/'
          }
        },
        apiKey: {
          type: 'string',
          title: {
            en_US: 'API Key'
          },
          description: {
            en_US: 'The API Key of the Unstructured server'
          },
          'x-ui': <ISchemaSecretField>{
            component: 'secretInput',
            label: 'API Key',
            placeholder: '请输入您的 Unstructured API Key',
            revealable: true,
            maskSymbol: '*',
            persist: true
          }
        }
      }
    },
    features: [],
    helpUrl: 'https://docs.unstructured.io/welcome'
  }

  @Inject(UnstructuredService)
  private readonly service: UnstructuredService

  execute(
    integration: IIntegration<TUnstructuredIntegrationOptions>,
    payload: TIntegrationStrategyParams
  ): Promise<any> {
    throw new Error('Method not implemented.')
  }

  async validateConfig(options: TUnstructuredIntegrationOptions): Promise<void> {
    await this.service.test({options} as IIntegration<TUnstructuredIntegrationOptions>)
  }
}
