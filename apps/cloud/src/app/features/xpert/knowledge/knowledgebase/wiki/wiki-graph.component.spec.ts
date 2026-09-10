import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import type { KnowledgeWikiGraph, KnowledgeWikiGraphNode, KnowledgeWikiPageDetail } from '@xpert-ai/contracts'
import cytoscape from 'cytoscape'
import { of, Subject } from 'rxjs'
import { KnowledgeWikiService } from '../../../../../@core'
import { WikiGraphComponent } from './wiki-graph.component'

jest.mock('@milkdown/crepe', () => ({ Crepe: jest.fn() }))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn() }))
jest.mock('cytoscape', () => jest.fn(() => mockCy))

const mockEdgeStyle = jest.fn()
const mockCy = {
  on: jest.fn(),
  destroy: jest.fn(),
  resize: jest.fn(),
  fit: jest.fn(),
  animate: jest.fn(),
  elements: jest.fn(() => ({ unselect: jest.fn() })),
  getElementById: jest.fn(() => ({ select: jest.fn() })),
  edges: jest.fn(() => ({ style: mockEdgeStyle }))
}

function node(id: string): KnowledgeWikiGraphNode {
  return {
    id,
    pageKey: `concept:${id}`,
    pageType: 'concept',
    canonicalName: id,
    title: id,
    slug: id,
    summary: 'Page summary',
    status: 'ready',
    projectionStatus: 'ready',
    sourceCount: 1,
    updatedAt: ''
  }
}
const graph: KnowledgeWikiGraph = {
  nodes: [node('A'), node('B')],
  edges: [{ id: 'A-B', source: 'A', target: 'B' }],
  truncated: false
}
function detail(id: string): KnowledgeWikiPageDetail {
  return { ...node(id), markdown: '', revision: 1, aliases: [], links: [], backlinks: [], evidence: [] }
}

