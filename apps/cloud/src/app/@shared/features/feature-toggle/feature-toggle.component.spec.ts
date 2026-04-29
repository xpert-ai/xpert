import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { AiFeatureEnum, FeatureEnum, IFeature, IFeatureOrganization, LanguagesEnum, RequestScopeLevel } from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { FeatureService, Store } from '../../../@core/services'
import { FeatureToggleComponent } from './feature-toggle.component'

const childFeature: IFeature = {
  id: 'feature-child',
  code: FeatureEnum.FEATURE_COPILOT,
  name: 'Copilot',
  description: 'Copilot feature'
}

const parentFeature: IFeature = {
  id: 'feature-parent',
  code: FeatureEnum.FEATURE_XPERT,
  name: 'Xpert',
  description: 'Xpert feature',
  children: [childFeature]
}

const tenantFeatureOrganization: IFeatureOrganization = {
  id: 'tenant-feature',
  featureId: parentFeature.id,
  feature: parentFeature,
  isEnabled: true
}

const childTenantFeatureOrganization: IFeatureOrganization = {
  id: 'tenant-feature-child',
  featureId: childFeature.id,
  feature: childFeature,
  isEnabled: true
}

class MockFeatureService {
  parentFeaturesRequestCount = 0

  getParentFeatures() {
    this.parentFeaturesRequestCount += 1
    return of({ items: [parentFeature], total: 1 })
  }

  getFeatureOrganizations() {
    return of({ items: [], total: 0 })
  }
}

class MockStore {
  readonly selectedOrganization$ = new BehaviorSubject({ id: 'org-1', name: 'Org' })
  readonly featureTenant$ = new BehaviorSubject([tenantFeatureOrganization, childTenantFeatureOrganization])
  readonly preferredLanguage$ = new BehaviorSubject(LanguagesEnum.Chinese)
  private readonly activeScope$ = new BehaviorSubject({ level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' })
  private _featureOrganizations: IFeatureOrganization[] | undefined
  featureOrganizationSetCount = 0

  constructor(featureOrganizations: IFeatureOrganization[] | undefined = []) {
    this._featureOrganizations = featureOrganizations
  }

  get featureOrganizations() {
    return this._featureOrganizations
  }

  set featureOrganizations(featureOrganizations: IFeatureOrganization[]) {
    this.featureOrganizationSetCount += 1
    this._featureOrganizations = featureOrganizations
  }

  get activeScope() {
    return this.activeScope$.value
  }

  selectActiveScope() {
    return this.activeScope$.asObservable()
  }

  set preferredLanguage(language: LanguagesEnum) {
    this.preferredLanguage$.next(language)
  }
}

describe('FeatureToggleComponent', () => {
  it('ships translations for the ClawXpert feature toggle description', () => {
    const locales = [
      ['en', 'Show the ClawXpert entry in the chat sidebar.'],
      ['zh-Hans', '在聊天左侧边栏中显示 ClawXpert 入口。'],
      ['zh-Hant', '在聊天左側邊欄中顯示 ClawXpert 入口。'],
      ['zh-CN', '在聊天左侧边栏中显示 ClawXpert 入口。']
    ]

    locales.forEach(([locale, expected]) => {
      const messages = JSON.parse(
        readFileSync(join(__dirname, '../../../../assets/i18n', `${locale}.json`), 'utf8')
      )
      const features = messages.PAC?.Feature?.Features ?? messages.Feature?.Features

      expect(features[AiFeatureEnum.FEATURE_XPERT_CLAWXPERT].Description).toBe(expected)
    })
  })

  it('initializes the real feature toggle view without recursive refreshes', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: FeatureService,
          useClass: MockFeatureService
        },
        {
          provide: Store,
          useClass: MockStore
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { isOrganization: true } },
            data: of({ isOrganization: true })
          }
        }
      ]
    }).createComponent(FeatureToggleComponent)

    expect(() => {
      fixture.detectChanges()
    }).not.toThrow()
  })

  it('does not rewrite unchanged organization feature state during initialization', async () => {
    const store = new MockStore()
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: FeatureService,
          useClass: MockFeatureService
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { isOrganization: true } },
            data: of({ isOrganization: true })
          }
        }
      ]
    }).createComponent(FeatureToggleComponent)

    fixture.detectChanges()

    expect(store.featureOrganizationSetCount).toBe(0)
  })

  it('treats missing organization feature state as an empty list during initialization', async () => {
    const store = new MockStore(undefined)
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: FeatureService,
          useClass: MockFeatureService
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { isOrganization: true } },
            data: of({ isOrganization: true })
          }
        }
      ]
    }).createComponent(FeatureToggleComponent)

    expect(() => {
      fixture.detectChanges()
    }).not.toThrow()
    expect(store.featureOrganizationSetCount).toBe(0)
  })

  it('keeps loading while parent features are loading', async () => {
    const parentFeatures$ = new Subject<{ items: IFeature[]; total: number }>()
    const featureService = {
      getParentFeatures: jest.fn(() => parentFeatures$.asObservable()),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 }))
    }
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
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
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { isOrganization: true } },
            data: of({ isOrganization: true })
          }
        }
      ]
    }).createComponent(FeatureToggleComponent)

    fixture.detectChanges()

    expect(fixture.componentInstance.loading()).toBe(true)

    parentFeatures$.next({ items: [parentFeature], total: 1 })
    parentFeatures$.complete()
    fixture.detectChanges()

    expect(fixture.componentInstance.loading()).toBe(false)
  })

  it('reloads parent features on demand after the feature definition upgrade', async () => {
    const featureService = new MockFeatureService()
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
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
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { isOrganization: true } },
            data: of({ isOrganization: true })
          }
        }
      ]
    }).createComponent(FeatureToggleComponent)

    fixture.detectChanges()
    fixture.componentInstance.reloadFeatures()
    fixture.detectChanges()

    expect(featureService.parentFeaturesRequestCount).toBe(2)
  })
})
