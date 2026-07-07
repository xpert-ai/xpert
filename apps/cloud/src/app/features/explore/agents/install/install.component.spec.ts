import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { of, Subject } from 'rxjs'
import { TranslateModule } from '@ngx-translate/core'

jest.mock('@cloud/app/@core', () => {
  class XpertAPIService {}
  class XpertTemplateService {}
  class XpertWorkspaceService {}

  return {
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : `${error}`),
    injectToastr: () => ({
      error: jest.fn(),
      success: jest.fn()
    }),
    OrderTypeEnum: {
      DESC: 'DESC'
    },
    XpertAPIService,
    XpertTemplateService,
    XpertWorkspaceService
  }
})

jest.mock('@cloud/app/@shared/xpert', () => {
  const { Component, EventEmitter, signal } = require('@angular/core')

  class XpertBasicFormComponent {
    readonly invalid = signal(false)
    name = ''
    avatar = null
    description = ''
    title = ''
    copilotModel = null
    readonly nameChange = new EventEmitter()
    readonly avatarChange = new EventEmitter()
    readonly descriptionChange = new EventEmitter()
    readonly titleChange = new EventEmitter()
    readonly copilotModelChange = new EventEmitter()
  }

  Component({
    standalone: true,
    selector: 'xpert-basic-form',
    template: '',
    inputs: ['name', 'avatar', 'description', 'title', 'copilotModel'],
    outputs: ['nameChange', 'avatarChange', 'descriptionChange', 'titleChange', 'copilotModelChange']
  })(XpertBasicFormComponent)

  return {
    XpertBasicFormComponent
  }
})

import { XpertAPIService, XpertTemplateService, XpertWorkspaceService } from '@cloud/app/@core'
import { ExploreAgentInstallComponent } from './install.component'

const selectedWorkspace = signal<{ id: string } | null>({ id: 'selected-workspace' })

jest.mock('@xpert-ai/cloud/state', () => ({
  injectWorkspace: () => selectedWorkspace
}))

describe('ExploreAgentInstallComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    selectedWorkspace.set({ id: 'selected-workspace' })
  })

  it('prefers the default workspace over the selected workspace when it becomes available', async () => {
    const defaultWorkspace$ = new Subject<{ id: string; name: string }>()

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ExploreAgentInstallComponent],
      providers: [
        provideRouter([]),
        {
          provide: DIALOG_DATA,
          useValue: {
            id: 'template-1',
            name: 'Agent Template',
            description: 'Template description'
          }
        },
        {
          provide: DialogRef,
          useValue: {
            close: jest.fn()
          }
        },
        {
          provide: XpertWorkspaceService,
          useValue: {
            getAllMy: jest.fn(() =>
              of({
                items: [
                  { id: 'selected-workspace', name: 'Selected Workspace' },
                  { id: 'default-workspace', name: 'Default Workspace' }
                ]
              })
            ),
            getMyDefault: jest.fn(() => defaultWorkspace$.asObservable())
          }
        },
        {
          provide: XpertTemplateService,
          useValue: {
            getTemplate: jest.fn()
          }
        },
        {
          provide: XpertAPIService,
          useValue: {
            importDSL: jest.fn()
          }
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ExploreAgentInstallComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.workspace()).toBe('selected-workspace')

    defaultWorkspace$.next({ id: 'default-workspace', name: 'Default Workspace' })
    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.workspace()).toBe('default-workspace')
  })
})