describe('Wiki graph canvas', () => {
  let fixture: ComponentFixture<WikiGraphComponent>
  const service = {
    getGraph: jest.fn(() => of(graph)),
    getPage: jest.fn((_kb: string, id: string) => of(detail(id)))
  }
  beforeEach(async () => {
    jest.clearAllMocks()
    service.getGraph.mockReturnValue(of(graph))
    await TestBed.configureTestingModule({
      imports: [WikiGraphComponent, TranslateModule.forRoot()],
      providers: [provideNoopAnimations(), { provide: KnowledgeWikiService, useValue: service }]
    }).compileComponents()
    fixture = TestBed.createComponent(WikiGraphComponent)
    fixture.componentRef.setInput('id', 'kb')
  })
  afterEach(() => {
    fixture.destroy()
    jest.restoreAllMocks()
    TestBed.resetTestingModule()
  })
  async function render() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture.componentInstance
  }

  it('shows searchable page options and opens details only for a selected node', async () => {
    const component = await render()
    const root: HTMLElement = fixture.nativeElement
    expect(root.querySelector('[aria-label="XP.Knowledgebase.Wiki.Organization.PageDetails"]')).toBeNull()
    expect(component.pageOptions()).toEqual([
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' }
    ])
    await component.select('A')
    fixture.detectChanges()
    const panel = root.querySelector('[aria-label="XP.Knowledgebase.Wiki.Organization.PageDetails"]')
    expect(panel?.textContent).toContain('Page summary')
    const opened = jest.fn()
    component.openPage.subscribe(opened)
    Array.from(panel.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Organization.OpenPage'))
      .click()
    expect(opened).toHaveBeenCalledWith('A')
    root.querySelector<HTMLButtonElement>('[aria-label="XP.Knowledgebase.Wiki.Organization.CloseDetails"]').click()
    fixture.detectChanges()
    expect(component.selected()).toBeUndefined()
    expect(root.querySelector('[aria-label="XP.Knowledgebase.Wiki.Organization.PageDetails"]')).toBeNull()
  })

  it('does not reopen closed details when an earlier page request finishes', async () => {
    const component = await render()
    const delayed = new Subject<KnowledgeWikiPageDetail>()
    service.getPage.mockReturnValueOnce(delayed)
    const pending = component.select('A')
    component.clearSelection()
    delayed.next(detail('A'))
    await pending
    expect(component.selectedId()).toBeNull()
    expect(component.detail()).toBeNull()
    expect(component.detailLoading()).toBe(false)
  })

  it('uses the selected graph node as the neighborhood center and can return to overview', async () => {
    fixture.componentRef.setInput('focusPageId', 'old-reading-page')
    const component = await render()
    await component.select('B')
    component.showNeighborhood()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(service.getGraph).toHaveBeenLastCalledWith('kb', expect.objectContaining({ focusPageId: 'B', depth: 1 }))
    component.neighborhoodPageId.set(null)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(service.getGraph).toHaveBeenLastCalledWith('kb', expect.objectContaining({ focusPageId: undefined }))
  })

  it('includes index nodes when filtering by index and clears that filter when indexes are hidden', async () => {
    const component = await render()
    component.filterType('index')
    fixture.detectChanges()
    await fixture.whenStable()
    expect(service.getGraph).toHaveBeenLastCalledWith(
      'kb',
      expect.objectContaining({ pageType: 'index', includeIndex: true })
    )
    component.toggleIndexes()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(service.getGraph).toHaveBeenLastCalledWith(
      'kb',
      expect.objectContaining({ pageType: undefined, includeIndex: false })
    )
  })

  it('waits for a visible canvas, restores it after a tab switch, and changes arrows without fetching again', async () => {
    let notifyResize: (() => void) | undefined
    const observer = { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() }
    jest.spyOn(globalThis, 'ResizeObserver').mockImplementation((callback) => {
      notifyResize = () => callback([], observer)
      return observer
    })
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const rect = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, 0))
    const component = await render()
    expect(cytoscape).not.toHaveBeenCalled()
    rect.mockReturnValue(new DOMRect(0, 0, 960, 640))
    notifyResize?.()
    expect(cytoscape).toHaveBeenCalledTimes(1)
    const options = jest.mocked(cytoscape).mock.calls[0][0]
    expect(options.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ data: expect.objectContaining({ id: 'A', pageType: 'concept' }) })
      ])
    )
    component.showArrows.set(false)
    fixture.detectChanges()
    expect(mockEdgeStyle).toHaveBeenLastCalledWith('target-arrow-shape', 'none')
    fixture.componentRef.setInput('active', false)
    fixture.detectChanges()
    expect(mockCy.destroy).toHaveBeenCalled()
    fixture.componentRef.setInput('active', true)
    fixture.detectChanges()
    expect(cytoscape).toHaveBeenCalledTimes(2)
    expect(service.getGraph).toHaveBeenCalledTimes(1)
  })

  it('ignores graph responses from a previous knowledgebase', async () => {
    const component = await render()
    const delayed = new Subject<KnowledgeWikiGraph>()
    service.getGraph.mockReturnValueOnce(delayed)
    const pending = component.refresh()
    fixture.componentRef.setInput('id', 'other-kb')
    fixture.detectChanges()
    await fixture.whenStable()
    delayed.next({ nodes: [node('obsolete')], edges: [], truncated: false })
    await pending
    expect(component.graph()).toEqual(graph)
    expect(service.getGraph).toHaveBeenLastCalledWith('other-kb', expect.anything())
  })

  it('clears the neighborhood center when switching knowledgebases', async () => {
    const component = await render()
    await component.select('B')
    component.showNeighborhood()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.componentRef.setInput('id', 'other-kb')
    fixture.detectChanges()
    await fixture.whenStable()
    expect(service.getGraph).toHaveBeenLastCalledWith('other-kb', expect.objectContaining({ focusPageId: undefined }))
  })

  it('does not fetch while inactive, even when the knowledgebase or filters change', async () => {
    fixture.componentRef.setInput('active', false)
    const component = await render()
    fixture.componentRef.setInput('id', 'other-kb')
    component.filterType('concept')
    await render()
    await component.refresh()
    expect(service.getGraph).not.toHaveBeenCalled()
    fixture.componentRef.setInput('active', true)
    await render()
    expect(service.getGraph).toHaveBeenCalledTimes(1)
    expect(service.getGraph).toHaveBeenLastCalledWith('other-kb', expect.objectContaining({ pageType: 'concept' }))
  })

  it('cancels pending graph and detail requests when leaving the graph', async () => {
    const component = await render()
    const delayedDetail = new Subject<KnowledgeWikiPageDetail>()
    service.getPage.mockReturnValueOnce(delayedDetail)
    const detailRequest = component.select('A')
    expect(delayedDetail.observed).toBe(true)
    fixture.componentRef.setInput('active', false)
    await render()
    await detailRequest
    expect(delayedDetail.observed).toBe(false)
    expect(component.selectedId()).toBeNull()

    fixture.componentRef.setInput('active', true)
    await render()
    const delayedGraph = new Subject<KnowledgeWikiGraph>()
    service.getGraph.mockReturnValueOnce(delayedGraph)
    const graphRequest = component.refresh()
    expect(delayedGraph.observed).toBe(true)
    fixture.componentRef.setInput('active', false)
    await render()
    await graphRequest
    expect(delayedGraph.observed).toBe(false)
    delayedGraph.next(graph)
    expect(component.graph()).toBeNull()
    expect(component.loading()).toBe(false)
    fixture.componentRef.setInput('active', true)
    await render()
    expect(component.graph()).toEqual(graph)
  })

  it('unsubscribes a graph request when the component is destroyed', async () => {
    const delayed = new Subject<KnowledgeWikiGraph>()
    service.getGraph.mockReturnValueOnce(delayed)
    await render()
    expect(delayed.observed).toBe(true)
    fixture.destroy()
    expect(delayed.observed).toBe(false)
  })
})
