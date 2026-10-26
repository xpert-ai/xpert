import { CloudSidebarHoverPanelDirective } from './cloud-sidebar-hover-panel.directive'
import { OverlayContainer } from '@angular/cdk/overlay'
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { Component } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import { IXpertProject, Store } from '../../@core'
import { XpertProjectApiService } from '../project/project-api.service'
import { CloudSidebarProjectsComponent } from './cloud-sidebar-projects.component'

@Component({ standalone: true, template: '' })
class ProjectRouteStubComponent {}

describe('CloudSidebarProjectsComponent', () => {
  const projects: IXpertProject[] = [
    { id: 'project-1', name: 'Latest project', status: 'active', ownerId: 'user-1' },
    { id: 'project-2', name: 'Earlier project', status: 'active', ownerId: 'user-1' }
  ]
  let fixture: ComponentFixture<CloudSidebarProjectsComponent>
  let http: HttpTestingController
  let organizationId: BehaviorSubject<string | null>
  let overlay: HTMLElement

  beforeEach(async () => {
    organizationId = new BehaviorSubject<string | null>('organization-1')
    await TestBed.configureTestingModule({
      imports: [CloudSidebarProjectsComponent, TranslateModule.forRoot(), HttpClientTestingModule],
      providers: [
        provideRouter([{ path: 'project/:id', component: ProjectRouteStubComponent }]),
        { provide: Store, useValue: { selectOrganizationId: () => organizationId } }
      ]
    })
      .overrideComponent(CloudSidebarProjectsComponent, {
        add: { hostDirectives: [{ directive: CloudSidebarHoverPanelDirective, inputs: ['xpSidebarHoverPanel'] }] }
      })
      .compileComponents()
    http = TestBed.inject(HttpTestingController)
    fixture = TestBed.createComponent(CloudSidebarProjectsComponent)
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
    return http.expectOne((request) => request.url === '/api/xpert-project/my')
  }

  function flushProjects(items = projects) {
    listRequest().flush({ items, total: items.length })
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

  it('requests five active projects by recent update and displays them beneath the menu', () => {
    const request = listRequest()
    expect(JSON.parse(request.request.params.get('data')!)).toEqual({
      where: { status: 'active' },
      order: { updatedAt: 'DESC', id: 'ASC' },
      skip: 0,
      take: 5
    })
    expect(overlay.querySelector('[role="status"]')).not.toBeNull()
    request.flush({ items: projects, total: 2 })
    fixture.detectChanges()

    const links: NodeListOf<HTMLAnchorElement> = overlay.querySelectorAll('a')
    expect(Array.from(links, (link) => link.getAttribute('href'))).toEqual([
      '/project/project-1',
      '/project/project-2',
      '/project'
    ])
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-expanded')).toBe('true')
  })

  it('opens all projects from the primary menu when no current project is authorized', async () => {
    flushProjects()
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    fixture.nativeElement.querySelector('button').click()
    await fixture.whenStable()
    expect(navigate).toHaveBeenCalledWith(['/project'])
  })

  it('opens a popup when collapsed and closes it after navigating to a project', async () => {
    flushProjects()
    await openPopup()
    expect(fixture.nativeElement.querySelector('a')).toBeNull()
    expect(overlay.querySelector('[role="region"]')?.textContent).toContain('Latest project')
    const router = TestBed.inject(Router)
    const navigate = jest.spyOn(router, 'navigateByUrl').mockResolvedValue(true)
    const selected = jest.fn()
    fixture.componentInstance.clicked.subscribe(selected)

    overlay.querySelector('a')?.click()
    fixture.detectChanges()

    expect(navigate).toHaveBeenCalledTimes(1)
    const target = navigate.mock.calls[0][0]
    expect(typeof target === 'string' ? target : router.serializeUrl(target)).toBe('/project/project-1')
    expect(selected).toHaveBeenCalledTimes(1)
    expect(fixture.nativeElement.querySelector('a')).toBeNull()
  })

  it('closes the popup on Escape or outside click and preserves the inline list', async () => {
    flushProjects()
    await openPopup()
    overlay.querySelector('a')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fixture.detectChanges()
    expect(fixture.componentInstance.menuOpen()).toBe(false)

    await openPopup()
    overlay.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.menuOpen()).toBe(false)

    fixture.componentRef.setInput('collapsed', false)
    fixture.detectChanges()
    expect(overlay.querySelector('a[href="/project/project-1"]')).not.toBeNull()
  })

  it('clears projects and cancels stale requests when organization scope changes', () => {
    flushProjects()
    fixture.componentInstance.reload()
    const stale = listRequest()

    organizationId.next('organization-2')
    fixture.detectChanges()

    expect(stale.cancelled).toBe(true)
    expect(overlay.textContent).not.toContain('Latest project')
    flushProjects([{ ...projects[0], id: 'other-project', name: 'Other organization project' }])
    expect(overlay.textContent).toContain('Other organization project')
  })

  it('loads the authorized current project on direct navigation without reloading the recent list', async () => {
    flushProjects()
    const state = fixture.componentInstance.state()
    await TestBed.inject(Router).navigateByUrl('/project/project-1')
    fixture.detectChanges()
    http.expectOne((request) => request.url === '/api/xpert-project/project-1').flush(projects[0])
    fixture.detectChanges()
    await openPopup()
    expect(fixture.componentInstance.state()).toBe(state)
    expect(overlay.textContent).toContain('Latest project')
    expect(overlay.querySelector('a[href="/project/project-1/config"]')).not.toBeNull()
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    fixture.nativeElement.querySelector('button').click()
    await fixture.whenStable()
    expect(navigate).toHaveBeenCalledWith(['/project', 'project-1'])
    http.expectNone((request) => request.url === '/api/xpert-project/my')
    fixture.componentInstance.browsing.set(true)
    fixture.detectChanges()
    expect(overlay.querySelectorAll('ul a')).toHaveLength(2)
  })

  it('refreshes names after a successful project update', () => {
    flushProjects()
    TestBed.inject(XpertProjectApiService).update('project-1', { name: 'Renamed project' }).subscribe()
    const request = http.expectOne('/api/xpert-project/project-1')
    request.flush({ ...projects[0], name: 'Renamed project' })
    flushProjects([{ ...projects[0], name: 'Renamed project' }])

    expect(overlay.textContent).toContain('Renamed project')
    expect(overlay.textContent).not.toContain('Latest project')
  })

  it('removes an archived project from the recent list after persistence succeeds', () => {
    flushProjects()
    TestBed.inject(XpertProjectApiService).archive('project-1').subscribe()
    http.expectOne('/api/xpert-project/project-1/archive').flush({ ...projects[0], status: 'archived' })
    flushProjects([projects[1]])

    expect(overlay.textContent).not.toContain('Latest project')
    expect(overlay.textContent).toContain('Earlier project')
  })

  it('allows retry after a loading failure and keeps the all-projects link in the empty state', () => {
    listRequest().flush({ message: 'Load failed' }, { status: 500, statusText: 'Server error' })
    fixture.detectChanges()
    expect(overlay.querySelector('[role="alert"]')).not.toBeNull()

    const buttons: NodeListOf<HTMLButtonElement> = overlay.querySelectorAll('button')
    Array.from(buttons)
      .find((button) => button.textContent?.includes('XP.Common.ErrorState.Retry'))
      ?.click()
    flushProjects([])

    expect(overlay.textContent).toContain('XP.Sidebar.NoRecentProjects')
    expect(overlay.querySelector('a[href="/project"]')).not.toBeNull()
  })
})
