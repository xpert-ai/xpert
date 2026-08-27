import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { Store } from '@cloud/app/@core/state'
import { NGXLogger } from 'ngx-logger'
import { of } from 'rxjs'
import { KnowledgebaseService } from './knowledgebase.service'

describe('KnowledgebaseService', () => {
  let service: KnowledgebaseService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        KnowledgebaseService,
        {
          provide: Store,
          useValue: {
            selectOrganizationId: jest.fn(() => of('org-1'))
          }
        },
        {
          provide: NGXLogger,
          useValue: {
            debug: jest.fn()
          }
        }
      ]
    })

    service = TestBed.inject(KnowledgebaseService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('loads knowledgebase detail from the backend-owned detail endpoint', () => {
    service.getDetail('kb-1').subscribe()

    const request = httpMock.expectOne((item) => item.method === 'GET' && item.url === '/api/knowledgebase/detail/kb-1')

    expect(request.request.params.keys()).toEqual([])

    request.flush({
      id: 'kb-1',
      name: 'Knowledgebase'
    })
  })

  it('loads only knowledgebases owned by the requested workspace', () => {
    let itemIds: string[] = []
    service
      .getAllByWorkspaceOnly('workspace-1', { relations: ['createdBy'] })
      .subscribe(({ items }) => (itemIds = items.map(({ id }) => id)))

    const request = httpMock.expectOne(
      (item) => item.method === 'GET' && item.url === '/api/knowledgebase/by-workspace/workspace-1'
    )

    expect(request.request.params.has('scope')).toBe(false)
    expect(request.request.params.get('data')).toBe(
      JSON.stringify({
        relations: ['createdBy']
      })
    )

    request.flush({
      items: [
        { id: 'kb-owned', workspaceId: 'workspace-1' },
        { id: 'kb-shared', workspaceId: 'workspace-2' }
      ],
      total: 2
    })

    expect(itemIds).toEqual(['kb-owned'])
  })
})
