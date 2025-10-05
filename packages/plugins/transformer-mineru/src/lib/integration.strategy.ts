import { IIntegration, TIntegrationProvider } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, ISchemaSecretField, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { icon, MinerU, MinerUIntegrationOptions } from './types'

@Injectable()
@IntegrationStrategyKey(MinerU)
export class MinerUIntegrationStrategy implements IntegrationStrategy<MinerUIntegrationOptions> {
  readonly meta: TIntegrationProvider = {
    name: MinerU,
    label: {
      en_US: 'MinerU',
    },
    description: {
      en_US:
        '',
      zh_Hans:
        ''
    },
    icon: {
      svg: icon,
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
            en_US: 'https://api.mineru.dev',
          },
        },
        apiKey: {
          type: 'string',
          title: {
            en_US: 'API Key'
          },
          description: {
            en_US: 'The API Key of the MinerU server'
          },
          'x-ui': <ISchemaSecretField>{
            component: 'secretInput',
            label: 'API Key',
            placeholder: '请输入您的 MinerU API Key',
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

  execute(integration: IIntegration<MinerUIntegrationOptions>, payload: TIntegrationStrategyParams): Promise<any> {
    throw new Error('Method not implemented.')
  }
}
