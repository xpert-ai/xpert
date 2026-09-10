import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { of } from 'rxjs'
import { KnowledgebaseService, ToastrService } from '../../../../@core'
import knowledgebaseRoutes from './routing'

// Keep unrelated page/editor implementations out of this router activation test.
jest.mock('./configuration/configuration.component', () => ({ KnowledgeConfigurationComponent: class {} }))
jest.mock('./documents/chunk/chunk.component', () => ({ KnowledgeDocumentChunkComponent: class {} }))
jest.mock('./documents/create/create.component', () => ({ KnowledgeDocumentCreateComponent: class {} }))
jest.mock('./documents/documents.component', () => ({ KnowledgeDocumentsComponent: class {} }))
jest.mock('./knowledgebase.component', () => ({ KnowledgebaseComponent: class {} }))
jest.mock('./graph/graph.component', () => ({ KnowledgeGraphComponent: class {} }))
jest.mock('./test/test.component', () => ({ KnowledgeTestComponent: class {} }))
jest.mock('./documents/pipeline/pipeline.component', () => ({ KnowledgeDocumentPipelineComponent: class {} }))
jest.mock('./pipelines/pipelines.component', () => ({ KnowledgebasePipelinesComponent: class {} }))
jest.mock('./documents/settings/settings.component', () => ({ KnowledgeDocumentSettingsComponent: class {} }))
jest.mock('./pipeline/pipeline.component', () => ({ KnowledgebasePipelineComponent: class {} }))
jest.mock('apps/cloud/src/app/@shared/view-extension', () => ({ ExtensionHostViewPageComponent: class {} }))
jest.mock('./faq/faq.component', () => ({ KnowledgeFAQComponent: class {} }))
jest.mock('./wiki/wiki.component', () => ({ KnowledgeWikiComponent: class {} }))

const mountWiki = jest.fn()
@Component({ standalone: true, template: 'Wiki' })
class WikiStub {
  constructor() {
    mountWiki()
  }
}
@Component({ standalone: true, template: 'Documents' })
class DocumentsStub {}

describe('Wiki direct-route activation', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    mountWiki.mockClear()
  })

  async function navigate(wikiConfig?: { enabled: boolean }) {
    const wikiRoute = knowledgebaseRoutes[0].children.find((route) => route.path === 'wiki')
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'xpert/knowledges/:id',
            children: [
              { ...wikiRoute, loadComponent: undefined, component: WikiStub },
              { path: 'documents', component: DocumentsStub }
            ]
          }
        ]),
        { provide: KnowledgebaseService, useValue: { getDetail: jest.fn(() => of({ id: 'kb-1', wikiConfig })) } },
        { provide: ToastrService, useValue: { danger: jest.fn() } }
      ]
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/xpert/knowledges/kb-1/wiki?returnTo=%2Fxpert%2Fw%2Fw1')
    return TestBed.inject(Router)
  }

  it.each([undefined, { enabled: false }])('redirects legacy/disabled Wiki before mounting it (%j)', async (config) => {
    const router = await navigate(config)
    expect(router.url.split('?')[0]).toBe('/xpert/knowledges/kb-1/documents')
    expect(router.parseUrl(router.url).queryParams['returnTo']).toBe('/xpert/w/w1')
    expect(mountWiki).not.toHaveBeenCalled()
  })

  it('allows an explicitly enabled Wiki', async () => {
    const router = await navigate({ enabled: true })
    expect(router.url.split('?')[0]).toBe('/xpert/knowledges/kb-1/wiki')
    expect(mountWiki).toHaveBeenCalledTimes(1)
  })
})
