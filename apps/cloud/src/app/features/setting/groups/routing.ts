import { Routes } from '@angular/router'
import { UserGroupsSettingsComponent } from './groups.component'

export default [
  {
    path: '',
    component: UserGroupsSettingsComponent,
    data: {
      title: 'Settings / Groups',
      scopeContext: 'organization-only'
    }
  },
  {
    path: ':id',
    component: UserGroupsSettingsComponent,
    data: {
      title: 'Settings / Groups',
      scopeContext: 'organization-only'
    }
  }
] as Routes
