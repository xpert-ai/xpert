import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { Store } from '@cloud/app/@core/state'
import { NGXLogger } from 'ngx-logger'
import { of } from 'rxjs'
import { XpertTaskService } from './xpert-task.service'

describe('XpertTaskService run-as transfer', () => {
  let service: XpertTaskService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        XpertTaskService,
        { provide: Store, useValue: { selectOrganizationId: jest.fn(() => of('org-1')) } },
        { provide: NGXLogger, useValue: { debug: jest.fn() } }
      ]
    })
    service = TestBed.inject(XpertTaskService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => httpMock.verify())

  it('proposes a Project task run-as transfer through the dedicated endpoint', () => {
    service.proposeRunAs('task-1', 'user-2').subscribe()

    const request = httpMock.expectOne('/api/xpert-task/task-1/run-as/proposal')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual({ runAsUserId: 'user-2' })
    request.flush({ id: 'task-1', pendingRunAsUserId: 'user-2' })
  })

  it('accepts a pending run-as transfer through the dedicated endpoint', () => {
    service.acceptRunAs('task-1').subscribe()

    const request = httpMock.expectOne('/api/xpert-task/task-1/run-as/accept')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual({})
    request.flush({ id: 'task-1', runAsUserId: 'user-2' })
  })
})
