import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import { KNOWLEDGE_CHUNKING_ALGORITHM_VERSION } from '@xpert-ai/contracts'
import { KnowledgebaseService, KnowledgeChunkPreviewResult } from '../../../../@core'
import { KnowledgeChunkPreviewComponent } from './chunk-preview.component'

describe('KnowledgeChunkPreviewComponent', () => {
  function setup() {
    const service = { previewChunks: jest.fn(() => of<KnowledgeChunkPreviewResult>({ chunks: [] })) }
    TestBed.configureTestingModule({ providers: [{ provide: KnowledgebaseService, useValue: service }] })
    TestBed.overrideComponent(KnowledgeChunkPreviewComponent, { set: { template: '', imports: [] } })
    const fixture = TestBed.createComponent(KnowledgeChunkPreviewComponent)
    fixture.componentRef.setInput('workspaceId', 'workspace')
    fixture.componentRef.setInput('config', { chunkSize: 512, chunkOverlap: 0, delimiter: null, separators: [] })
    fixture.detectChanges()
    fixture.componentInstance.form.controls.text.setValue('Unsaved example')
    return { fixture, component: fixture.componentInstance, service }
  }

  afterEach(() => TestBed.resetTestingModule())

  it.each([1, KNOWLEDGE_CHUNKING_ALGORITHM_VERSION] as const)(
    'renders retrieval children, token counts and diagnostic version %s from the API metadata tree',
    async (algorithmVersion) => {
      TestBed.configureTestingModule({
        imports: [KnowledgeChunkPreviewComponent, TranslateModule.forRoot()],
        providers: [{ provide: KnowledgebaseService, useValue: {} }]
      })
      const translate = TestBed.inject(TranslateService)
      translate.setTranslation('en', {
        'XP.Knowledgebase.WorkspaceConfiguration.Implemented.PreviewTokens': '{{count}} tokens'
      })
      translate.use('en')
      const fixture = TestBed.createComponent(KnowledgeChunkPreviewComponent)
      fixture.componentRef.setInput('workspaceId', 'workspace')
      fixture.componentRef.setInput('config', { chunkSize: 512, chunkOverlap: 0, delimiter: null, maxChunkTokens: 16 })
      fixture.detectChanges()
      fixture.componentInstance.result.set({
        decisions: [
          {
            inputHash: 'source-hash',
            sourceIndexes: [0],
            requestedStrategy: 'auto',
            resolvedStrategy: 'structure-aware',
            reason: 'structured-blocks',
            algorithmVersion,
            blockCounts: { table: 1 },
            warnings: ['structure-split']
          }
        ],
        chunks: [
          {
            pageContent: 'parent context',
            metadata: {
              chunkId: 'parent',
              children: [
                {
                  pageContent: 'retrieval child text',
                  metadata: { chunkId: 'child', parentId: 'parent', tokens: 8 }
                }
              ]
            }
          },
          {
            pageContent: 'table continuation',
            metadata: {
              chunkId: 'structure',
              chunking: {
                inputHash: 'source-hash',
                requestedStrategy: 'auto',
                resolvedStrategy: 'structure-aware',
                reason: 'structured-blocks',
                algorithmVersion,
                headingPath: ['# Inventory'],
                sourceRanges: [],
                warnings: ['structure-split'],
                continued: true
              }
            }
          }
        ]
      })
      fixture.detectChanges()
      await fixture.whenStable()
      const root: HTMLElement = fixture.nativeElement
      expect(root.textContent).toContain('retrieval child text')
      expect(root.textContent).toContain('8 tokens')
      expect(root.textContent).toContain('# Inventory')
      expect(root.textContent).toContain('Chunking.Continuation')
      expect(fixture.componentInstance.result().decisions[0].algorithmVersion).toBe(algorithmVersion)
      expect(fixture.componentInstance.result().chunks[1].metadata.chunking.algorithmVersion).toBe(algorithmVersion)
      expect(root.querySelector('[data-chunking-decision]').textContent).toContain('RequestedStrategy')
      expect(root.querySelector('[data-chunking-decision]').textContent).toContain('AppliedStrategy')
      expect(root.querySelector('[data-chunking-decision]').textContent).toContain('Reasons.structured-blocks')
      expect(root.querySelector('[data-chunking-decision]').textContent).toContain('Warnings.structure-split')
    }
  )

  it('blocks invalid settings and includes the current token cap in the next valid preview', async () => {
    const { fixture, component, service } = setup()
    fixture.componentRef.setInput('configInvalid', true)
    fixture.detectChanges()
    await component.preview()
    expect(service.previewChunks).not.toHaveBeenCalled()
    fixture.componentRef.setInput('configInvalid', false)
    fixture.componentRef.setInput('config', { ...component.config(), maxChunkTokens: 64 })
    fixture.detectChanges()
    await component.preview()
    expect(service.previewChunks).toHaveBeenCalledWith(
      'workspace',
      expect.objectContaining({
        parserConfig: expect.objectContaining({ maxChunkTokens: 64 })
      })
    )
  })

  it('sends the current unsaved configuration to the read-only preview endpoint', async () => {
    const { component, service } = setup()
    await component.preview()
    expect(service.previewChunks).toHaveBeenCalledWith('workspace', {
      text: 'Unsaved example',
      type: 'txt',
      parserConfig: { chunkSize: 512, chunkOverlap: 0, delimiter: null, separators: [] }
    })
    expect(component.loading()).toBe(false)
    expect(component.result()).toEqual({ chunks: [] })
  })

  it('shows errors and clears loading after a failed preview', async () => {
    const { component, service } = setup()
    service.previewChunks.mockReturnValue(throwError(() => new Error('Splitter unavailable')))
    await component.preview()
    expect(component.error()).toContain('Splitter unavailable')
    expect(component.loading()).toBe(false)
    expect(component.result()).toBeNull()
  })

  it('discards a response if the sample changes while splitting', async () => {
    const { component, service } = setup()
    const pending = new Subject<KnowledgeChunkPreviewResult>()
    service.previewChunks.mockReturnValue(pending)
    const request = component.preview()
    expect(component.loading()).toBe(true)
    component.form.controls.text.setValue('Changed sample')
    pending.next({ chunks: [] })
    await request
    expect(component.result()).toBeNull()
  })

  it('clears stale results and previews the changed unsaved chunk settings', async () => {
    const { fixture, component, service } = setup()
    await component.preview()
    expect(component.result()).not.toBeNull()
    const config = { chunkSize: 1000, chunkOverlap: 80, delimiter: null, separators: ['!'] }
    fixture.componentRef.setInput('config', config)
    fixture.detectChanges()
    expect(component.result()).toBeNull()
    await component.preview()
    expect(service.previewChunks).toHaveBeenLastCalledWith('workspace', {
      text: 'Unsaved example',
      type: 'txt',
      parserConfig: config
    })
  })
})
