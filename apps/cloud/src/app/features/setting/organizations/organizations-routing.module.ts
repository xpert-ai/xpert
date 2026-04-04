import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { PermissionsEnum } from '../../../@core'
import { OrganizationsComponent } from './organizations.component'

export function redirectTo() {
  return '/dashboard'
}

const routeData = {
  permissions: {
    only: [
      PermissionsEnum.ALL_ORG_VIEW,
      PermissionsEnum.ALL_ORG_EDIT,
      PermissionsEnum.ORG_USERS_VIEW,
      PermissionsEnum.ORG_USERS_EDIT
    ],
    redirectTo
  },
  selectors: {
    project: false,
    employee: false,
    organization: false,
    date: false
  }
}

const routes: Routes = [
  {
    path: '',
    component: OrganizationsComponent,
    canActivate: [NgxPermissionsGuard],
    data: routeData
  },
  {
    path: ':id',
    component: OrganizationsComponent,
    canActivate: [NgxPermissionsGuard],
    data: routeData
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class OrganizationsRoutingModule {}
