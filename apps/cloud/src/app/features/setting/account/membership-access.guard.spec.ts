jest.mock('../../../@core', () => ({
  MembershipService: class MembershipService {}
}))

import { TestBed } from '@angular/core/testing'
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router'
import { MembershipService } from '../../../@core'
import { firstValueFrom, Observable, of } from 'rxjs'
import { membershipPlanAccountGate } from './membership-access.guard'

describe('membershipPlanAccountGate', () => {
  const urlTree = {} as UrlTree
  const createUrlTree = jest.fn(() => urlTree)
  const hasActiveMembershipInScope = jest.fn()

  beforeEach(() => {
    createUrlTree.mockClear()
    hasActiveMembershipInScope.mockReset()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MembershipService,
          useValue: { hasActiveMembershipInScope }
        },
        {
          provide: Router,
          useValue: { createUrlTree }
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('allows account usage routes when the current user has an active membership', async () => {
    hasActiveMembershipInScope.mockReturnValue(of(true))

    const result = TestBed.runInInjectionContext(() =>
      membershipPlanAccountGate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    ) as Observable<boolean | UrlTree>

    await expect(firstValueFrom(result)).resolves.toBe(true)
    expect(createUrlTree).not.toHaveBeenCalled()
  })

  it('redirects to the profile when the current user has no active membership', async () => {
    hasActiveMembershipInScope.mockReturnValue(of(false))

    const result = TestBed.runInInjectionContext(() =>
      membershipPlanAccountGate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    ) as Observable<boolean | UrlTree>

    await expect(firstValueFrom(result)).resolves.toBe(urlTree)
    expect(createUrlTree).toHaveBeenCalledWith(['/settings/account/profile'])
  })
})
