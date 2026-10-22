import { Dialog } from '@angular/cdk/dialog'
import { Component, Input, NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { provideRouter, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ITag, IXpert, XpertTypeEnum } from '@xpert-ai/contracts'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, Observable, of, Subject } from 'rxjs'

jest.mock('../../../../@core', () => ({
  XpertAPIService: class {},
  XpertWorkspaceService: class {},
  ToastrService: class {},
  XpertTypeEnum: jest.requireActual('@xpert-ai/contracts').XpertTypeEnum,
  OrderTypeEnum: jest.requireActual('@xpert-ai/contracts').OrderTypeEnum,
  routeAnimations: [],
  getErrorMessage: (error: unknown) => String(error)
}))
jest.mock('../../../../app.service', () => ({ AppService: class {} }))
jest.mock('../home/home.component', () => ({ XpertWorkspaceHomeComponent: class {} }))
jest.mock('../../xpert/index', () => ({ XpertNewBlankComponent: class {} }))
jest.mock('apps/cloud/src/app/@shared/xpert', () => ({
  XpertBasicDialogComponent: class {},
  XpertCardComponent: class {}
}))
jest.mock('../api-tools/tools.component', () => ({ XpertWorkspaceApiToolsComponent: class {} }))
jest.mock('../builtin-tools/tools.component', () => ({ XpertWorkspaceBuiltinToolsComponent: class {} }))
jest.mock('../knowledges/knowledges.component', () => ({ XpertWorkspaceKnowledgesComponent: class {} }))
jest.mock('../mcp-tools/tools.component', () => ({ XpertWorkspaceMCPToolsComponent: class {} }))
jest.mock('@xpert-ai/headless-ui', () => ({
  myRxResource: jest.requireActual('../../../../../../../../packages/ui/src/lib/ui/compat/core/signal/resource')
    .myRxResource,
  injectConfirmUnique: () => jest.fn(),
  XpI18nPipe: class {},
  XpCommonModule: class {},
  XpDynamicGridDirective: class {},
  DisplayBehaviour: {},
  routeAnimations: []
}))

import { ToastrService, XpertAPIService, XpertWorkspaceService } from '../../../../@core'
import { AppService } from '../../../../app.service'
import { XpertWorkspaceAllComponent } from '../all/all.component'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertWorkspaceXpertsComponent } from './xperts.component'

@Component({ standalone: true, selector: 'xpert-card', template: '{{ xpert.title }}' })
class AssistantCardStub {
  @Input() xpert: IXpert
  @Input() highlight: string
}

const engineering: ITag = { name: 'engineering' }
function assistant(id: string, overrides: Partial<IXpert> = {}): IXpert {
  return { id, name: id, title: id, type: XpertTypeEnum.Agent, latest: true, tags: [], ...overrides }
}

