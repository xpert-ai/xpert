import { Injectable } from '@angular/core'
import { Store } from '@xpert-ai/cloud/state'
import { AiFeatureEnum } from '@xpert-ai/contracts'
import { map } from 'rxjs'

@Injectable()
export class OrganizationFeatureToggleStore extends Store {
  constructor() {
    super()
    this.featureTenant$ = this.featureTenant$.pipe(
      map((items) => items.filter((item) => item.feature.code !== AiFeatureEnum.FEATURE_MODEL_ACCESS_REQUEST))
    )
  }
}
