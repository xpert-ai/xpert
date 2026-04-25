import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Component, Input, NO_ERRORS_SCHEMA, Pipe, PipeTransform, computed, signal } from '@angular/core'
import { provideRouter, RouterModule } from '@angular/router'
import { of } from 'rxjs'
import {
  createProjectId,
  createSprintId,
  IProjectCore,
  IProjectSprint,
  IProjectSwimlane,
  ProjectCoreStatusEnum,
  ProjectSprintStatusEnum,
  ProjectSprintStrategyEnum
} from '@xpert-ai/contracts'
import { ProjectPageFacade } from './project-page.facade'
import { ProjectCreateDialogComponent } from './components/project-create-dialog.component'
import { ProjectSprintCreateDialogComponent } from './components/project-sprint-create-dialog.component'
import { ProjectTaskDialogComponent } from './components/project-task-dialog.component'
import { ProjectShellComponent } from './project-shell.component'

@Pipe({
  standalone: true,
  name: 'translate'
})
class TranslateStubPipe implements PipeTransform {
  transform(value: string, options?: { Default?: string }) {
    return options?.Default ?? value
  }
}

@Component({
  standalone: true,
  selector: 'xp-project-empty-state',
  template: `
    <section>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
      <ng-content />
    </section>
  `
})
class ProjectEmptyStateStubComponent {
  @Input() title = ''
  @Input() description = ''
}

describe('ProjectShellComponent', () => {
  const projectId = createProjectId('project-1')
  const sprintId = createSprintId('sprint-1')
  const project: IProjectCore = {
    id: projectId,
    name: 'Project Alpha',
    goal: 'Ship the workspace',
    mainAssistantId: null,
    status: ProjectCoreStatusEnum.Active
  }
  const sprint: IProjectSprint = {
    id: sprintId,
    projectId,
    goal: 'Build shell',
    status: ProjectSprintStatusEnum.Running,
    strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
  }

  function createComponent() {
    const projects = signal<IProjectCore[]>([project])
    const pageLoading = signal(false)
    const error = signal<string | null>(null)
    const selectedProject = signal<IProjectCore | null>(project)
    const selectedSprint = signal<IProjectSprint | null>(sprint)
    const facade = {
      pageLoading,
      error,
      projects,
      projectId: signal(projectId),
      selectedProject,
      selectedSprint,
      sprints: signal<IProjectSprint[]>([sprint]),
      swimlanes: signal<IProjectSwimlane[]>([]),
      tasks: signal([]),
      boundTeams: signal([]),
      backlogSwimlane: signal<IProjectSwimlane | null>(null),
      hasProjects: computed(() => projects().length > 0),
      selectProject: jest.fn().mockResolvedValue(undefined),
      selectSprint: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      refreshBoard: jest.fn().mockResolvedValue(undefined)
    }
    const dialog = {
      open: jest.fn()
    }

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [ProjectShellComponent],
      providers: [
        provideRouter([]),
        {
          provide: Dialog,
          useValue: dialog
        }
      ]
    })
    TestBed.overrideComponent(ProjectShellComponent, {
      set: {
        imports: [CommonModule, RouterModule, TranslateStubPipe, ProjectEmptyStateStubComponent],
        providers: [
          {
            provide: ProjectPageFacade,
            useValue: facade
          }
        ],
        schemas: [NO_ERRORS_SCHEMA]
      }
    })

    const fixture = TestBed.createComponent(ProjectShellComponent)
    return {
      fixture,
      component: fixture.componentInstance,
      facade,
      dialog
    }
  }

  it('renders project tabs with project child-route links', () => {
    const { fixture } = createComponent()
    fixture.detectChanges()

    const links = Array.from(fixture.nativeElement.querySelectorAll('a')).map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent?.trim()
    }))

    expect(links).toEqual([
      expect.objectContaining({ href: '/project/project-1/overview', text: 'Overview' }),
      expect.objectContaining({ href: '/project/project-1/kanban', text: 'Kanban' }),
      expect.objectContaining({ href: '/project/project-1/teams', text: 'Teams' }),
      expect.objectContaining({ href: '/project/project-1/files', text: 'Files' })
    ])
  })

  it('shows loading and empty project states', () => {
    const { fixture, facade } = createComponent()

    facade.pageLoading.set(true)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('ngm-spin')).not.toBeNull()

    facade.pageLoading.set(false)
    facade.projects.set([])
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('No projects yet')
    expect(fixture.nativeElement.textContent).toContain('New Project')
  })

  it('wires shell actions through dialogs and facade refresh helpers', async () => {
    const { component, dialog, facade } = createComponent()
    const createdProject: IProjectCore = {
      ...project,
      id: createProjectId('project-2'),
      name: 'Project Beta'
    }

    dialog.open.mockReturnValueOnce({ closed: of(createdProject) })
    await component.openCreateProject()

    expect(dialog.open).toHaveBeenCalledWith(ProjectCreateDialogComponent, expect.any(Object))
    expect(facade.selectProject).toHaveBeenCalledWith(createdProject.id)

    dialog.open.mockReturnValueOnce({ closed: of({ id: createSprintId('sprint-2') }) })
    await component.openCreateSprint()

    expect(dialog.open).toHaveBeenCalledWith(ProjectSprintCreateDialogComponent, expect.any(Object))
    expect(facade.refresh).toHaveBeenCalled()
    expect(facade.selectSprint).toHaveBeenCalledWith(createSprintId('sprint-2'))

    dialog.open.mockReturnValueOnce({ closed: of({ id: 'task-1' }) })
    await component.openTaskDialog()

    expect(dialog.open).toHaveBeenCalledWith(ProjectTaskDialogComponent, expect.any(Object))
    expect(facade.refreshBoard).toHaveBeenCalled()
  })
})
