import { IIntegration, TIntegrationProvider } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, ISchemaSecretField, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { icon, Unstructured, UnstructuredIntegrationOptions, } from './types'

@Injectable()
@IntegrationStrategyKey(Unstructured)
export class UnstructuredIntegrationStrategy implements IntegrationStrategy<UnstructuredIntegrationOptions> {
  readonly meta: TIntegrationProvider = {
    name: Unstructured,
    label: {
      en_US: 'Unstructured',
    },
    description: {
      en_US:
        '',
      zh_Hans:
        ''
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
            en_US: 'https://api.unstructured.dev',
          },
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
    helpUrl: ''
  }

  execute(integration: IIntegration<UnstructuredIntegrationOptions>, payload: TIntegrationStrategyParams): Promise<any> {
    throw new Error('Method not implemented.')
  }
}
