import { TestBed } from '@angular/core/testing'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { of } from 'rxjs'
import { FeatureService, Store, ToastrService } from '../../../@core/services'
import { PACFeaturesComponent } from './features.component'

class MockStore {
  readonly activeScope: { level: RequestScopeLevel; organizationId?: string }

  constructor(level: RequestScopeLevel = RequestScopeLevel.ORGANIZATION) {
    this.activeScope = level === RequestScopeLevel.TENANT ? { level } : { level, organizationId: 'org-1' }
  }

  selectActiveScope() {
    return of(this.activeScope)
  }
}

describe('PACFeaturesComponent', () => {
  it('publishes the feature definition refresh event after feature definitions are upgraded', () => {
    const featureService = {
      upgrade: jest.fn(() => of({})),
      notifyFeatureDefinitionsRefreshed: jest.fn()
    }
    const toastr = {
      success: jest.fn(),
      error: jest.fn()
    }

    TestBed.configureTestingModule({
      providers: [
        {
          provide: FeatureService,
          useValue: featureService
        },
        {
          provide: Store,
          useValue: new MockStore(RequestScopeLevel.TENANT)
        },
        {
          provide: ToastrService,
          useValue: toastr
        }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new PACFeaturesComponent())

    component.upgrade()

    expect(featureService.upgrade).toHaveBeenCalled()
    expect(featureService.notifyFeatureDefinitionsRefreshed).toHaveBeenCalled()
    expect(toastr.success).toHaveBeenCalled()
  })

  it('does not upgrade feature definitions in organization scope', () => {
    const featureService = {
      upgrade: jest.fn(() => of({})),
      notifyFeatureDefinitionsRefreshed: jest.fn()
    }
    const toastr = {
      success: jest.fn(),
      error: jest.fn()
    }

    TestBed.configureTestingModule({
      providers: [
        {
          provide: FeatureService,
          useValue: featureService
        },
        {
          provide: Store,
          useValue: new MockStore(RequestScopeLevel.ORGANIZATION)
        },
        {
          provide: ToastrService,
          useValue: toastr
        }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new PACFeaturesComponent())

    expect(component.canUpgrade()).toBe(false)

    component.upgrade()

    expect(featureService.upgrade).not.toHaveBeenCalled()
    expect(featureService.notifyFeatureDefinitionsRefreshed).not.toHaveBeenCalled()
  })
})
