import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { of, Subject } from 'rxjs'
import { TranslateService } from '@ngx-translate/core'
import {
  IntegrationService,
  KDocumentWebTypeEnum,
  KnowledgebaseService,
  KnowledgeDocumentService,
  TKDocumentWebSchema,
  TRagWebResult
} from '@cloud/app/@core'
import { DocumentImportSourceDialogComponent, SourceDialogMode } from './source-dialog.component'

describe('DocumentImportSourceDialogComponent', () => {
  async function setup(mode: SourceDialogMode = 'url') {
    const result = { docs: [{ metadata: { chunkId: 'chunk', scrapeId: 'cached', title: 'Page' } }], duration: 1 }
    const api = {
      getWebOptions: jest.fn(() =>
        of<TKDocumentWebSchema>({ type: KDocumentWebTypeEnum.Playwright, options: [], helpUrl: '' })
      ),
      loadRagWebPages: jest.fn(() => of<TRagWebResult>(result)),
      connect: jest.fn(() => of([{ pageContent: 'Remote text', metadata: { source: '/docs/a.txt' } }]))
    }
    const ref = { close: jest.fn(), disableClose: false }
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: mode },
        { provide: DialogRef, useValue: ref },
        { provide: KnowledgeDocumentService, useValue: api },
        {
          provide: KnowledgebaseService,
          useValue: {
            getDocumentSourceStrategies: () =>
              of([{ meta: { name: 's3-files', category: 'file-system', configSchema: {} } }])
          }
        },
        { provide: IntegrationService, useValue: { getAllInOrg: () => of({ items: [] }) } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } }
      ]
    })
    TestBed.overrideComponent(DocumentImportSourceDialogComponent, { set: { template: '', imports: [] } })
    const fixture = TestBed.createComponent(DocumentImportSourceDialogComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return { fixture, component: fixture.componentInstance, api, ref }
  }

  afterEach(() => TestBed.resetTestingModule())

  it('maps quick URL imports to Playwright single-page mode', async () => {
    const { component, api, ref } = await setup()
    component.form.controls.url.setValue('https://example.com')
    component.params.set({ mode: 'crawl', maxDepth: 20 })
    await component.load()
    expect(api.loadRagWebPages).toHaveBeenCalledWith(
      'playwright',
      { url: 'https://example.com', params: { mode: 'scrape' } },
      undefined
    )
    expect(ref.close).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceType: 'web-crawl',
        pages: [expect.objectContaining({ metadata: expect.objectContaining({ scrapeId: 'cached' }) })]
      })
    ])
  })

  it('preserves advanced crawl parameters and requires selection confirmation', async () => {
    const { component, api, ref } = await setup('crawl')
    component.form.controls.url.setValue('https://example.com')
    component.params.set({ mode: 'crawl', limit: 3 })
    await component.load()
    expect(api.loadRagWebPages).toHaveBeenCalledWith(
      'playwright',
      { url: 'https://example.com', params: { mode: 'crawl', limit: 3 } },
      undefined
    )
    expect(ref.close).not.toHaveBeenCalled()
    component.toggle(0, false)
    component.confirm()
    expect(ref.close).not.toHaveBeenCalled()
    component.toggle(0, true)
    component.confirm()
    expect(ref.close).toHaveBeenCalled()
  })

  it('rejects invalid URLs before making a crawl request', async () => {
    const { component, api } = await setup()
    component.form.controls.url.setValue('file:///etc/passwd')
    await component.load()
    expect(api.loadRagWebPages).not.toHaveBeenCalled()
    expect(component.form.controls.url.touched).toBe(true)
  })

  it('uses registered remote sources and normalizes their text results', async () => {
    const { component, api } = await setup('remote')
    component.remoteConfig.set({ path: '/docs' })
    await component.load()
    expect(api.connect).toHaveBeenCalledWith('s3-files', { path: '/docs' })
    expect(component.results()[0]).toMatchObject({ sourceType: 'file-system', pages: [{ pageContent: 'Remote text' }] })
  })

  it('does not close a destroyed dialog when a late response arrives', async () => {
    const { component, fixture, api, ref } = await setup()
    const result = new Subject<TRagWebResult>()
    api.loadRagWebPages.mockReturnValue(result)
    component.form.controls.url.setValue('https://example.com')
    const pending = component.load()
    fixture.destroy()
    result.next({ docs: [{ metadata: { chunkId: 'a' } }], duration: 1 })
    await pending
    expect(ref.close).not.toHaveBeenCalled()
  })

  it('discards a result if its source URL changes during the request', async () => {
    const { component, api, ref } = await setup()
    const result = new Subject<TRagWebResult>()
    api.loadRagWebPages.mockReturnValue(result)
    component.form.controls.url.setValue('https://example.com/first')
    const pending = component.load()
    component.form.controls.url.setValue('https://example.com/second')
    result.next({ docs: [{ metadata: { chunkId: 'a' } }], duration: 1 })
    await pending
    expect(ref.close).not.toHaveBeenCalled()
    expect(component.results()).toEqual([])
  })
})
