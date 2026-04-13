import { Dialog } from '@angular/cdk/dialog'
import { Component, EventEmitter, Input, Output, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { of } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { AppService } from 'apps/cloud/src/app/app.service'
import { Store } from '@xpert-ai/cloud/state'
import { TagFilterComponent } from 'apps/cloud/src/app/@shared/tag'
import { XpertWorkspaceWelcomeComponent } from '../welcome/welcome.component'
import {
  TagService,
  ToastrService,
  XpertAPIService,
  XpertToolsetService,
  XpertWorkspaceService
} from '../../../../@core'
import { XpertWorkspaceHomeComponent } from './home.component'

const selectedWorkspace = signal<{ id: string } | null>({ id: 'workspace-1' })

jest.mock('@xpert-ai/cloud/state', () => ({
  Store: class Store {},
  injectWorkspace: () => selectedWorkspace
}))

@Component({
  standalone: true,
  selector: 'tag-filter',
  template: ''
})
class MockTagFilterComponent {
  @Input() allTags: unknown[] | null = null
  @Input() tags: unknown[] | null = null
  @Output() readonly tagsChange = new EventEmitter<unknown[]>()
}

@Component({
  standalone: true,
  selector: 'xpert-workspace-welcome',
  template: ''
})
class MockXpertWorkspaceWelcomeComponent {}

describe('XpertWorkspaceHomeComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    selectedWorkspace.set({ id: 'workspace-1' })
  })

  it('sets the default workspace without switching the selected workspace', async () => {
    const setWorkspace = jest.fn()
    const success = jest.fn()

    TestBed.overrideComponent(XpertWorkspaceHomeComponent, {
      remove: {
        imports: [TagFilterComponent, XpertWorkspaceWelcomeComponent]
      },
      add: {
        imports: [MockTagFilterComponent, MockXpertWorkspaceWelcomeComponent]
      }
    })

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertWorkspaceHomeComponent],
      providers: [
        provideRouter([]),
        {
          provide: Store,
          useValue: {
            user$: of({ id: 'user-1' }),
            setWorkspace
          }
        },
        {
          provide: AppService,
          useValue: {
            isMobile: signal(false),
            lang: signal('en')
          }
        },
        {
          provide: Dialog,
          useValue: {
            open: jest.fn(() => ({
              closed: of(null)
            }))
          }
        },
        {
          provide: NGXLogger,
          useValue: {
            error: jest.fn(),
            warn: jest.fn(),
            log: jest.fn()
          }
        },
        {
          provide: ToastrService,
          useValue: {
            success,
            error: jest.fn()
          }
        },
        TranslateService,
        {
          provide: XpertWorkspaceService,
          useValue: {
            getAllMy: jest.fn(() =>
              of({
                items: [{ id: 'workspace-1', name: 'Workspace 1', ownerId: 'user-1' }]
              })
            ),
            getMyDefault: jest.fn(() => of(null)),
            setMyDefault: jest.fn(() => of({ id: 'workspace-1', name: 'Workspace 1' })),
            refresh: jest.fn()
          }
        },
        {
          provide: XpertAPIService,
          useValue: {}
        },
        {
          provide: XpertToolsetService,
          useValue: {
            getAllTags: jest.fn(() => of([]))
          }
        },
        {
          provide: TagService,
          useValue: {
            getAllByCategory: jest.fn(() => of([]))
          }
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(XpertWorkspaceHomeComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    const stopPropagation = jest.fn()
    await fixture.componentInstance.setDefaultWorkspace(
      { stopPropagation } as unknown as Event,
      { id: 'workspace-1', name: 'Workspace 1', ownerId: 'user-1' } as any
    )

    expect(stopPropagation).toHaveBeenCalled()
    expect(fixture.componentInstance.defaultWorkspaceId()).toBe('workspace-1')
    expect(setWorkspace).not.toHaveBeenCalled()
    expect(success).toHaveBeenCalled()
  })
})
