import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { of } from 'rxjs'
import { AppInitService } from '../../services/app-init-service'
import { Store } from '../../services/store.service'
import { SignInSuccessComponent } from './sign-in-success.component'

describe('SignInSuccessComponent', () => {
  it('hydrates the signed-in user before returning to a protected plugin URL', async () => {
    let completeHydration: () => void
    const hydration = new Promise<void>((resolve) => {
      completeHydration = resolve
    })
    const store = {
      token: null as string | null,
      userId: null as string | null,
      refreshToken: null as string | null,
      user: null as { id: string } | null,
      restoreRememberedScope: jest.fn()
    }
    const appInitService = {
      init: jest.fn(async () => {
        await hydration
        store.user = { id: 'user-1' }
      })
    }
    const router = {
      navigateByUrl: jest.fn(() => Promise.resolve(true)),
      navigate: jest.fn(() => Promise.resolve(true))
    }
    const returnTo = '/plugins?category=marketplace#installed'

    await TestBed.configureTestingModule({
      declarations: [SignInSuccessComponent],
      providers: [
        { provide: Store, useValue: store },
        { provide: AppInitService, useValue: appInitService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({
              jwt: 'jwt-token',
              refreshToken: 'refresh-token',
              userId: 'user-1',
              returnTo
            })
          }
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(SignInSuccessComponent)
    fixture.detectChanges()
    await Promise.resolve()

    expect(store).toMatchObject({
      token: 'jwt-token',
      userId: 'user-1',
      refreshToken: 'refresh-token'
    })
    expect(store.restoreRememberedScope).toHaveBeenCalledWith('user-1')
    expect(appInitService.init).toHaveBeenCalledTimes(1)
    expect(router.navigateByUrl).not.toHaveBeenCalled()

    completeHydration!()
    await hydration
    await fixture.whenStable()

    expect(router.navigateByUrl).toHaveBeenCalledWith(returnTo)
    expect(router.navigate).not.toHaveBeenCalled()
  })
})
