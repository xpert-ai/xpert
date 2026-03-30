import { Routes } from '@angular/router'
import { FeatureToggleComponent } from '../../../@shared/features/feature-toggle'
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
          isOrganization: false,
          scopeContext: 'tenant-only'
        }
      },
      {
        path: 'organization',
        component: FeatureToggleComponent,
        data: {
          isOrganization: true,
          scopeContext: 'organization-only'
        }
      }
    ]
  }
] as Routes
