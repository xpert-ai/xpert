import { HttpClient } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Store } from '@xpert-ai/cloud/state'
import { BehaviorSubject, of } from 'rxjs'
import { MembershipService } from './membership.service'

describe('MembershipService', () => {
  let organizationId: BehaviorSubject<string | null>
  let membershipFeatureEnabled: BehaviorSubject<boolean>
  let http: { get: jest.Mock; post: jest.Mock; patch: jest.Mock; delete: jest.Mock }
  let service: MembershipService

  beforeEach(() => {
    organizationId = new BehaviorSubject<string | null>(null)
    membershipFeatureEnabled = new BehaviorSubject(false)
    http = {
      get: jest.fn().mockReturnValue(of({ id: 'membership-1' })),
      post: jest.fn().mockReturnValue(of({})),
      patch: jest.fn().mockReturnValue(of({})),
      delete: jest.fn().mockReturnValue(of(undefined))
    }

    TestBed.configureTestingModule({
      providers: [
        MembershipService,
        { provide: HttpClient, useValue: http },
        {
          provide: Store,
          useValue: {
            selectOrganizationId: jest.fn(() => organizationId.asObservable()),
            selectHasFeatureEnabled: jest.fn(() => membershipFeatureEnabled.asObservable())
          }
        }
      ]
    })
    service = TestBed.inject(MembershipService)
  })

  it('reloads membership visibility when the feature or membership state changes', () => {
    const states: boolean[] = []
    const subscription = service.hasActiveMembershipInScope().subscribe((state) => states.push(state))

    expect(states).toEqual([false])
    expect(http.get).not.toHaveBeenCalled()

    membershipFeatureEnabled.next(true)
    expect(states).toEqual([false, true])
    expect(http.get).toHaveBeenCalledTimes(1)

    service.refreshMembershipState()
    expect(states).toEqual([false, true, true])
    expect(http.get).toHaveBeenCalledTimes(2)

    subscription.unsubscribe()
  })
})
