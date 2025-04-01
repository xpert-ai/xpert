import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { DirtyCheckGuard } from '../../../@core'
import { ModelAdminComponent } from './admin/admin.component'
import { ModelMembersComponent } from './members/members.component'
import { ModelComponent } from './model.component'
import { ModelOverviewComponent } from './overview/overview.component'
import { semanticModelResolver } from './story-model.resolver'
import { SemancticModelLogsComponent } from './logs/logs.component'

export const routes: Routes = [
  {
    path: '',
    component: ModelComponent,
    resolve: { storyModel: semanticModelResolver },
    canDeactivate: [DirtyCheckGuard],
    data: {
      reuseComponent: false
    },
    children: [
      {
        path: '',
        component: ModelOverviewComponent,
        data: {
          title: 'Model / Overview'
        }
      },
      {
        path: 'admin',
        component: ModelAdminComponent,
        data: {
          title: 'Model / Admin'
        }
      },
      {
        path: 'entity',
        loadChildren: () => import('./entity/routing').then((m) => m.routes),
        data: {
          title: 'Model / Cube'
        }
      },
      {
        path: 'virtual-cube',
        loadChildren: () => import('./virtual-cube/routing').then((m) => m.routes),
        data: {
          title: 'Model / Virtual Cube'
        }
      },
      {
        path: 'dimension',
        loadChildren: () => import('./dimension/dimension.module').then((m) => m.ModelDimensionModule),
        data: {
          title: 'Model / Dimension'
        }
      },
      {
        path: 'query',
        loadChildren: () => import('./query-lab/query-lab.module').then((m) => m.QueryLabModule),
        data: {
          title: 'Model / Query'
        }
      },
      {
        path: 'access',
        loadChildren: () => import('./access-control/access-control.module').then((m) => m.AccessControlModule),
        data: {
          title: 'Model / Access'
        }
      },
      {
        path: 'member-retriever',
        component: ModelMembersComponent,
        data: {
          title: 'Model / Member Retriever'
        }
      },
      {
        path: 'logs',
        component: SemancticModelLogsComponent,
        data: {
          title: 'Model / Logs'
        }
      }
    ]
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ModelRoutingModule {}
