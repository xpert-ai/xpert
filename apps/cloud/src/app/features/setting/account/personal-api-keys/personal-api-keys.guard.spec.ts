jest.mock('../../../../@core', () => ({ Store: class Store {} }))

import { TestBed } from '@angular/core/testing'
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router'
import { UserType } from '@xpert-ai/contracts'
import { firstValueFrom, isObservable, of } from 'rxjs'
import { Store } from '../../../../@core'
import { personalApiKeysAccountGate } from './personal-api-keys.guard'

describe('personal API keys route', () => {
  it.each([UserType.USER, UserType.COMMUNICATION, undefined])(
    'limits management to human accounts: %s',
    async (type) => {
      const router = { createUrlTree: jest.fn(() => 'profile') }
      TestBed.configureTestingModule({
        providers: [
          { provide: Store, useValue: { user$: of({ type }) } },
          { provide: Router, useValue: router }
        ]
      })
      const result = TestBed.runInInjectionContext(() =>
        personalApiKeysAccountGate(new ActivatedRouteSnapshot(), {} as RouterStateSnapshot)
      )
      if (!isObservable(result)) throw new Error('Expected observable guard')
      expect(await firstValueFrom(result)).toBe(type === UserType.USER ? true : 'profile')
      TestBed.resetTestingModule()
    }
  )
})
