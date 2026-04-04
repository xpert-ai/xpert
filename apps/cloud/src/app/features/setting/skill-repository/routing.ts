import { Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { RolesEnum } from '../../../@core'
import { SkillRepositoryComponent } from './skill-repository.component'

export const routes: Routes = [
  {
    path: '',
    component: SkillRepositoryComponent,
    canActivate: [NgxPermissionsGuard],
    data: {
      title: 'Settings / Skill Repository',
      permissions: {
        only: [RolesEnum.SUPER_ADMIN],
        redirectTo: '/settings'
      }
    }
  }
]

export default routes
