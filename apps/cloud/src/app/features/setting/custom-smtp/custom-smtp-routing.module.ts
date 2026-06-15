import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { FeatureEnum } from '../../../@core'
import { SMTPComponent } from '../../../@shared/smtp/smtp.component'
import { featureGate } from '../../feature-gate'
import { CustomSmtpComponent } from './custom-smtp.component'

const routes: Routes = [
  {
    path: '',
    component: CustomSmtpComponent,
    canActivate: [NgxPermissionsGuard, featureGate([FeatureEnum.FEATURE_SMTP], ['/settings'])],
    data: {
      permissions: {
        only: [PermissionsEnum.CUSTOM_SMTP_VIEW],
        redirectTo: '/pages/settings'
      }
    },
    children: [
      {
        path: 'tenant',
        component: SMTPComponent,
        data: {
          scopeContext: 'tenant-only',
          isOrganization: false,
          selectors: {
            project: false,
            employee: false,
            date: false,
            organization: false
          }
        }
      },
      {
        path: 'organization',
        component: SMTPComponent,
        data: {
          scopeContext: 'organization-only',
          isOrganization: true,
          selectors: {
            project: false,
            employee: false,
            date: false,
            organization: true
          }
        }
      }
    ]
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CustomSmtpRoutingModule {}
