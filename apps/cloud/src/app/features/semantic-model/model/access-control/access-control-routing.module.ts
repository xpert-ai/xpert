import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { AccessControlComponent } from './access-control.component'
import { AccessOverviewComponent } from './overview/overview.component'
import { CubeComponent } from './role/cube/cube.component'
import { RoleOverviewComponent } from './role/overview/overview.component'
import { RoleComponent } from './role/role.component'

const routes: Routes = [
  {
    path: '',
    component: AccessControlComponent,
    children: [
      {
        path: '',
        redirectTo: 'overview',
        pathMatch: 'full'
      },
      {
        path: 'overview',
        component: AccessOverviewComponent
      },
      {
        path: ':id',
        component: RoleComponent,
        children: [
          {
            path: '',
            redirectTo: 'overview',
            pathMatch: 'full'
          },
          {
            path: 'overview',
            component: RoleOverviewComponent
          },
          {
            path: 'cube/:name',
            component: CubeComponent
          }
        ]
      }
    ]
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AccessControlRoutingModule {}
