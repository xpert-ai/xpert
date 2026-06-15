import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiFeatureEnum,
  AnalyticsFeatures,
  FeatureEnum,
  IFeature,
  IFeatureOrganization,
  LanguagesEnum,
  RequestScopeLevel
} from '@xpert-ai/contracts'
import { resolveLegacyIcon, ZARD_ICONS, ZardTooltipDirective } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { FeatureService, Store } from '../../../@core/services'
import { FeatureToggleComponent } from './feature-toggle.component'

const childFeature: IFeature = {
  id: 'feature-child',
  code: AiFeatureEnum.FEATURE_COPILOT,
  name: 'Copilot',
  description: 'Copilot feature'
}

const parentFeature: IFeature = {
  id: 'feature-parent',
  code: AiFeatureEnum.FEATURE_XPERT,
  name: 'Xpert',
  description: 'Xpert feature',
  children: [childFeature]
}

const homeFeature: IFeature = {
  id: 'feature-home',
  code: FeatureEnum.FEATURE_HOME,
  name: 'Home',
  description: 'Home feature',
  children: [
    {
      id: 'feature-dashboard',
      code: FeatureEnum.FEATURE_DASHBOARD,
      name: 'Dashboard',
      description: 'Dashboard feature'
    }
  ]
}

const organizationFeature: IFeature = {
  id: 'feature-organization',
  code: FeatureEnum.FEATURE_ORGANIZATION,
  name: 'Organization',
  description: 'Organization feature'
}

const smtpFeature: IFeature = {
  id: 'feature-smtp',
  code: FeatureEnum.FEATURE_SMTP,
  name: 'Custom SMTP',
  description: 'Custom SMTP feature'
}

const customChildFeature: IFeature = {
  id: 'feature-custom-child',
  code: 'FEATURE_CUSTOM_CHILD',
  name: 'Custom child',
  description: 'Custom child feature'
}

const customParentFeature: IFeature = {
  id: 'feature-custom-parent',
  code: 'FEATURE_CUSTOM_PARENT',
  name: 'Custom parent',
  description: 'Custom parent feature',
  children: [customChildFeature]
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
  private readonly featureDefinitionsRefreshed = new Subject<void>()
  readonly featureDefinitionsRefreshed$ = this.featureDefinitionsRefreshed.asObservable()

  getParentFeatures() {
    this.parentFeaturesRequestCount += 1
    return of({ items: [parentFeature], total: 1 })
  }

  getFeatureOrganizations() {
    return of({ items: [], total: 0 })
  }

  notifyFeatureDefinitionsRefreshed() {
    this.featureDefinitionsRefreshed.next()
  }
}

class MockStore {
  readonly selectedOrganization$ = new BehaviorSubject({ id: 'org-1', name: 'Org' })
  readonly featureTenant$ = new BehaviorSubject([tenantFeatureOrganization, childTenantFeatureOrganization])
  readonly preferredLanguage$ = new BehaviorSubject(LanguagesEnum.Chinese)
  private readonly activeScope$ = new BehaviorSubject({
    level: RequestScopeLevel.ORGANIZATION,
    organizationId: 'org-1'
  })
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
      const messages = JSON.parse(readFileSync(join(__dirname, '../../../../assets/i18n', `${locale}.json`), 'utf8'))
      const features = messages.PAC?.Feature?.Features ?? messages.Feature?.Features

