import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { IKnowledgebase, IKnowledgeDocument, KnowledgeGraphDocumentProgress } from '@xpert-ai/contracts'
import { Subject } from 'rxjs'
import { KnowledgebaseService } from '../../../../../@core/services/knowledgebase.service'
import { DocumentGraphProgressComponent } from './document-graph-progress.component'

describe('Graph document inspector', () => {
  let fixture: ComponentFixture<DocumentGraphProgressComponent>
  let response: Subject<KnowledgeGraphDocumentProgress>
  const api = { getGraphDocumentProgress: jest.fn() }
  const kb = { id: 'kb', graphRag: { enabled: true } } as IKnowledgebase
  const doc = { id: 'doc', version: 1 } as IKnowledgeDocument
  const indexed: KnowledgeGraphDocumentProgress = {
    documentId: 'doc',
    state: 'ready',
    stages: { extraction: 'complete', persistence: 'complete', indexing: 'complete' }
  }
  beforeEach(async () => {
    response = new Subject()
    api.getGraphDocumentProgress.mockReturnValue(response)
    await TestBed.configureTestingModule({
      imports: [DocumentGraphProgressComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: KnowledgebaseService, useValue: api }]
    }).compileComponents()
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('zh-Hans', {
      XP: {
        Knowledgebase: {
          GraphDocumentProgress: {
            States: { disabled: '图谱不可用' },
            Hints: { disabled: '当前知识库未开启图谱。' }
          }
        }
      }
    })
    translate.use('zh-Hans')
  })
  function setup() {
    jest.useFakeTimers()
    fixture = TestBed.createComponent(DocumentGraphProgressComponent)
    fixture.componentRef.setInput('knowledgebase', kb)
    fixture.componentRef.setInput('document', doc)
  }
  afterEach(() => {
    fixture.destroy()
    api.getGraphDocumentProgress.mockReset()
    jest.useRealTimers()
  })
  const root = () => fixture.nativeElement as HTMLElement
  function refresh() {
    fixture.detectChanges()
    TestBed.flushEffects()
    jest.advanceTimersByTime(0)
    fixture.detectChanges()
  }
  function emit(progress: KnowledgeGraphDocumentProgress) {
    response.next(progress)
    fixture.detectChanges()
  }

  it('keeps the unavailable section visible when Graph is off and makes no request', () => {
    setup()
    fixture.componentRef.setInput('knowledgebase', { ...kb, graphRag: { enabled: false } })
    refresh()
    expect(root().textContent).toContain('图谱不可用')
    expect(root().textContent).toContain('当前知识库未开启图谱')
    expect(root().querySelectorAll('[data-graph-stage]')).toHaveLength(0)
    expect(api.getGraphDocumentProgress).not.toHaveBeenCalled()
    fixture.destroy()
  })

  it('loads the selected document directly and keeps indexing running at 100% extracted chunks', () => {
    setup()
    refresh()
    expect(api.getGraphDocumentProgress).toHaveBeenCalledWith('kb', 'doc')
    emit({
      ...indexed,
      state: 'running',
      processedChunks: 8,
      totalChunks: 8,
      stages: { extraction: 'complete', persistence: 'complete', indexing: 'running' }
    })
    expect([...root().querySelectorAll('[data-graph-stage]')].map((node) => node.getAttribute('data-state'))).toEqual([
      'complete',
      'complete',
      'running'
    ])
    expect(root().querySelector('a')).toBeNull()
    fixture.destroy()
  })

  it('displays the failed stage and backend error without a success link', () => {
    setup()
    refresh()
    emit({
      ...indexed,
      state: 'failed',
      error: 'vector store unavailable',
      stages: { extraction: 'complete', persistence: 'complete', indexing: 'failed' }
    })
    expect(root().querySelector('[role=alert]').textContent).toContain('vector store unavailable')
    expect(root().querySelector('[data-graph-stage=indexing]').getAttribute('data-state')).toBe('failed')
    expect(root().querySelector('a')).toBeNull()
    fixture.destroy()
  })

  it('only offers the graph route for a confirmed indexed result', () => {
    setup()
    refresh()
    emit(indexed)
    expect(root().querySelector('a').getAttribute('href')).toBe('/xpert/knowledges/kb/graph')
    fixture.destroy()
  })

  it('does not invent steps for historical completed tasks', () => {
    setup()
    refresh()
    emit({ documentId: 'doc', state: 'completed' })
    expect(root().querySelectorAll('[data-graph-stage]')).toHaveLength(0)
    expect(root().querySelector('a')).toBeNull()
    fixture.destroy()
  })

  it('distinguishes a fetch error from disabled Graph and retries polling', () => {
    setup()
    refresh()
    response.error(new Error('offline'))
    fixture.detectChanges()
    expect(fixture.componentInstance.state()).toBe('unknown')
    response = new Subject()
    api.getGraphDocumentProgress.mockReturnValue(response)
    jest.advanceTimersByTime(5000)
    emit(indexed)
    expect(fixture.componentInstance.state()).toBe('ready')
    fixture.destroy()
  })

  it('cancels the previous request and rejects late results when switching documents', () => {
    setup()
    refresh()
    const previous = response
    response = new Subject()
    api.getGraphDocumentProgress.mockReturnValue(response)
    fixture.componentRef.setInput('document', { ...doc, id: 'other' })
    refresh()
    expect(previous.observed).toBe(false)
    previous.next(indexed)
    expect(fixture.componentInstance.state()).toBe('loading')
    emit({ ...indexed, documentId: 'other' })
    expect(fixture.componentInstance.state()).toBe('ready')
    fixture.destroy()
  })

  it('immediately replaces a ready result with unavailable when Graph is turned off', () => {
    setup()
    refresh()
    emit(indexed)
    fixture.componentRef.setInput('knowledgebase', { ...kb, graphRag: { enabled: false } })
    refresh()
    expect(fixture.componentInstance.state()).toBe('disabled')
    expect(root().querySelector('a')).toBeNull()
    jest.advanceTimersByTime(10000)
    expect(api.getGraphDocumentProgress).toHaveBeenCalledTimes(1)
    fixture.destroy()
  })
})
