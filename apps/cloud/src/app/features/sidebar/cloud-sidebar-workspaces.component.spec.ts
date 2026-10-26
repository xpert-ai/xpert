import { Dialog } from '@angular/cdk/dialog'
import { CloudSidebarHoverPanelDirective } from './cloud-sidebar-hover-panel.directive'
import { OverlayContainer } from '@angular/cdk/overlay'
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { Component } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject } from 'rxjs'
import { IUser, IXpertWorkspace, Store, WorkspaceHistoryService, XpertWorkspaceService } from '../../@core'
import { CloudSidebarWorkspacesComponent } from './cloud-sidebar-workspaces.component'

@Component({ standalone: true, template: '' })
class WorkspaceRouteStubComponent {}

describe('CloudSidebarWorkspacesComponent', () => {
  const workspaces: IXpertWorkspace[] = Array.from({ length: 7 }, (_, index) => ({
    id: `workspace-${index + 1}`,
    name: `Workspace ${index + 1}`,
    status: 'active',
    ownerId: 'user-1'
  }))
  let fixture: ComponentFixture<CloudSidebarWorkspacesComponent>
  let http: HttpTestingController
  let history: WorkspaceHistoryService
  let organizationId: BehaviorSubject<string | null>
  let user: BehaviorSubject<Partial<IUser> | null>
  let selectedWorkspace: BehaviorSubject<IXpertWorkspace | null>
  let overlay: HTMLElement

  beforeEach(async () => {
    localStorage.clear()
    organizationId = new BehaviorSubject<string | null>('organization-1')
    user = new BehaviorSubject<Partial<IUser> | null>({ id: 'user-1' })
    selectedWorkspace = new BehaviorSubject<IXpertWorkspace | null>(null)
    await TestBed.configureTestingModule({
      imports: [CloudSidebarWorkspacesComponent, TranslateModule.forRoot(), HttpClientTestingModule],
      providers: [
        provideRouter([{ path: 'xpert/w/:id', component: WorkspaceRouteStubComponent }]),
        { provide: NGXLogger, useValue: {} },
        {
          provide: Store,
          useValue: { user$: user, selectedWorkspace$: selectedWorkspace, selectOrganizationId: () => organizationId }
        }
      ]
    })
      .overrideComponent(CloudSidebarWorkspacesComponent, {
        add: { hostDirectives: [{ directive: CloudSidebarHoverPanelDirective, inputs: ['xpSidebarHoverPanel'] }] }
      })
      .compileComponents()
    http = TestBed.inject(HttpTestingController)
    history = TestBed.inject(WorkspaceHistoryService)
    history.remember('user-1', 'organization-1', 'workspace-1')
    history.remember('user-1', 'organization-1', 'workspace-2')
    fixture = TestBed.createComponent(CloudSidebarWorkspacesComponent)
    fixture.componentRef.setInput('xpSidebarHoverPanel', true)
    fixture.detectChanges()
    overlay = TestBed.inject(OverlayContainer).getContainerElement()
    fixture.nativeElement
      .querySelector('button')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    fixture.detectChanges()
  })

  afterEach(() => {
    fixture.destroy()
    http.verify()
  })

  function listRequest() {
    return http.expectOne((request) => request.url === '/api/xpert-workspace/my')
  }

  function flushWorkspaces(items = workspaces) {
    listRequest().flush({ items })
    fixture.detectChanges()
  }

  async function openPopup() {
    fixture.componentRef.setInput('collapsed', true)
    fixture.detectChanges()
    fixture.nativeElement
      .querySelector('button')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  it('preserves the environment action and its workspace write permission', async () => {
    const dialog = jest.spyOn(TestBed.inject(Dialog), 'open').mockImplementation()
    const readOnly = {
      ...workspaces[0],
      capabilities: { canRead: true, canRun: true, canWrite: false, canManage: false }
    }
    flushWorkspaces([readOnly])
    selectedWorkspace.next(readOnly)
    fixture.detectChanges()
    expect(overlay.querySelector<HTMLButtonElement>('[data-sidebar-panel-action]')?.disabled).toBe(true)
    await fixture.componentInstance.openEnvironments()
    expect(dialog).not.toHaveBeenCalled()
    TestBed.inject(XpertWorkspaceService).refresh()
    const writable = { ...readOnly, capabilities: { ...readOnly.capabilities, canWrite: true } }
    flushWorkspaces([writable])
    expect(overlay.querySelector<HTMLButtonElement>('[data-sidebar-panel-action]')?.disabled).toBe(false)
    await fixture.componentInstance.openEnvironments()
    expect(dialog).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ data: { workspaceId: writable.id } })
    )
  })

  it('opens the selected authorized workspace on primary click and falls back after scope changes', async () => {
    flushWorkspaces()
    selectedWorkspace.next(workspaces[1])
    fixture.detectChanges()
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    fixture.nativeElement.querySelector('button').click()
    await fixture.whenStable()
    expect(navigate).toHaveBeenLastCalledWith(['/xpert/w', 'workspace-2'])
    organizationId.next('organization-2')
    flushWorkspaces([])
    fixture.nativeElement.querySelector('button').click()
    await fixture.whenStable()
    expect(navigate).toHaveBeenLastCalledWith(['/xpert/w'])
  })

  it('shows five recently used accessible workspaces rather than recently updated ones', () => {
    for (const workspace of workspaces) history.remember('user-1', 'organization-1', workspace.id)
    history.remember('user-1', 'organization-1', 'inaccessible')
    history.remember('user-1', 'organization-1', 'archived')
    const request = listRequest()
    expect(request.request.params.get('purpose')).toBe('authoring')
    expect(JSON.parse(request.request.params.get('data')!)).toEqual({ order: { updatedAt: 'DESC' } })
    request.flush({ items: [...workspaces, { ...workspaces[0], id: 'archived', status: 'archived' }] })
    fixture.componentInstance.toggle()
    fixture.componentInstance.toggle()
    fixture.detectChanges()

    expect(fixture.componentInstance.visibleWorkspaces().map((workspace) => workspace.id)).toEqual([
      'workspace-7',
      'workspace-6',
      'workspace-5',
      'workspace-4',
      'workspace-3'
    ])
    expect(overlay.querySelectorAll('ul a')).toHaveLength(5)
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-expanded')).toBe('true')
  })

  it('shows all accessible workspaces without refetching and remembers selection through the shared store', () => {
    flushWorkspaces()
    const buttons: NodeListOf<HTMLButtonElement> = overlay.querySelectorAll('button')
    Array.from(buttons)
      .find((button) => button.textContent?.includes('XP.Sidebar.AllWorkspaces'))
      ?.click()
    fixture.detectChanges()
    expect(overlay.querySelectorAll('ul a')).toHaveLength(7)
    http.expectNone((request) => request.url === '/api/xpert-workspace/my')

    selectedWorkspace.next(workspaces[6])
    fixture.detectChanges()
    fixture.componentInstance.showAll.set(false)
    fixture.componentInstance.toggle()
    fixture.componentInstance.toggle()
    fixture.detectChanges()
    expect(fixture.componentInstance.visibleWorkspaces()[0].id).toBe('workspace-7')
    expect(history.recent('user-1', 'organization-1')[0]).toBe('workspace-7')
  })

  it('opens a collapsed popup and navigates directly to the selected workspace', async () => {
    flushWorkspaces()
    await openPopup()
    expect(fixture.nativeElement.querySelector('a')).toBeNull()
    expect(overlay.querySelector('[role="region"]')?.textContent).toContain('Workspace 2')
    const clicked = jest.fn()
    fixture.componentInstance.clicked.subscribe(clicked)
    overlay.querySelector('a')?.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(TestBed.inject(Router).url).toBe('/xpert/w/workspace-2')
    expect(clicked).toHaveBeenCalledTimes(1)
    expect(overlay.querySelector('[role="region"]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('closes the popup with Escape and retains the expanded list', async () => {
    flushWorkspaces()
    await openPopup()
    overlay.querySelector('a')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fixture.detectChanges()
    expect(fixture.componentInstance.menuOpen()).toBe(false)
    fixture.componentRef.setInput('collapsed', false)
    fixture.detectChanges()
    expect(overlay.querySelectorAll('ul a')).toHaveLength(2)
  })

  it('switches from workspace selection to scoped navigation and back without refetching', async () => {
    flushWorkspaces()
    const state = fixture.componentInstance.state()
    overlay.querySelector<HTMLAnchorElement>('a[href="/xpert/w/workspace-1"]')!.click()
    await fixture.whenStable()
    selectedWorkspace.next(workspaces[0])
    fixture.detectChanges()
    await openPopup()
    expect(overlay.textContent).toContain('Workspace 1')
    expect(overlay.querySelector('a[href="/xpert/w/workspace-1/skills"]')).not.toBeNull()
    expect(fixture.componentInstance.state()).toBe(state)
    fixture.componentInstance.browsing.set(true)
    fixture.componentInstance.showAll.set(true)
    fixture.detectChanges()
    expect(overlay.querySelectorAll('ul a')).toHaveLength(7)
    expect(history.recent('user-1', 'organization-1')[0]).toBe('workspace-1')
    http.expectNone((request) => request.url === '/api/xpert-workspace/my')
  })

  it('refreshes workspace metadata and removes unavailable entries on the existing refresh event', () => {
    flushWorkspaces()
    TestBed.inject(XpertWorkspaceService).refresh()
    flushWorkspaces([{ ...workspaces[0], name: 'Renamed workspace' }])
    expect(overlay.textContent).toContain('Renamed workspace')
    expect(overlay.textContent).not.toContain('Workspace 2')
  })

  it('cancels stale requests on organization change and clears history from the previous user on logout', () => {
    flushWorkspaces()
    TestBed.inject(XpertWorkspaceService).refresh()
    const stale = listRequest()
    organizationId.next('organization-2')
    fixture.detectChanges()
    expect(stale.cancelled).toBe(true)
    expect(overlay.textContent).not.toContain('Workspace 1')
    expect(overlay.textContent).not.toContain('Workspace 2')
    flushWorkspaces()
    expect(fixture.componentInstance.recentWorkspaces()).toEqual([])

    user.next(null)
    fixture.detectChanges()
    expect(fixture.componentInstance.state().items).toEqual([])
    http.expectNone((request) => request.url === '/api/xpert-workspace/my')
  })

  it('supports retry and shows the empty state when no workspaces exist', () => {
    listRequest().flush({ message: 'Load failed' }, { status: 500, statusText: 'Server error' })
    fixture.detectChanges()
    expect(overlay.querySelector('[role="alert"]')).not.toBeNull()
    fixture.componentInstance.reload()
    flushWorkspaces([])
    expect(overlay.textContent).toContain('XP.Sidebar.NoRecentWorkspaces')
  })
})
