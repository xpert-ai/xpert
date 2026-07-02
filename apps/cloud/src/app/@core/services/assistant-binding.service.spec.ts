import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { AssistantBindingScope, AssistantCode, IAssistantBinding } from '../types'
import { AssistantBindingService } from './assistant-binding.service'

describe('AssistantBindingService', () => {
  let httpMock: HttpTestingController
  let service: AssistantBindingService

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    })

    httpMock = TestBed.inject(HttpTestingController)
    service = TestBed.inject(AssistantBindingService)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('emits a binding change after an upsert succeeds', () => {
    const events: Array<{ code: AssistantCode; scope: AssistantBindingScope }> = []
    const subscription = service.changes$.subscribe((event) => events.push(event))

    service
      .upsert({
        code: AssistantCode.CLAWXPERT,
        scope: AssistantBindingScope.USER,
        assistantId: 'xpert-1'
      })
      .subscribe()

    const request = httpMock.expectOne((item) => item.method === 'POST' && item.url.endsWith('/assistant-binding'))
    request.flush({
      code: AssistantCode.CLAWXPERT,
      scope: AssistantBindingScope.USER,
      assistantId: 'xpert-1'
    } satisfies Partial<IAssistantBinding>)

    expect(events).toEqual([
      {
        code: AssistantCode.CLAWXPERT,
        scope: AssistantBindingScope.USER
      }
    ])

    subscription.unsubscribe()
  })
})
