import { InjectionToken, Provider } from '@angular/core'
import { isEnterpriseH5Platform, TEnterpriseH5IdentityGrant, TEnterpriseH5Platform } from '@xpert-ai/contracts'
import { DingTalkH5Service } from './dingtalk-h5.service'

export type EnterpriseH5ClientAdapter = {
  readonly platform: TEnterpriseH5Platform
  requestIdentityGrant(clientConfig: Record<string, unknown>): Promise<TEnterpriseH5IdentityGrant>
}

export const ENTERPRISE_H5_CLIENT_ADAPTERS = new InjectionToken<readonly EnterpriseH5ClientAdapter[]>(
  'ENTERPRISE_H5_CLIENT_ADAPTERS'
)

export function provideEnterpriseH5ClientAdapters(): Provider[] {
  return [
    {
      provide: ENTERPRISE_H5_CLIENT_ADAPTERS,
      useFactory: (dingtalk: DingTalkH5Service): readonly EnterpriseH5ClientAdapter[] => [
        {
          platform: 'dingtalk',
          async requestIdentityGrant(clientConfig) {
            const clientId = readRequiredString(clientConfig, 'clientId')
            const corpId = readRequiredString(clientConfig, 'corpId')
            return {
              type: 'authorization_code',
              code: await dingtalk.requestAuthorizationCode(clientId, corpId)
            }
          }
        }
      ],
      deps: [DingTalkH5Service]
    }
  ]
}

export function resolveEnterpriseH5Platform(value: unknown): TEnterpriseH5Platform | null {
  return isEnterpriseH5Platform(value) ? value : null
}

function readRequiredString(value: Record<string, unknown>, property: string) {
  const candidate = value[property]
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error(`Enterprise H5 client config '${property}' is required.`)
  }
  return candidate.trim()
}
