jest.mock('./project-shell.component', () => ({
  ProjectShellComponent: class ProjectShellComponent {}
}))

jest.mock('./pages/project-overview-page.component', () => ({
  ProjectOverviewPageComponent: class ProjectOverviewPageComponent {}
}))

jest.mock('./pages/project-kanban-page.component', () => ({
  ProjectKanbanPageComponent: class ProjectKanbanPageComponent {}
}))

jest.mock('./pages/project-teams-page.component', () => ({
  ProjectTeamsPageComponent: class ProjectTeamsPageComponent {}
}))

jest.mock('./pages/project-files-page.component', () => ({
  ProjectFilesPageComponent: class ProjectFilesPageComponent {}
}))

import { ProjectFilesPageComponent } from './pages/project-files-page.component'
import { ProjectKanbanPageComponent } from './pages/project-kanban-page.component'
import { ProjectOverviewPageComponent } from './pages/project-overview-page.component'
import { ProjectTeamsPageComponent } from './pages/project-teams-page.component'
import { ProjectShellComponent } from './project-shell.component'
import { routes } from './routes'

describe('project routes', () => {
  it('uses the project shell for the root project route', () => {
    const rootRoute = routes.find((route) => route.path === '')

    expect(rootRoute?.component).toBe(ProjectShellComponent)
    expect(rootRoute?.children?.[0]?.component).toBe(ProjectOverviewPageComponent)
  })

  it('mounts project shell tabs under /project/:projectId', () => {
    const projectRoute = routes.find((route) => route.path === ':projectId')
    const children = projectRoute?.children ?? []

    expect(projectRoute?.component).toBe(ProjectShellComponent)
    expect(children.find((route) => route.path === '')?.redirectTo).toBe('overview')
    expect(children.find((route) => route.path === 'overview')?.component).toBe(ProjectOverviewPageComponent)
    expect(children.find((route) => route.path === 'kanban')?.component).toBe(ProjectKanbanPageComponent)
    expect(children.find((route) => route.path === 'teams')?.component).toBe(ProjectTeamsPageComponent)
    expect(children.find((route) => route.path === 'files')?.component).toBe(ProjectFilesPageComponent)
  })
})
