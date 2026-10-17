import { TestBed } from '@angular/core/testing'
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router'
import { firstValueFrom, isObservable, of, throwError } from 'rxjs'
import { TenantService } from '../../../../@core'
import { tenantRetentionGuard } from './retention.guard'

jest.mock('../../../../@core', () => ({ TenantService: class TenantService {} }))

describe('tenant retention route access', () => {
  const canManageRetention = jest.fn()
  const redirect = new UrlTree()
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TenantService, useValue: { canManageRetention } },
        { provide: Router, useValue: { createUrlTree: () => redirect } }
      ]
    })
  })

  async function activate() {
    const result = TestBed.runInInjectionContext(() =>
      tenantRetentionGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    )
    return isObservable(result) ? firstValueFrom(result) : result
  }

  it('allows the authorized default tenant', async () => {
    canManageRetention.mockReturnValue(of(true))
    expect(await activate()).toBe(true)
  })

  it('redirects tenants without global retention access', async () => {
    canManageRetention.mockReturnValue(of(false))
    expect(await activate()).toBe(redirect)
  })

  it('fails closed when access cannot be checked', async () => {
    canManageRetention.mockReturnValue(throwError(() => new Error('Unavailable')))
    expect(await activate()).toBe(redirect)
  })
})
