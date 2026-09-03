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
    }).compileComponents()
    http = TestBed.inject(HttpTestingController)
    history = TestBed.inject(WorkspaceHistoryService)
    history.remember('user-1', 'organization-1', 'workspace-1')
    history.remember('user-1', 'organization-1', 'workspace-2')
    fixture = TestBed.createComponent(CloudSidebarWorkspacesComponent)
    fixture.detectChanges()
    overlay = TestBed.inject(OverlayContainer).getContainerElement()
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
    fixture.nativeElement.querySelector('button').click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

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
    expect(fixture.nativeElement.querySelectorAll('ul a')).toHaveLength(5)
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-expanded')).toBe('true')
  })

  it('shows all accessible workspaces without refetching and remembers selection through the shared store', () => {
    flushWorkspaces()
    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button')
    Array.from(buttons)
      .find((button) => button.textContent?.includes('XP.Sidebar.AllWorkspaces'))
      ?.click()
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelectorAll('ul a')).toHaveLength(7)
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
    expect(overlay.querySelector('[role="dialog"]')?.textContent).toContain('Workspace 2')
    const clicked = jest.fn()
    fixture.componentInstance.clicked.subscribe(clicked)
    overlay.querySelector('a')?.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(TestBed.inject(Router).url).toBe('/xpert/w/workspace-2')
    expect(clicked).toHaveBeenCalledTimes(1)
    expect(overlay.querySelector('[role="dialog"]')).toBeNull()
  })

  it('closes the popup with Escape and retains the expanded list', async () => {
    flushWorkspaces()
    await openPopup()
    overlay.querySelector('a')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fixture.detectChanges()
    expect(fixture.componentInstance.menuOpen()).toBe(false)
    fixture.componentRef.setInput('collapsed', false)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelectorAll('ul a')).toHaveLength(2)
  })

  it('keeps the loaded list stable when navigating between workspaces', async () => {
    flushWorkspaces()
    const state = fixture.componentInstance.state()
    const firstLink = fixture.nativeElement.querySelector('a[href="/xpert/w/workspace-1"]')
    const visibleOrder = fixture.componentInstance.visibleWorkspaces().map((workspace) => workspace.id)
    for (const workspace of workspaces.slice(0, 2)) {
      fixture.nativeElement.querySelector(`a[href="/xpert/w/${workspace.id}"]`).click()
      await fixture.whenStable()
      selectedWorkspace.next(workspace)
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()

      http.expectNone((request) => request.url === '/api/xpert-workspace/my')
      expect(fixture.componentInstance.state()).toBe(state)
      expect(fixture.componentInstance.visibleWorkspaces().map((workspace) => workspace.id)).toEqual(visibleOrder)
      expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()
      expect(fixture.nativeElement.querySelector('a[aria-current="page"]').getAttribute('href')).toBe(
        `/xpert/w/${workspace.id}`
      )
      expect(fixture.nativeElement.querySelector('a[href="/xpert/w/workspace-1"]')).toBe(firstLink)
    }
  })

  it('keeps all-workspaces mode when selecting an entry and applies recent order when reopening the list', async () => {
    flushWorkspaces()
    fixture.componentInstance.showAll.set(true)
    fixture.detectChanges()
    const links = Array.from(fixture.nativeElement.querySelectorAll('ul a'))

    fixture.nativeElement.querySelector('a[href="/xpert/w/workspace-7"]').click()
    await fixture.whenStable()
    selectedWorkspace.next(workspaces[6])
    fixture.detectChanges()

    expect(fixture.componentInstance.showAll()).toBe(true)
    expect(Array.from(fixture.nativeElement.querySelectorAll('ul a'))).toEqual(links)
    http.expectNone((request) => request.url === '/api/xpert-workspace/my')
    expect(history.recent('user-1', 'organization-1')[0]).toBe('workspace-7')

    fixture.componentInstance.toggle()
    fixture.componentInstance.showAll.set(false)
    fixture.componentInstance.toggle()
    fixture.detectChanges()
    expect(fixture.componentInstance.visibleWorkspaces()[0].id).toBe('workspace-7')
    http.expectNone((request) => request.url === '/api/xpert-workspace/my')
  })

  it('refreshes workspace metadata and removes unavailable entries on the existing refresh event', () => {
    flushWorkspaces()
    TestBed.inject(XpertWorkspaceService).refresh()
    flushWorkspaces([{ ...workspaces[0], name: 'Renamed workspace' }])
    expect(fixture.nativeElement.textContent).toContain('Renamed workspace')
    expect(fixture.nativeElement.textContent).not.toContain('Workspace 2')
  })

  it('cancels stale requests on organization change and clears history from the previous user on logout', () => {
    flushWorkspaces()
    TestBed.inject(XpertWorkspaceService).refresh()
    const stale = listRequest()
    organizationId.next('organization-2')
    fixture.detectChanges()
    expect(stale.cancelled).toBe(true)
    expect(fixture.nativeElement.textContent).not.toContain('Workspace 1')
    expect(fixture.nativeElement.textContent).not.toContain('Workspace 2')
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
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull()
    fixture.componentInstance.reload()
    flushWorkspaces([])
    expect(fixture.nativeElement.textContent).toContain('XP.Sidebar.NoRecentWorkspaces')
  })
})
