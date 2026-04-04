import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { PACEditUserComponent } from './edit-user/edit-user.component'
import { ManageUserInviteComponent } from './manage-user-invite/manage-user-invite.component'
import { PACUserOrganizationsComponent } from './organizations/organizations.component'
import { UserBasicComponent } from './user-basic/user-basic.component'
import { PACUsersComponent } from './users.component'
import { ManageUserComponent } from './manage-user/manage-user.component'

const routes: Routes = [
  {
    path: 'edit/:id',
    component: PACEditUserComponent,
    data: {
      title: 'Settings/User/Edit',
      scopeContext: 'tenant-only'
    },
    children: [
      {
        path: '',
        component: UserBasicComponent,
        data: {
          allowRoleChange: true,
          scopeContext: 'tenant-only'
        }
      },
      {
        path: 'organizations',
        component: PACUserOrganizationsComponent,
        data: {
          scopeContext: 'tenant-only'
        }
      }
    ]
  },
  {
    path: '',
    component: PACUsersComponent,
    data: {
      title: 'Settings/User',
      scopeContext: 'dual-scope'
    },
    children: [
      {
        path: '',
        component: ManageUserComponent,
        data: {
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'invites',
        component: ManageUserInviteComponent,
        data: {
          title: 'Settings/User/Invites',
          scopeContext: 'organization-only'
        }
      },
      {
        path: ':id',
        component: PACEditUserComponent,
        data: {
          title: 'Settings/User/Edit',
          scopeContext: 'tenant-only'
        },
      }
    ]
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserRoutingModule {}
