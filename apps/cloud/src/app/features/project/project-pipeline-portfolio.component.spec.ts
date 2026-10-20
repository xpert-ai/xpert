import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Subject, throwError } from 'rxjs'
import { aggregatePipelineAnalytics, type IXpertProject, type ProjectPipelinePortfolio } from '@xpert-ai/contracts'
import { XpertProjectPipelinePortfolioComponent } from './project-pipeline-portfolio.component'
import { XpertProjectApiService } from './project-api.service'

describe('Project portfolio selection and requests', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const project: IXpertProject = { id, name: 'Selected project' }
  const window = { from: '2026-10-18T00:00:00Z', to: '2026-10-19T00:00:00Z' }
  const { byInstance: _rows, ...totals } = aggregatePipelineAnalytics([], [], window, window.to)
  const report: ProjectPipelinePortfolio = {
    snapshotAt: window.to,
    window,
    selectionScope: 'explicit_authorized_projects',
    totals,
    byProject: [],
    sharedAcrossProjects: 0
  }
  const api = { pipelinePortfolio: jest.fn() }
  beforeEach(async () => {
    jest.clearAllMocks()
    await TestBed.configureTestingModule({
      imports: [XpertProjectPipelinePortfolioComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: XpertProjectApiService, useValue: api }]
    }).compileComponents()
  })
  function create() {
    const fixture = TestBed.createComponent(XpertProjectPipelinePortfolioComponent)
    fixture.componentRef.setInput('projects', [project])
    fixture.detectChanges()
    return fixture
  }
  it('only requests selected IDs and computes a bounded window', async () => {
    const response = new Subject<ProjectPipelinePortfolio>()
    api.pipelinePortfolio.mockReturnValue(response)
    const fixture = create(),
      component = fixture.componentInstance
    const pending = component.refresh()
    expect(component.loading()).toBe(true)
    const input = api.pipelinePortfolio.mock.calls[0][0]
    expect(input.projectIds).toEqual([id])
    expect(Date.parse(input.window.to) - Date.parse(input.window.from)).toBe(7 * 86400_000)
    response.next(report)
    await pending
    fixture.detectChanges()
    expect(component.report()).toEqual(report)
    expect(fixture.nativeElement.textContent).toContain('—')
    expect(component.loading()).toBe(false)
  })
  it('discards a previous response when the selection changes', async () => {
    const response = new Subject<ProjectPipelinePortfolio>()
    api.pipelinePortfolio.mockReturnValue(response)
    const fixture = create(),
      component = fixture.componentInstance
    const pending = component.refresh()
    fixture.componentRef.setInput('projects', [])
    fixture.detectChanges()
    response.next(report)
    await pending
    expect(component.report()).toBeNull()
    expect(component.loading()).toBe(false)
    await component.refresh()
    expect(api.pipelinePortfolio).toHaveBeenCalledTimes(1)
  })
  it('clears old reports on window changes and errors', async () => {
    const fixture = create(),
      component = fixture.componentInstance
    component.report.set(report)
    component.changeWindow('30')
    expect(component.report()).toBeNull()
    expect(component.days()).toBe(30)
    component.changeWindow('999')
    expect(component.days()).toBe(30)
    api.pipelinePortfolio.mockReturnValue(throwError(() => new Error('Access denied')))
    await component.refresh()
    expect(component.error()).toContain('Access denied')
    expect(component.report()).toBeNull()
    expect(component.loading()).toBe(false)
  })
})
