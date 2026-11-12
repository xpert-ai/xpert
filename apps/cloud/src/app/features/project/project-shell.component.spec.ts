import { BreakpointObserver } from '@angular/cdk/layout'
import { Component, ErrorHandler } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, RouterOutlet } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { of } from 'rxjs'
import { XpertProjectShellComponent } from './project-shell.component'
import { XpertProjectFacade } from './project.facade'

@Component({ standalone: true, template: '' })
class ProjectPageStubComponent {}

describe('Project shell route activation', () => {
  const loadProject = jest.fn()
  const handleError = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'project/:id',
            component: XpertProjectShellComponent,
            children: ['', 'config', 'timeline', 'pipelines', 'assets', 'tasks'].map((path) => ({
              path,
              component: ProjectPageStubComponent
            }))
          }
        ]),
        { provide: XpertProjectFacade, useValue: { loadProject } },
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: false }) } },
        { provide: ErrorHandler, useValue: { handleError } }
      ]
    }).overrideComponent(XpertProjectShellComponent, {
      set: {
        imports: [RouterOutlet],
        template: '<span data-active-tab>{{ activeTab() }}</span><router-outlet />'
      }
    })
  })

  afterEach(() => TestBed.resetTestingModule())

  it.each([
    ['', ''],
    ['/config', 'config'],
    ['/pipelines', 'timeline']
  ])('opens a Project directly at %s while child routes are activating', async (suffix, activeTab) => {
    const harness = await RouterTestingHarness.create()
    const shell = await harness.navigateByUrl(`/project/project-1${suffix}`, XpertProjectShellComponent)

    expect(shell.activeTab()).toBe(activeTab)
    expect(loadProject).toHaveBeenCalledWith('project-1')
    expect(handleError).not.toHaveBeenCalled()
  })

  it('keeps updating the active tab when navigating within the existing Project shell', async () => {
    const harness = await RouterTestingHarness.create()
    const shell = await harness.navigateByUrl('/project/project-1', XpertProjectShellComponent)

    for (const [path, activeTab] of [
      ['config', 'config'],
      ['assets', 'assets'],
      ['tasks', 'tasks'],
      ['timeline', 'timeline'],
      ['pipelines', 'timeline'],
      ['', '']
    ]) {
      const current = await harness.navigateByUrl(
        `/project/project-1${path ? `/${path}` : ''}`,
        XpertProjectShellComponent
      )
      expect(current).toBe(shell)
      expect(current.activeTab()).toBe(activeTab)
      expect(harness.routeNativeElement?.querySelector('[data-active-tab]')?.textContent).toBe(activeTab)
    }
    expect(handleError).not.toHaveBeenCalled()
  })
})
