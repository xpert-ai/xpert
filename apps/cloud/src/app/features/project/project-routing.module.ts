import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { DirtyCheckGuard, storyResolver } from '../../@core/index'
import { StoryViewerComponent } from '../story/viewer/viewer.component'
import { ProjectHomeComponent } from './home/home.component'
import { ApprovalsComponent } from './indicators/approvals/approvals.component'
import { ProjectIndicatorsComponent } from './indicators/indicators.component'
import { AllIndicatorComponent } from './indicators/all/all.component'
import { IndicatorRegisterComponent } from './indicators/register/register.component'
import { ProjectMembersComponent } from './members/members.component'
import { ProjectComponent } from './project/project.component'
import { ProjectFilesComponent } from './files/files.component'
import { NotFoundComponent } from '../../@shared/not-found'

const routes: Routes = [
  {
    path: '',
    component: ProjectComponent,
    data: {
      title: 'Project',
    },
    children: [
      {
        path: '',
        component: ProjectHomeComponent
      },
      {
        path: 'members',
        component: ProjectMembersComponent,
        data: {
          title: 'project/members',
        },
      },
      {
        path: 'files',
        component: ProjectFilesComponent,
      },
      {
        path: 'indicators',
        component: ProjectIndicatorsComponent,
        data: {
          title: 'project/indicators',
        },
        children: [
          {
            path: '',
            component: AllIndicatorComponent
          },
          {
            path: 'approvals',
            component: ApprovalsComponent
          },
          {
            path: '404',
            component: NotFoundComponent
          },
          {
            path: ':id',
            component: IndicatorRegisterComponent,
            // canDeactivate: [DirtyCheckGuard],
          },
        ]
      },
      {
        path: 'indicator/:id',
        component: IndicatorRegisterComponent,
        canDeactivate: [DirtyCheckGuard],
      },
      {
        path: 'indicator',
        component: IndicatorRegisterComponent,
        canDeactivate: [DirtyCheckGuard],
      },
      {
        path: ':id',
        loadComponent() {
          return StoryViewerComponent
        },
        data: { title: 'pac.menu.story' },
        resolve: { story: storyResolver }
      },
    ]
  },
]

@NgModule({
  declarations: [],
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProjectRoutingModule {}
