import { Routes } from '@angular/router'
import { ProjectPageComponent } from './project-page.component'

export const routes: Routes = [
  {
    path: '',
    component: ProjectPageComponent,
    data: {
      title: 'Project'
    }
  },
  {
    path: ':projectId',
    component: ProjectPageComponent,
    data: {
      title: 'Project'
    }
  },
  {
    path: '**',
    redirectTo: ''
  }
]
