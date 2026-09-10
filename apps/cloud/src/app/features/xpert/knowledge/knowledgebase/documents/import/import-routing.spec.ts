import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router, RouterOutlet } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import knowledgebaseRoutes from '../../routing'

jest.mock('../../configuration/configuration.component', () => ({ KnowledgeConfigurationComponent: class {} }))
jest.mock('../chunk/chunk.component', () => ({ KnowledgeDocumentChunkComponent: class {} }))
jest.mock('../documents.component', () => ({ KnowledgeDocumentsComponent: class {} }))
jest.mock('../../knowledgebase.component', () => ({ KnowledgebaseComponent: class {} }))
jest.mock('../../test/test.component', () => ({ KnowledgeTestComponent: class {} }))
jest.mock('../../pipelines/pipelines.component', () => ({ KnowledgebasePipelinesComponent: class {} }))
jest.mock('../settings/settings.component', () => ({ KnowledgeDocumentSettingsComponent: class {} }))
jest.mock('../../pipeline/pipeline.component', () => ({ KnowledgebasePipelineComponent: class {} }))
jest.mock('apps/cloud/src/app/@shared/view-extension', () => ({ ExtensionHostViewPageComponent: class {} }))
jest.mock('../../faq/faq.component', () => ({ KnowledgeFAQComponent: class {} }))

@Component({ standalone: true, imports: [RouterOutlet], template: '<router-outlet />' })
class DocumentsStub {}

@Component({ standalone: true, template: 'Document' })
class DocumentStub {}

describe('Legacy document import links', () => {
  afterEach(() => TestBed.resetTestingModule())

  async function navigate(path: string) {
    const documentsRoute = knowledgebaseRoutes[0].children.find((route) => route.path === 'documents')
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'xpert/knowledges/:id',
            children: [
              {
                ...documentsRoute,
                component: DocumentsStub,
                children: documentsRoute.children.map((route) =>
                  route.redirectTo !== undefined ? route : { ...route, component: DocumentStub }
                )
              }
            ]
          }
        ])
      ]
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl(`/xpert/knowledges/kb/documents/${path}?parentId=folder`)
    return TestBed.inject(Router)
  }

  it.each(['create', 'create-from-pipeline'])(
    'returns %s to the list and keeps the destination folder',
    async (path) => {
      const router = await navigate(path)
      expect(router.url.split('?')[0]).toBe('/xpert/knowledges/kb/documents')
      expect(router.parseUrl(router.url).queryParams['parentId']).toBe('folder')
    }
  )

  it.each(['document-id', 'document-id/settings'])('keeps the existing %s route accessible', async (path) => {
    const router = await navigate(path)
    expect(router.url.split('?')[0]).toBe(`/xpert/knowledges/kb/documents/${path}`)
  })
})
