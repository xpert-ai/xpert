import { Dialog } from '@angular/cdk/dialog'
import { Component, EventEmitter, Input, Output, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Location } from '@angular/common'
import { provideLocationMocks } from '@angular/common/testing'
import { NavigationEnd, provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { filter, firstValueFrom, of } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { AppService } from 'apps/cloud/src/app/app.service'
import { Store } from '@cloud/app/@core/state'
import { TagFilterComponent } from 'apps/cloud/src/app/@shared/tag'
import {
  TagService,
  ToastrService,
  OrderTypeEnum,
  XpertAPIService,
  XpertToolsetCategoryEnum,
  XpertTypeEnum,
  XpertToolsetService,
  XpertWorkspaceService
} from '../../../../@core'
import { XpertWorkspaceHomeComponent } from './home.component'

const selectedWorkspace = signal<{ id: string } | null>({ id: 'workspace-1' })

jest.mock('echarts/core', () => ({
  registerTheme: jest.fn()
}))

jest.mock('@cloud/app/@core/state', () => ({
  ...jest.requireActual('@cloud/app/@core/state'),
  Store: class Store {},
  injectWorkspace: () => selectedWorkspace
}))

// Dialog contents are unrelated to workspace navigation.
jest.mock('../settings/settings.component', () => ({
  XpertWorkspaceSettingsComponent: class {}
}))
jest.mock('../connectors/custom-connectors-dialog.component', () => ({
  CustomConnectorsDialogComponent: class {}
}))

jest.mock('../welcome/welcome.component', () => {
  const { Component } = require('@angular/core')
  class XpertWorkspaceWelcomeComponent {}
  Component({
    standalone: true,
    selector: 'xpert-workspace-welcome',
    template: ''
  })(XpertWorkspaceWelcomeComponent)

  return { XpertWorkspaceWelcomeComponent }
})

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

@Component({ standalone: true, template: 'Workspace section' })
class WorkspaceSectionStubComponent {}

const sections = [
  '',
  'xperts',
  'builtin',
  'mcp',
  'custom',
  'connectors',
  'knowledges',
  'database',
  'skills',
  'prompt-workflows'
]
const workspaceUrl = '/xpert/w/workspace-1'

describe('XpertWorkspaceHomeComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    selectedWorkspace.set({ id: 'workspace-1' })
  })

  async function setup() {
    const setWorkspace = jest.fn()
    const success = jest.fn()
    const workspaceService = {
      getAllMy: jest.fn(() =>
        of({
          items: [{ id: 'workspace-1', name: 'Workspace 1', ownerId: 'user-1' }]
        })
      ),
      getMyDefault: jest.fn(() => of(null)),
      setMyDefault: jest.fn(() => of({ id: 'workspace-1', name: 'Workspace 1' })),
      isTenantShared: jest.fn(() => false),
      canWrite: jest.fn(() => true),
      canManage: jest.fn(() => true),
      refresh: jest.fn()
    }

    TestBed.overrideComponent(XpertWorkspaceHomeComponent, {
      remove: {
        imports: [TagFilterComponent]
      },
      add: {
        imports: [MockTagFilterComponent]
      }
    })

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertWorkspaceHomeComponent],
      providers: [
        provideLocationMocks(),
        provideRouter([
          {
            path: 'xpert/w/:id',
            component: XpertWorkspaceHomeComponent,
            children: sections.map((path) => ({ path, component: WorkspaceSectionStubComponent }))
          }
        ]),
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
          useValue: workspaceService
        },
        {
          provide: XpertAPIService,
          useValue: {}
        },
        {
          provide: XpertToolsetService,
          useValue: {
            getAllTags: jest.fn(() => of([{ id: 'tool-tag', name: 'Tool' }]))
          }
        },
        {
          provide: TagService,
          useValue: {
            getAllByCategory: jest.fn((category: string) =>
              of(
                category === 'prompt_workflow'
                  ? [{ id: 'prompt-tag', name: 'Prompt' }]
                  : [{ id: 'expert-tag', name: 'Expert' }]
              )
            )
          }
        }
      ]
    }).compileComponents()

    return { setWorkspace, success, workspaceService }
  }

  async function settle(harness: RouterTestingHarness) {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }

  function expectActiveSection(harness: RouterTestingHarness, section: string) {
    const links = harness.routeNativeElement?.querySelectorAll<HTMLAnchorElement>('a.xpert-list-option.active')
    expect(links).toHaveLength(1)
    expect(links?.[0].getAttribute('href')).toBe(section ? `${workspaceUrl}/${section}` : workspaceUrl)
    expect(links?.[0].getAttribute('aria-current')).toBe('page')
  }

  it.each(sections)('highlights only the current section on direct entry to "%s"', async (section) => {
    await setup()
    const harness = await RouterTestingHarness.create()
    const component = await harness.navigateByUrl(
      `${workspaceUrl}${section ? `/${section}` : ''}?source=bookmark#content`,
      XpertWorkspaceHomeComponent
    )
    await settle(harness)

    expectActiveSection(harness, section)
    expect(component.isAll()).toBe(section === '')
    expect(component.isXperts()).toBe(section === '' || section === 'xperts')
    if (section === 'xperts') {
      expect(component.type()).toBe(XpertTypeEnum.Agent)
      expect(component.allTags().map((tag) => tag.name)).toEqual(['Expert'])
    } else if (section === 'builtin' || section === 'custom' || section === 'mcp') {
      const categories = {
        builtin: XpertToolsetCategoryEnum.BUILTIN,
        custom: XpertToolsetCategoryEnum.API,
        mcp: XpertToolsetCategoryEnum.MCP
      }
      expect(component.type()).toBe(categories[section])
      expect(component.allTags().map((tag) => tag.name)).toEqual(section === 'mcp' ? [] : ['Tool'])
    } else if (section === 'prompt-workflows') {
      expect(component.type()).toBe('prompt_workflow')
      expect(component.allTags().map((tag) => tag.name)).toEqual(['Prompt'])
    } else {
      expect(component.type()).toBeNull()
      expect(component.allTags().map((tag) => tag.name)).toEqual(section === '' ? ['Expert', 'Tool'] : [])
    }
  })

  it('updates the highlight and filters when clicking between sections', async () => {
    await setup()
    const harness = await RouterTestingHarness.create()
    const component = await harness.navigateByUrl(`${workspaceUrl}/xperts`, XpertWorkspaceHomeComponent)
    await settle(harness)

    for (const section of ['database', 'skills', 'prompt-workflows', 'builtin', '']) {
      const url = section ? `${workspaceUrl}/${section}` : workspaceUrl
      const link = harness.routeNativeElement?.querySelector<HTMLAnchorElement>(`a[href="${url}"]`)
      expect(link).toBeTruthy()
      link?.click()
      await settle(harness)
      expect(TestBed.inject(Router).url).toBe(url)
      expectActiveSection(harness, section)
      expect(component.isAll()).toBe(section === '')
      expect(component.type()).toBe(
        section === 'builtin'
          ? XpertToolsetCategoryEnum.BUILTIN
          : section === 'prompt-workflows'
            ? 'prompt_workflow'
            : null
      )
    }
  })

  it('restores the highlight and filters on browser back and forward', async () => {
    await setup()
    const harness = await RouterTestingHarness.create()
    const component = await harness.navigateByUrl(`${workspaceUrl}/xperts`, XpertWorkspaceHomeComponent)
    await harness.navigateByUrl(`${workspaceUrl}/database`)
    const router = TestBed.inject(Router)
    const location = TestBed.inject(Location)
    router.setUpLocationChangeListener()

    const back = firstValueFrom(router.events.pipe(filter((event) => event instanceof NavigationEnd)))
    location.back()
    await back
    await settle(harness)
    expectActiveSection(harness, 'xperts')
    expect(component.type()).toBe(XpertTypeEnum.Agent)

    const forward = firstValueFrom(router.events.pipe(filter((event) => event instanceof NavigationEnd)))
    location.forward()
    await forward
    await settle(harness)
    expectActiveSection(harness, 'database')
    expect(component.type()).toBeNull()
    expect(component.isAll()).toBe(false)
  })

  it('sets the default workspace without switching the selected workspace', async () => {
    const { setWorkspace, success, workspaceService } = await setup()
    const fixture = TestBed.createComponent(XpertWorkspaceHomeComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    const stopPropagation = jest.fn()
    await fixture.componentInstance.setDefaultWorkspace({ stopPropagation } as unknown as Event, {
      id: 'workspace-1',
      name: 'Workspace 1',
      ownerId: 'user-1'
    })

    expect(stopPropagation).toHaveBeenCalled()
    expect(workspaceService.getAllMy).toHaveBeenCalledWith(
      { order: { updatedAt: OrderTypeEnum.DESC } },
      { purpose: 'authoring' }
    )
    expect(workspaceService.getMyDefault).toHaveBeenCalledWith({ purpose: 'authoring' })
    expect(fixture.componentInstance.defaultWorkspaceId()).toBe('workspace-1')
    expect(setWorkspace).not.toHaveBeenCalled()
    expect(success).toHaveBeenCalled()
  })
})
