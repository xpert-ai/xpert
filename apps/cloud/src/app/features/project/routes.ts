import { Routes } from '@angular/router'
import { ProjectFilesPageComponent } from './pages/project-files-page.component'
import { ProjectKanbanPageComponent } from './pages/project-kanban-page.component'
import { ProjectOverviewPageComponent } from './pages/project-overview-page.component'
import { ProjectTeamsPageComponent } from './pages/project-teams-page.component'
import { ProjectShellComponent } from './project-shell.component'

export const routes: Routes = [
  {
    path: '',
    component: ProjectShellComponent,
    data: {
      title: 'Project'
    },
    children: [
      {
        path: '',
        component: ProjectOverviewPageComponent
      }
    ]
  },
  {
    path: ':projectId',
    component: ProjectShellComponent,
    data: {
      title: 'Project'
    },
    children: [
      {
        path: '',
        redirectTo: 'overview',
        pathMatch: 'full'
      },
      {
        path: 'overview',
        component: ProjectOverviewPageComponent,
        data: {
          title: 'Project Overview'
        }
      },
      {
        path: 'kanban',
        component: ProjectKanbanPageComponent,
        data: {
          title: 'Project Kanban'
        }
      },
      {
        path: 'teams',
        component: ProjectTeamsPageComponent,
        data: {
          title: 'Project Teams'
        }
      },
      {
        path: 'files',
        component: ProjectFilesPageComponent,
        data: {
          title: 'Project Files'
        }
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
]
