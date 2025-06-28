import { linkedModel } from '@metad/ocap-angular/core'
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
