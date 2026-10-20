import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import type { XpertProjectEntry } from '@xpert-ai/contracts'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectApplicationComponent } from './project-application.component'

describe('Project application entry', () => {
  const project = { id: 'project', applicationKey: 'neutral:app', projectTypeKey: 'case' }
  const entry: XpertProjectEntry = {
    kind: 'assistant',
    projectId: 'project',
    xpertId: 'published-assistant',
    slug: 'neutral',
    viewKey: 'neutral__case',
    selectionId: 'case'
  }
  const api = { get: jest.fn(), typeEntry: jest.fn() }
  const navigate = jest.fn(async () => true)
  let focus: BehaviorSubject<ReturnType<typeof convertToParamMap>>
  beforeEach(() => {
    jest.clearAllMocks()
    navigate.mockResolvedValue(true)
    api.get.mockReturnValue(of(project))
    api.typeEntry.mockReturnValue(of(entry))
    const paramMap = convertToParamMap({ id: 'project' })
    focus = new BehaviorSubject(convertToParamMap({}))
    TestBed.configureTestingModule({
      imports: [XpertProjectApplicationComponent, TranslateModule.forRoot()],
      providers: [
        { provide: XpertProjectApiService, useValue: api },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: focus,
            snapshot: { queryParamMap: convertToParamMap({}) },
            parent: { paramMap: of(paramMap), snapshot: { paramMap } }
          }
        }
      ]
    })
  })
  it('uses the authorized stored classification and resolved business selection', async () => {
    TestBed.createComponent(XpertProjectApplicationComponent)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.typeEntry).toHaveBeenCalledWith(
      { applicationKey: 'neutral:app', projectTypeKey: 'case' },
      { projectId: 'project' }
    )
    expect(navigate).toHaveBeenCalledWith(['/chat/x', 'neutral', 'p', 'project', 'c'], {
      queryParams: { view: 'neutral__case', viewSelection: 'case', viewProject: 'project' }
    })
  })
  it('passes only the node identity to the server and uses the resolved focus parameters', async () => {
    const nodeId = '45123b96-3d55-4321-91d3-9123acb31380'
    focus.next(convertToParamMap({ pipelineNodeId: nodeId }))
    api.typeEntry.mockReturnValue(of({ ...entry, parameters: { tab: 'validation', itemId: 'automotive-part' } }))
    TestBed.createComponent(XpertProjectApplicationComponent)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.typeEntry).toHaveBeenCalledWith(expect.anything(), { projectId: 'project', pipelineNodeId: nodeId })
    expect(navigate).toHaveBeenCalledWith(expect.anything(), {
      queryParams: expect.objectContaining({
        viewParameters: JSON.stringify({ tab: 'validation', itemId: 'automotive-part' })
      })
    })
  })
  it('keeps a revoked or unavailable application visible as an error without falling back', async () => {
    api.typeEntry.mockReturnValue(throwError(() => Error('Access denied')))
    const fixture = TestBed.createComponent(XpertProjectApplicationComponent)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(navigate).not.toHaveBeenCalled()
    expect(fixture.componentInstance.error()).toBeTruthy()
  })
  it('does not navigate after the user leaves while entry resolution is pending', async () => {
    const pending = new Subject<XpertProjectEntry>()
    api.typeEntry.mockReturnValue(pending)
    const fixture = TestBed.createComponent(XpertProjectApplicationComponent)
    await new Promise((resolve) => setTimeout(resolve, 0))
    fixture.destroy()
    pending.next(entry)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(navigate).not.toHaveBeenCalled()
  })
  it('rejects an entry resolved for a different Project', async () => {
    api.typeEntry.mockReturnValue(of({ ...entry, projectId: 'other' }))
    const fixture = TestBed.createComponent(XpertProjectApplicationComponent)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(navigate).not.toHaveBeenCalled()
    expect(fixture.componentInstance.error()).toBeTruthy()
  })
  it('shows a cancelled navigation instead of leaving the entry permanently loading', async () => {
    navigate.mockResolvedValue(false)
    const fixture = TestBed.createComponent(XpertProjectApplicationComponent)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fixture.componentInstance.busy()).toBe(false)
    expect(fixture.componentInstance.error()).toBe('PROJECT_APPLICATION_NAVIGATION_CANCELLED')
  })
  it('re-resolves a new node in the same Project and ignores the older pending destination', async () => {
    const first = new Subject<XpertProjectEntry>()
    const firstNode = '45123b96-3d55-4321-91d3-9123acb31380'
    const secondNode = '45123b96-3d55-4321-91d3-9123acb31381'
    focus.next(convertToParamMap({ pipelineNodeId: firstNode }))
    api.typeEntry.mockReturnValueOnce(first).mockReturnValueOnce(of({ ...entry, selectionId: 'second' }))
    TestBed.createComponent(XpertProjectApplicationComponent)
    await new Promise((resolve) => setTimeout(resolve, 0))
    focus.next(convertToParamMap({ pipelineNodeId: secondNode }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    first.next({ ...entry, selectionId: 'stale' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.typeEntry).toHaveBeenNthCalledWith(1, expect.anything(), {
      projectId: 'project',
      pipelineNodeId: firstNode
    })
    expect(api.typeEntry).toHaveBeenNthCalledWith(2, expect.anything(), {
      projectId: 'project',
      pipelineNodeId: secondNode
    })
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(expect.anything(), {
      queryParams: expect.objectContaining({ viewSelection: 'second' })
    })
  })
})
