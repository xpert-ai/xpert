import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { of, Subject } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { SkillPackageService, XpertWorkspaceService } from '@cloud/app/@core'
import { ExploreSkillInstallComponent } from './install.component'

const selectedWorkspace = signal<{ id: string } | null>({ id: 'selected-workspace' })

jest.mock('@metad/cloud/state', () => ({
  injectWorkspace: () => selectedWorkspace
}))

describe('ExploreSkillInstallComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    selectedWorkspace.set({ id: 'selected-workspace' })
  })

  it('prefers the default workspace over the selected workspace when it becomes available', async () => {
    const defaultWorkspace$ = new Subject<any>()

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ExploreSkillInstallComponent],
      providers: [
        provideRouter([]),
        {
          provide: DIALOG_DATA,
          useValue: {
            id: 'skill-index-1',
            name: 'Test Skill'
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
          provide: SkillPackageService,
          useValue: {
            installPackage: jest.fn(() => of(null))
          }
        },
        TranslateService
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ExploreSkillInstallComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.workspace()).toBe('selected-workspace')

    defaultWorkspace$.next({ id: 'default-workspace', name: 'Default Workspace' })
    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.workspace()).toBe('default-workspace')
  })
})
