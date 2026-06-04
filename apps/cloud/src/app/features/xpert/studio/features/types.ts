import type { TXpertSandboxFeature } from '@xpert-ai/contracts'
import { linkedModel } from '@xpert-ai/ocap-angular/core'
import type { TSandboxProvider } from '@cloud/app/@core'
import { XpertStudioApiService } from '../domain'

export function linkedXpertFeaturesModel(apiService: XpertStudioApiService) {
  return linkedModel({
    initialValue: null,
    compute: () => apiService.xpert()?.features,
    update: (features) => {
      apiService.updateXpertTeam((xpert) => {
        return {
          ...xpert,
          features: {
            ...(xpert.features ?? {}),
            ...features
          }
        }
      })
    }
  })
}

export function resolveSandboxFeatureForToggle(
  enabled: boolean,
  current: TXpertSandboxFeature | null | undefined,
  providers: Array<Pick<TSandboxProvider, 'type'>>
): TXpertSandboxFeature {
  const provider = current?.provider
  const fallbackProvider = providers[0]?.type
  const shouldUseFallback =
    enabled && !!fallbackProvider && (!provider || !providers.some((item) => item.type === provider))

  return {
    ...(current ?? {}),
    enabled,
    ...(shouldUseFallback ? { provider: fallbackProvider } : {})
  }
}
