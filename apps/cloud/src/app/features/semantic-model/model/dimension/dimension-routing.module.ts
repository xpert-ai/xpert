import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { ModelDimensionComponent } from './dimension.component'
import { ModelHierarchyComponent } from './hierarchy/hierarchy.component'
import { NotFoundComponent } from 'apps/cloud/src/app/@shared/not-found'


const routes: Routes = [
  {
    path: '404',
    component: NotFoundComponent
  },
  {
    path: ':id',
    component: ModelDimensionComponent,
    children: [
      {
        path: 'hierarchy',
        redirectTo: '',
        pathMatch: 'full'
      },
      {
        path: 'hierarchy/:id',
        component: ModelHierarchyComponent,
        data: {
          title: 'Model / Dimension / Hierarchy',
          reuseComponent: false
        }
      },
      {
        path: '404',
        component: NotFoundComponent
      }
    ]
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ModelDimensionRoutingModule {}
