import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { DataSourceService, Store } from '@xpert-ai/cloud/state'
import { DataSourceOptions } from '@xpert-ai/ocap-core'
import { ZardSheetService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, Subject } from 'rxjs'
import { I18nService } from '../../@shared/i18n'
import { ISemanticModel } from '../types'
import { PAC_SERVER_DEFAULT_OPTIONS } from '../providers'
import { ToastrService } from './toastr.service'
import { AgentService } from './agent.service'
import { PAC_SERVER_AGENT_DEFAULT_OPTIONS } from './server-agent.service'
import { ServerSocketAgent } from './server-socket-agent.service'

describe('ServerSocketAgent', () => {
  let agent: ServerSocketAgent
  let httpMock: HttpTestingController
  let connected$: BehaviorSubject<boolean>
  let disconnected$: Subject<boolean>
  let socket$: BehaviorSubject<null>

  const storeMock = {
    selectOrganizationId: jest.fn(() => new BehaviorSubject<string | null>('org-1').asObservable())
  }

  beforeEach(() => {
    connected$ = new BehaviorSubject<boolean>(true)
    disconnected$ = new Subject<boolean>()
    socket$ = new BehaviorSubject<null>(null)

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ServerSocketAgent,
        DataSourceService,
        {
          provide: Store,
          useValue: storeMock
        },
        {
          provide: AgentService,
          useValue: {
            connected$: connected$.asObservable(),
            disconnected$: disconnected$.asObservable(),
            socket$,
            connect: jest.fn(),
            emit: jest.fn(),
            on: jest.fn()
          }
        },
        {
          provide: I18nService,
          useValue: {
            currentLanguage: 'zh'
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn()
          }
        },
        {
          provide: ZardSheetService,
          useValue: {
            open: jest.fn()
          }
        },
        {
          provide: PAC_SERVER_AGENT_DEFAULT_OPTIONS,
          useValue: {
            modelBaseUrl: '/api/semantic-model'
          }
        },
        {
          provide: PAC_SERVER_DEFAULT_OPTIONS,
          useValue: {
            modelEnv: 'internal'
          }
        }
      ]
    })

    agent = TestBed.inject(ServerSocketAgent)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('posts new data source ping requests through the data-source API', async () => {
    const semanticModel: ISemanticModel & DataSourceOptions = {
      id: 'model-1',
      type: 'SQL',
      dataSource: {
        name: 'mysql-source'
      }
    }
    const body = {
      name: 'mysql-source'
    }

    const resultPromise = agent.request(semanticModel, {
      url: 'ping',
      body
    })

    const request = httpMock.expectOne('/api/data-source/ping')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toBe(body)

    request.flush({ ok: true })

    await expect(resultPromise).resolves.toEqual({ ok: true })
  })

  it('posts existing data source ping requests through the data-source API', async () => {
    const semanticModel: ISemanticModel & DataSourceOptions = {
      id: 'model-1',
      type: 'SQL',
      dataSource: {
        id: 'source-1',
        name: 'mysql-source'
      }
    }
    const body = {
      id: 'source-1',
      name: 'mysql-source'
    }

    const resultPromise = agent.request(semanticModel, {
      url: 'ping',
      body
    })

    const request = httpMock.expectOne('/api/data-source/source-1/ping')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toBe(body)

    request.flush({ ok: true })

    await expect(resultPromise).resolves.toEqual({ ok: true })
  })
})
