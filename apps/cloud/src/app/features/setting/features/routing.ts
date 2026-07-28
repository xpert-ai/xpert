import { Routes } from '@angular/router'
import { Store } from '@xpert-ai/cloud/state'
import { FeatureToggleComponent } from '../../../@shared/features/feature-toggle'
import { PACFeaturesComponent } from './features.component'
import { OrganizationFeatureToggleStore } from './organization-feature-toggle.store'

export default [
  {
    path: '',
    component: PACFeaturesComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'organization'
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
        providers: [{ provide: Store, useClass: OrganizationFeatureToggleStore }],
        data: {
          isOrganization: true,
          scopeContext: 'organization-only'
        }
      }
    ]
  }
] as Routes
