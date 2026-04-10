import { signal } from '@angular/core'
import { Component, model } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { of, Subject } from 'rxjs'
import { TranslateModule } from '@ngx-translate/core'
import { XpertAPIService, XpertTemplateService, XpertWorkspaceService } from '@cloud/app/@core'
import { ExploreAgentInstallComponent } from './install.component'
import { XpertBasicFormComponent } from '@cloud/app/@shared/xpert'

const selectedWorkspace = signal<{ id: string } | null>({ id: 'selected-workspace' })

jest.mock('@metad/cloud/state', () => ({
  injectWorkspace: () => selectedWorkspace
}))

@Component({
  standalone: true,
  selector: 'xpert-basic-form',
  template: ''
})
class MockXpertBasicFormComponent {
  readonly invalid = signal(false)
  readonly name = model<string>('')
  readonly avatar = model<any>(null)
  readonly description = model<string>('')
  readonly title = model<string>('')
  readonly copilotModel = model<any>(null)
}

describe('ExploreAgentInstallComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    selectedWorkspace.set({ id: 'selected-workspace' })
  })

  it('prefers the default workspace over the selected workspace when it becomes available', async () => {
    const defaultWorkspace$ = new Subject<any>()

    TestBed.overrideComponent(ExploreAgentInstallComponent, {
      remove: {
        imports: [XpertBasicFormComponent]
      },
      add: {
        imports: [MockXpertBasicFormComponent]
      }
    })

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
