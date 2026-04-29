import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { Subject, of } from 'rxjs'
import { FeatureService, RequestScopeLevel, Store, ToastrService } from '../../../@core'
import { PACFeaturesComponent } from './features.component'

class MockStore {
  readonly activeScope = { level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' }

  selectActiveScope() {
    return of(this.activeScope)
  }
}

describe('PACFeaturesComponent', () => {
  it('reloads the active feature toggle child after feature definitions are upgraded', () => {
    const routerEvents = new Subject()
    const featureService = {
      upgrade: jest.fn(() => of({}))
    }
    const toastr = {
      success: jest.fn(),
      error: jest.fn()
    }
    const child = {
      reloadFeatures: jest.fn()
    }

    TestBed.configureTestingModule({
      providers: [
        {
          provide: FeatureService,
          useValue: featureService
        },
        {
          provide: Store,
          useClass: MockStore
        },
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable(),
            navigate: jest.fn()
          }
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              firstChild: {
                routeConfig: {
                  path: 'organization'
                }
              }
            }
          }
        },
        {
          provide: ToastrService,
          useValue: toastr
        }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new PACFeaturesComponent())

    component.onChildActivate(child)
    component.upgrade()

    expect(featureService.upgrade).toHaveBeenCalled()
    expect(child.reloadFeatures).toHaveBeenCalled()
    expect(toastr.success).toHaveBeenCalled()
  })
})
