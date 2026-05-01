import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, Input, Type } from '@angular/core'
import { By } from '@angular/platform-browser'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { ProjectTaskExecutionArtifactTypeEnum } from '@xpert-ai/contracts'
import { of } from 'rxjs'
import { ProjectCoreService } from '../../../@core/services/project-core.service'

type MockFileWorkbenchInputs = {
  rootId?: string | null
  rootLabel?: string | null
  filesLoader?: (path?: string) => unknown
  fileLoader?: (path: string) => unknown
  initialPath?: string | null
  initialPathIsDirectory?: boolean
  treeSize?: string
}

let MockFileWorkbenchComponent: Type<MockFileWorkbenchInputs>

jest.mock('../../../@shared/files', () => {
  @Component({
    standalone: true,
    selector: 'pac-file-workbench',
    template: ''
  })
  class MockFileWorkbenchComponentImpl implements MockFileWorkbenchInputs {
    @Input() rootId?: string | null
    @Input() rootLabel?: string | null
    @Input() filesLoader?: (path?: string) => unknown
    @Input() fileLoader?: (path: string) => unknown
    @Input() initialPath?: string | null
    @Input() initialPathIsDirectory?: boolean
    @Input() treeSize?: string
  }

  MockFileWorkbenchComponent = MockFileWorkbenchComponentImpl
  return {
    FileWorkbenchComponent: MockFileWorkbenchComponentImpl
  }
})

import { ProjectTaskArtifactDialogComponent } from './project-task-artifact-dialog.component'

describe('ProjectTaskArtifactDialogComponent', () => {
  async function setup(
    artifactType:
      | ProjectTaskExecutionArtifactTypeEnum.ProjectFile
      | ProjectTaskExecutionArtifactTypeEnum.ProjectDirectory
  ) {
    const projectCoreService = {
      getFiles: jest.fn(() => of([])),
      getFile: jest.fn(() => of({ filePath: 'deliverables/task-1/notes.md', contents: '# Notes' }))
    }
    const dialogRef = {
      close: jest.fn()
    }
    const artifactPath =
      artifactType === ProjectTaskExecutionArtifactTypeEnum.ProjectDirectory
        ? 'deliverables/task-1'
        : 'deliverables/task-1/notes.md'
    const artifact = {
      type: artifactType,
      name: 'Implementation notes',
      path: artifactPath
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ProjectTaskArtifactDialogComponent],
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: {
            projectId: 'project-1',
            artifact,
            taskTitle: 'Implement feature'
          }
        },
        {
          provide: DialogRef,
          useValue: dialogRef
        },
        {
          provide: ProjectCoreService,
          useValue: projectCoreService
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ProjectTaskArtifactDialogComponent)
    fixture.detectChanges()

    const workbench = fixture.debugElement.query(By.directive(MockFileWorkbenchComponent))
      .componentInstance as MockFileWorkbenchInputs

    return {
      fixture,
      workbench,
      projectCoreService,
      dialogRef
    }
  }

  it('binds project-core loaders and the selected file path to the workbench', async () => {
    const { workbench, projectCoreService } = await setup(ProjectTaskExecutionArtifactTypeEnum.ProjectFile)

    expect(workbench.rootId).toBe('project-1')
    expect(workbench.rootLabel).toBe('Implementation notes')
    expect(workbench.initialPath).toBe('deliverables/task-1/notes.md')
    expect(workbench.initialPathIsDirectory).toBe(false)

    workbench.filesLoader?.('deliverables/task-1')
    workbench.fileLoader?.('deliverables/task-1/notes.md')

    expect(projectCoreService.getFiles).toHaveBeenCalledWith('project-1', 'deliverables/task-1')
    expect(projectCoreService.getFile).toHaveBeenCalledWith('project-1', 'deliverables/task-1/notes.md')
  })

  it('passes directory artifacts as initial directories', async () => {
    const { workbench } = await setup(ProjectTaskExecutionArtifactTypeEnum.ProjectDirectory)

    expect(workbench.initialPath).toBe('deliverables/task-1')
    expect(workbench.initialPathIsDirectory).toBe(true)
  })
})
