import { TestBed } from '@angular/core/testing'
import { of, Subject, throwError } from 'rxjs'
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
