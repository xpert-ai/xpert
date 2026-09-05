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
    }).compileComponents()
    http = TestBed.inject(HttpTestingController)
    fixture = TestBed.createComponent(CloudSidebarProjectsComponent)
    fixture.detectChanges()
    overlay = TestBed.inject(OverlayContainer).getContainerElement()
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
    fixture.nativeElement.querySelector('button').click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  it('requests five active projects by recent update and displays them beneath the menu', () => {
    const request = listRequest()
    expect(JSON.parse(request.request.params.get('data')!)).toEqual({
      where: { status: 'active' },
      order: { updatedAt: 'DESC' },
      skip: 0,
      take: 5
    })
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull()
    request.flush({ items: projects, total: 2 })
    fixture.detectChanges()

    const links: NodeListOf<HTMLAnchorElement> = fixture.nativeElement.querySelectorAll('a')
    expect(Array.from(links, (link) => link.getAttribute('href'))).toEqual([
      '/project/project-1',
      '/project/project-2',
      '/project'
    ])
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-expanded')).toBe('true')
  })

  it('opens a popup when collapsed and closes it after navigating to a project', async () => {
    flushProjects()
    await openPopup()
    expect(fixture.nativeElement.querySelector('a')).toBeNull()
    expect(overlay.querySelector('[role="dialog"]')?.textContent).toContain('Latest project')
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
    expect(overlay.querySelector('[role="dialog"]')).toBeNull()
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
    expect(fixture.nativeElement.querySelector('a[href="/project/project-1"]')).not.toBeNull()
  })

  it('clears projects and cancels stale requests when organization scope changes', () => {
    flushProjects()
    fixture.componentInstance.reload()
    const stale = listRequest()

    organizationId.next('organization-2')
    fixture.detectChanges()

    expect(stale.cancelled).toBe(true)
    expect(fixture.nativeElement.textContent).not.toContain('Latest project')
    flushProjects([{ ...projects[0], id: 'other-project', name: 'Other organization project' }])
    expect(fixture.nativeElement.textContent).toContain('Other organization project')
  })

  it('preserves the list and only changes the active project when navigating between projects', async () => {
    flushProjects()
    const router = TestBed.inject(Router)
    const state = fixture.componentInstance.state()
    const firstLink = fixture.nativeElement.querySelector('a[href="/project/project-1"]')

    for (const project of projects) {
      await router.navigateByUrl(`/project/${project.id}`)
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()

      http.expectNone((request) => request.url === '/api/xpert-project/my')
      expect(fixture.componentInstance.state()).toBe(state)
      expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()
      expect(fixture.nativeElement.querySelector('a[aria-current="page"]').getAttribute('href')).toBe(
        `/project/${project.id}`
      )
      expect(fixture.nativeElement.querySelector('a[href="/project/project-1"]')).toBe(firstLink)
    }
  })

  it('refreshes names after a successful project update', () => {
    flushProjects()
    TestBed.inject(XpertProjectApiService).update('project-1', { name: 'Renamed project' }).subscribe()
    const request = http.expectOne('/api/xpert-project/project-1')
    request.flush({ ...projects[0], name: 'Renamed project' })
    flushProjects([{ ...projects[0], name: 'Renamed project' }])

    expect(fixture.nativeElement.textContent).toContain('Renamed project')
    expect(fixture.nativeElement.textContent).not.toContain('Latest project')
  })

  it('removes an archived project from the recent list after persistence succeeds', () => {
    flushProjects()
    TestBed.inject(XpertProjectApiService).archive('project-1').subscribe()
    http.expectOne('/api/xpert-project/project-1/archive').flush({ ...projects[0], status: 'archived' })
    flushProjects([projects[1]])

    expect(fixture.nativeElement.textContent).not.toContain('Latest project')
    expect(fixture.nativeElement.textContent).toContain('Earlier project')
  })

  it('allows retry after a loading failure and keeps the all-projects link in the empty state', () => {
    listRequest().flush({ message: 'Load failed' }, { status: 500, statusText: 'Server error' })
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull()

    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button')
    Array.from(buttons)
      .find((button) => button.textContent?.includes('XP.Common.ErrorState.Retry'))
      ?.click()
    flushProjects([])

    expect(fixture.nativeElement.textContent).toContain('XP.Sidebar.NoRecentProjects')
    expect(fixture.nativeElement.querySelector('a[href="/project"]')).not.toBeNull()
  })
})