      expect(features[AiFeatureEnum.FEATURE_XPERT_CLAWXPERT].Description).toBe(expected)
    })
  })

  it('ships management overview translations for every supported locale', () => {
    const locales = ['en', 'en-US', 'zh-CN', 'zh-Hans', 'zh-Hant']

    locales.forEach((locale) => {
      const messages = JSON.parse(readFileSync(join(__dirname, '../../../../assets/i18n', `${locale}.json`), 'utf8'))
      const featureMessages = messages.PAC?.Feature

      expect(featureMessages?.Enabled).toBeTruthy()
      expect(featureMessages?.Disabled).toBeTruthy()
      expect(featureMessages?.Groups?.Organization).toBeTruthy()
      expect(featureMessages?.Filters?.AllStatus).toBeTruthy()
      expect(featureMessages?.Summary?.Enabled).toBeTruthy()
      expect(featureMessages?.Summary?.Groups).toBeTruthy()
      expect(featureMessages?.Summary?.Items).toBeTruthy()
      expect(featureMessages?.EmptyTitle).toBeTruthy()
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
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureDefinitionsRefreshed$: new Subject<void>().asObservable()
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

  it('reloads parent features when feature definitions are refreshed', async () => {
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
    featureService.notifyFeatureDefinitionsRefreshed()
    fixture.detectChanges()

    expect(featureService.parentFeaturesRequestCount).toBe(2)
  })

  it('renders the zard card based management overview instead of the legacy accordion list', async () => {
    const featureService = {
      getParentFeatures: jest.fn(() =>
        of({ items: [homeFeature, organizationFeature, parentFeature, smtpFeature], total: 4 })
      ),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureDefinitionsRefreshed$: new Subject<void>().asObservable()
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

    const element = fixture.nativeElement as HTMLElement

    expect(element.querySelector('[data-feature-summary]')).not.toBeNull()
    expect(element.querySelector('[data-feature-home-section]')).toBeNull()
    expect(element.querySelector('[data-feature-groups-grid]')?.className).toContain('columns-1')
    expect(element.querySelector('[data-feature-groups-grid]')?.className).toContain('2xl:columns-3')
    expect(element.querySelector('[data-feature-group-id="FEATURE_HOME"]')).not.toBeNull()
    expect(element.querySelector('[data-feature-group-id="FEATURE_ORGANIZATION"] z-card-content')).toBeNull()
    expect(element.querySelector('[data-feature-group-card]')?.className).toContain('break-inside-avoid')
    expect(element.querySelector('[data-feature-parent-switch][data-feature-code="FEATURE_XPERT"]')).not.toBeNull()
    expect(element.querySelector('[data-feature-parent-status="enabled"]')?.className).toContain('text-text-success')
    expect(element.querySelectorAll('[data-feature-group-card]').length).toBeGreaterThanOrEqual(4)
    expect(element.querySelector('[data-feature-status="enabled"]')?.className).toContain('text-text-success')
    expect(element.querySelector('[data-feature-status="disabled"]')?.className).toContain('text-destructive')
    expect(element.querySelector('z-accordion')).toBeNull()
    expect(element.querySelector('button.btn')).toBeNull()
  })

  it('uses icon names that zard can resolve for overview cards', async () => {
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
    const component = fixture.componentInstance
    const iconFeatures: IFeature[] = [
      homeFeature,
      homeFeature.children[0],
      organizationFeature,
      {
        id: 'feature-user',
        code: FeatureEnum.FEATURE_USER,
        name: 'User',
        description: 'User feature'
      },
      {
        id: 'feature-role',
        code: FeatureEnum.FEATURE_ROLES_PERMISSION,
        name: 'Role permission',
        description: 'Role permission feature'
      },
      {
        id: 'feature-setting',
        code: FeatureEnum.FEATURE_SETTING,
        name: 'Setting',
        description: 'Setting feature'
      },
      {
        id: 'feature-storage',
        code: FeatureEnum.FEATURE_FILE_STORAGE,
        name: 'File storage',
        description: 'File storage feature'
      },
      smtpFeature,
      {
        id: 'feature-integration',
        code: FeatureEnum.FEATURE_INTEGRATION,
        name: 'Integration',
        description: 'Integration feature'
      },
      childFeature,
      parentFeature,
      {
        id: 'feature-chatbi',
        code: AiFeatureEnum.FEATURE_XPERT_CHATBI,
        name: 'ChatBI',
        description: 'ChatBI feature'
      },
      {
        id: 'feature-model',
        code: AnalyticsFeatures.FEATURE_MODEL,
        name: 'Model',
        description: 'Model feature'
      },
      {
        id: 'feature-story',
        code: AnalyticsFeatures.FEATURE_STORY,
        name: 'Story',
        description: 'Story feature'
      },
      {
        id: 'feature-indicator',
        code: AnalyticsFeatures.FEATURE_INDICATOR,
        name: 'Indicator',
        description: 'Indicator feature'
      },
      {
        id: 'feature-project',
        code: AnalyticsFeatures.FEATURE_PROJECT,
        name: 'Project',
        description: 'Project feature'
      },
      customParentFeature
    ]
    const icons = [
      ...component.summaryCards([homeFeature, parentFeature]).map((summary) => summary.icon),
      ...iconFeatures.map((feature) => component.featureIcon(feature))
    ]

    icons.forEach((icon) => {
      expect(ZARD_ICONS[icon as keyof typeof ZARD_ICONS] || resolveLegacyIcon(icon)).toBeTruthy()
    })
  })

  it('uses the original parent feature hierarchy for management cards', async () => {
    const featureService = {
      getParentFeatures: jest.fn(() => of({ items: [homeFeature, customParentFeature], total: 2 })),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureDefinitionsRefreshed$: new Subject<void>().asObservable()
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

    const element = fixture.nativeElement as HTMLElement
    const homeGroup = element.querySelector('[data-feature-group-id="FEATURE_HOME"]')
    const customGroup = element.querySelector('[data-feature-group-id="FEATURE_CUSTOM_PARENT"]')
    const groups = fixture.componentInstance.visibleFeatureGroups([homeFeature, customParentFeature])

    expect(homeGroup).not.toBeNull()
    expect(customGroup).not.toBeNull()
    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.id === homeFeature.code)?.features).toEqual(homeFeature.children)
    expect(groups.find((group) => group.id === homeFeature.code)?.matchCount).toBe(2)
    expect(groups.find((group) => group.id === customParentFeature.code)?.titleDefault).toBe(customParentFeature.name)
    expect(groups.find((group) => group.id === customParentFeature.code)?.features).toEqual([customChildFeature])
    expect(groups.find((group) => group.id === customParentFeature.code)?.matchCount).toBe(2)
  })

  it('shows full descriptions in zard tooltips for truncated description text', async () => {
    const featureService = {
      getParentFeatures: jest.fn(() =>
        of({ items: [homeFeature, organizationFeature, parentFeature, smtpFeature], total: 4 })
      ),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureDefinitionsRefreshed$: new Subject<void>().asObservable()
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

    const descriptionNodes = fixture.debugElement.queryAll(By.css('[data-feature-description]'))

    expect(descriptionNodes.length).toBeGreaterThan(0)
    descriptionNodes.forEach((descriptionNode) => {
      const tooltip = descriptionNode.injector.get(ZardTooltipDirective)

      expect(tooltip.zTooltip()).toBe(descriptionNode.nativeElement.textContent.trim())
    })
  })
})