describe('Workspace assistant refresh', () => {
  async function setup(view: 'all' | 'xperts' = 'xperts') {
    // Match the service's replayed initial value, not just subsequent refresh events.
    const refresh = new BehaviorSubject<void>(undefined)
    const workspace = signal({ id: 'workspace-1' })
    const tags = signal<ITag[]>([])
    const searchText = signal('')
    const getAllByWorkspace = jest.fn<Observable<{ items: IXpert[] }>, [string, unknown]>(() =>
      of({ items: [assistant('existing')] })
    )
    TestBed.overrideComponent(XpertWorkspaceXpertsComponent, {
      set: { imports: [RouterModule, TranslateModule, AssistantCardStub], schemas: [NO_ERRORS_SCHEMA] }
    })
    TestBed.overrideComponent(XpertWorkspaceAllComponent, {
      set: { imports: [RouterModule, TranslateModule, XpertWorkspaceXpertsComponent], schemas: [NO_ERRORS_SCHEMA] }
    })
    await TestBed.configureTestingModule({
      imports: [XpertWorkspaceAllComponent, XpertWorkspaceXpertsComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppService, useValue: { isMobile: signal(false), lang: signal('en') } },
        { provide: Dialog, useValue: {} },
        { provide: NGXLogger, useValue: {} },
        { provide: ToastrService, useValue: {} },
        { provide: XpertWorkspaceService, useValue: {} },
        { provide: XpertAPIService, useValue: { getAllByWorkspace, onRefresh: () => refresh.asObservable() } },
        {
          provide: XpertWorkspaceHomeComponent,
          useValue: {
            workspace,
            canWriteWorkspace: signal(false),
            type: signal(view === 'all' ? null : XpertTypeEnum.Agent),
            tags,
            toolTags: signal([]),
            searchText
          }
        }
      ]
    }).compileComponents()
    const fixture =
      view === 'all'
        ? TestBed.createComponent(XpertWorkspaceAllComponent)
        : TestBed.createComponent(XpertWorkspaceXpertsComponent)
    async function settle() {
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()
    }
    const cards = () =>
      fixture.debugElement
        .queryAll(By.directive(AssistantCardStub))
        .map((element) => element.nativeElement.textContent.trim())
    await settle()
    return { fixture, refresh, workspace, tags, searchText, getAllByWorkspace, settle, cards }
  }

  it.each(['all', 'xperts'] as const)(
    'refreshes the rendered %s view without closing a dialog or navigating',
    async (view) => {
      const { refresh, getAllByWorkspace, settle, cards } = await setup(view)
      expect(getAllByWorkspace).toHaveBeenCalledTimes(1)
      expect(cards()).toEqual(['existing'])
      getAllByWorkspace.mockReturnValue(of({ items: [assistant('installed'), assistant('existing')] }))
      refresh.next()
      await settle()
      expect(getAllByWorkspace).toHaveBeenCalledTimes(2)
      expect(cards()).toEqual(['installed', 'existing'])

      refresh.next()
      await settle()
      expect(getAllByWorkspace).toHaveBeenCalledTimes(3)
      expect(cards()).toEqual(['installed', 'existing'])
    }
  )

  it('preserves the workspace, search and tags while applying them to refreshed results', async () => {
    const { refresh, workspace, tags, searchText, getAllByWorkspace, settle, cards } = await setup()
    tags.set([engineering])
    searchText.set('TECHNICAL')
    getAllByWorkspace.mockReturnValue(
      of({
        items: [
          assistant('matching', { title: 'Technical assistant', tags: [engineering] }),
          assistant('wrong-tag', { title: 'Technical assistant' }),
          assistant('wrong-title', { title: 'Sales assistant', tags: [engineering] }),
          assistant('old-version', { title: 'Technical assistant', tags: [engineering], latest: false })
        ]
      })
    )
    refresh.next()
    await settle()
    expect(cards()).toEqual(['Technical assistant'])
    expect(workspace()).toEqual({ id: 'workspace-1' })
    expect(tags()).toEqual([engineering])
    expect(searchText()).toBe('TECHNICAL')
    expect(getAllByWorkspace).toHaveBeenLastCalledWith(
      'workspace-1',
      expect.objectContaining({
        where: { type: XpertTypeEnum.Agent, latest: true }
      })
    )
  })

  it('cancels an old workspace request and refreshes only the currently selected workspace', async () => {
    const { refresh, workspace, getAllByWorkspace, settle, cards } = await setup()
    const pending = new Subject<{ items: IXpert[] }>()
    getAllByWorkspace.mockReturnValueOnce(pending)
    refresh.next()
    await settle()
    expect(pending.observed).toBe(true)
    getAllByWorkspace.mockReturnValue(of({ items: [assistant('second-workspace')] }))
    workspace.set({ id: 'workspace-2' })
    await settle()
    expect(pending.observed).toBe(false)
    pending.next({ items: [assistant('stale')] })
    refresh.next()
    await settle()
    expect(getAllByWorkspace).toHaveBeenLastCalledWith('workspace-2', expect.anything())
    expect(cards()).toEqual(['second-workspace'])
  })

  it('unsubscribes from refresh notifications when the view is destroyed', async () => {
    const { fixture, refresh, getAllByWorkspace } = await setup()
    expect(refresh.observed).toBe(true)
    fixture.destroy()
    expect(refresh.observed).toBe(false)
    refresh.next()
    expect(getAllByWorkspace).toHaveBeenCalledTimes(1)
  })
})
