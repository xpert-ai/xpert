import { Routes } from '@angular/router'
import { AiFeatureEnum } from '../../@core'
import { featureGate } from '../feature-gate'
import { ChatBiComponent } from './chatbi.component'

export const routes: Routes = [
  {
    path: '',
    component: ChatBiComponent,
    canActivate: [featureGate([AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CHATBI])],
    data: {
      title: 'Chat BI'
    }
  }
]
