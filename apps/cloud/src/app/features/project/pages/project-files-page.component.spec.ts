import { Component, Input, Type } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ProjectCoreService } from '../../../@core/services/project-core.service'
import { ProjectPageFacade } from '../project-page.facade'

let MockFileWorkbenchComponent: Type<unknown>

jest.mock('../../../@shared/files', () => {
  @Component({
    standalone: true,
    selector: 'pac-file-workbench',
    template: ''
  })
  class MockFileWorkbenchComponentImpl {
    @Input() rootId?: string | null
    @Input() rootLabel?: string | null
    @Input() filesLoader?: unknown
    @Input() fileLoader?: unknown
    @Input() fileSaver?: unknown
    @Input() fileUploader?: unknown
    @Input() fileDeleter?: unknown
    @Input() treeSize?: string
  }

  MockFileWorkbenchComponent = MockFileWorkbenchComponentImpl
  return {
    FileWorkbenchComponent: MockFileWorkbenchComponentImpl
  }
})

import { ProjectFilesPageComponent } from './project-files-page.component'

describe('ProjectFilesPageComponent', () => {
  it('binds project-core file workbench loaders to the active project id', async () => {
    const facade = {
      projectId: jest.fn(() => 'project-1'),
      selectedProject: jest.fn(() => ({
        id: 'project-1',
        name: 'Project'
      }))
    }
    const projectCoreService = {
      getFiles: jest.fn(() => of([])),
      getFile: jest.fn(() => of({ filePath: 'docs/readme.md', contents: '# Readme' })),
      saveFile: jest.fn(() => of({ filePath: 'docs/readme.md', contents: '# Updated' })),
      uploadFile: jest.fn(() => of({ filePath: 'docs/upload.txt', contents: 'uploaded' })),
      deleteFile: jest.fn(() => of(undefined))
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ProjectFilesPageComponent],
      providers: [
        {
          provide: ProjectPageFacade,
          useValue: facade
        },
        {
          provide: ProjectCoreService,
          useValue: projectCoreService
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ProjectFilesPageComponent)
    fixture.detectChanges()

    const component = fixture.componentInstance
    const file = new File(['uploaded'], 'upload.txt', { type: 'text/plain' })

    component.loadProjectFiles('docs')
    component.loadProjectFile('docs/readme.md')
    component.saveProjectFile('docs/readme.md', '# Updated')
    component.uploadProjectFile(file, 'docs')
    component.deleteProjectFile('docs/readme.md')

    expect(projectCoreService.getFiles).toHaveBeenCalledWith('project-1', 'docs')
    expect(projectCoreService.getFile).toHaveBeenCalledWith('project-1', 'docs/readme.md')
    expect(projectCoreService.saveFile).toHaveBeenCalledWith('project-1', 'docs/readme.md', '# Updated')
    expect(projectCoreService.uploadFile).toHaveBeenCalledWith('project-1', file, 'docs')
    expect(projectCoreService.deleteFile).toHaveBeenCalledWith('project-1', 'docs/readme.md')
    expect(MockFileWorkbenchComponent).toBeDefined()
  })
})
