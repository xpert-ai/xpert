import { Routes } from '@angular/router'
import { FeatureToggleComponent } from '../../../@shared/feature-toggle'
import { PACFeaturesComponent } from './features.component'

export default [
  {
    path: '',
    component: PACFeaturesComponent,
    children: [
      {
        path: '',
        redirectTo: 'tenant',
        pathMatch: 'full'
      },
      {
        path: 'tenant',
        component: FeatureToggleComponent,
        data: {
          isOrganization: false
        }
      },
      {
        path: 'organization',
        component: FeatureToggleComponent,
        data: {
          isOrganization: true
        }
      }
    ]
  }
] as Routes
