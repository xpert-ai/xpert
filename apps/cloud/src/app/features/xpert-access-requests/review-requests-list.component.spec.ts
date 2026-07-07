import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ToastrService } from '../../@core/services/toastr.service'
import { XpertMarketplaceService } from '../../@core/services/xpert-marketplace.service'
import { IXpertAccessRequest, XpertAccessRequestStatusEnum, XpertTypeEnum } from '../../@core/types'
import { XpertAccessRequestReviewListComponent } from './review-requests-list.component'

function request(id: string): IXpertAccessRequest {
  return {
    id,
    xpertId: `xpert-${id}`,
    xpert: {
      id: `xpert-${id}`,
      name: `Assistant ${id}`,
      slug: `assistant-${id}`,
      type: XpertTypeEnum.Agent
    },
    requesterId: `user-${id}`,
    requester: {
      id: `user-${id}`,
      email: `${id}@example.com`
    },
    status: XpertAccessRequestStatusEnum.REQUESTED,
    reason: 'Need access for support work',
    createdAt: new Date('2026-07-07T00:00:00Z')
  }
}

describe('XpertAccessRequestReviewListComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  async function createFixture(requests: IXpertAccessRequest[]) {
    const service = {
      findReviewableRequests: jest.fn(() => of(requests)),
      approveRequest: jest.fn((id: string) =>
        of({
          ...request(id),
          status: XpertAccessRequestStatusEnum.APPROVED
        })
      ),
      rejectRequest: jest.fn((id: string) =>
        of({
          ...request(id),
          status: XpertAccessRequestStatusEnum.REJECTED
        })
      )
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertAccessRequestReviewListComponent],
      providers: [
        {
          provide: XpertMarketplaceService,
          useValue: service
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn()
          }
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(XpertAccessRequestReviewListComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    return { fixture, service }
  }

  it('renders the empty state when there are no reviewable requests', async () => {
    const { fixture, service } = await createFixture([])

    expect(service.findReviewableRequests).toHaveBeenCalledTimes(1)
    expect(fixture.nativeElement.textContent).toContain('PAC.XpertAccessRequests.EmptyTitle')
  })

  it('filters requests by assistant, requester, and reason', async () => {
    const { fixture } = await createFixture([
      request('support'),
      {
        ...request('finance'),
        reason: 'Budget review',
        requester: {
          id: 'finance-user',
          email: 'finance@example.com'
        }
      }
    ])

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]')
    input.value = 'budget'
    input.dispatchEvent(new Event('input'))
    await fixture.whenStable()
    await new Promise((resolve) => setTimeout(resolve, 180))
    fixture.detectChanges()

    expect(fixture.componentInstance.filteredRequests().map((item) => item.id)).toEqual(['finance'])
    expect(fixture.nativeElement.textContent).toContain('Budget review')
  })

  it('approves a request and removes it from the list', async () => {
    const { fixture, service } = await createFixture([request('request-1')])
    const changed = jest.spyOn(fixture.componentInstance.changed, 'emit')

    const approveButton = fixture.debugElement.query(By.css('[data-testid="approve-request"]'))
    approveButton.nativeElement.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(service.approveRequest).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        response: expect.any(String)
      })
    )
    expect(fixture.componentInstance.requests()).toEqual([])
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('rejects a request and removes it from the list', async () => {
    const { fixture, service } = await createFixture([request('request-2')])

    const rejectButton = fixture.debugElement.query(By.css('[data-testid="reject-request"]'))
    rejectButton.nativeElement.click()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(service.rejectRequest).toHaveBeenCalledWith(
      'request-2',
      expect.objectContaining({
        response: expect.any(String)
      })
    )
    expect(fixture.componentInstance.requests()).toEqual([])
  })
})
