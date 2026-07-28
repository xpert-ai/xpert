jest.mock('../../../@core', () => ({
  MembershipService: class MembershipService {},
  Store: class Store {}
}))
jest.mock('../../feature-gate', () => ({
  hydrateFeatureContext: jest.fn(() => jest.requireActual('rxjs').of(true))
}))

import { TestBed } from '@angular/core/testing'
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router'
import { MembershipService, Store } from '../../../@core'
import { firstValueFrom, Observable, of } from 'rxjs'
import {
  membershipPlanAccountGate,
  modelAccessAccountGate,
  modelGatewayAccountGate
} from './membership-access.guard'

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

describe('modelAccessAccountGate', () => {
  const urlTree = {} as UrlTree
  const createUrlTree = jest.fn(() => urlTree)
  const user$ = of({ type: 'user' })

  beforeEach(() => {
    createUrlTree.mockClear()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Store,
          useValue: { user$ }
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

  it('allows regular users to open available models', async () => {
    const result = TestBed.runInInjectionContext(() =>
      modelAccessAccountGate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    ) as Observable<boolean | UrlTree>

    await expect(firstValueFrom(result)).resolves.toBe(true)
  })

  it('redirects technical users away from available models', async () => {
    TestBed.overrideProvider(Store, {
      useValue: { user$: of({ type: 'communication' }) }
    })

    const result = TestBed.runInInjectionContext(() =>
      modelAccessAccountGate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    ) as Observable<boolean | UrlTree>

    await expect(firstValueFrom(result)).resolves.toBe(urlTree)
    expect(createUrlTree).toHaveBeenCalledWith(['/settings/account/profile'])
  })
})

describe('modelGatewayAccountGate', () => {
  const urlTree = {} as UrlTree
  const createUrlTree = jest.fn(() => urlTree)
  const store = {
    user: { type: 'user' },
    hasFeatureEnabled: jest.fn(),
    hasPermission: jest.fn()
  }

  beforeEach(() => {
    createUrlTree.mockClear()
    store.hasFeatureEnabled.mockReset()
    store.hasPermission.mockReset()
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: store },
        { provide: Router, useValue: { createUrlTree } }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('requires both the tenant feature and role permission', async () => {
    store.hasFeatureEnabled.mockReturnValue(true)
    store.hasPermission.mockReturnValue(true)

    const allowed = TestBed.runInInjectionContext(() =>
      modelGatewayAccountGate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    ) as Observable<boolean | UrlTree>
    await expect(firstValueFrom(allowed)).resolves.toBe(true)

    store.hasPermission.mockReturnValue(false)
    const denied = TestBed.runInInjectionContext(() =>
      modelGatewayAccountGate({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    ) as Observable<boolean | UrlTree>
    await expect(firstValueFrom(denied)).resolves.toBe(urlTree)
  })
})
