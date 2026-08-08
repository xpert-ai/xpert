import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiFeatureEnum,
  FeatureEnum,
  IFeature,
  IFeatureOrganization,
  LanguagesEnum,
  RequestScopeLevel
} from '@xpert-ai/contracts'
import { resolveLegacyIcon, ZARD_ICONS, ZardTooltipDirective } from '@xpert-ai/headless-ui'
import { BehaviorSubject, EMPTY, NEVER, of, Subject } from 'rxjs'
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

const xpertLeafFeature: IFeature = {
  id: 'feature-xpert',
  code: AiFeatureEnum.FEATURE_XPERT,
  name: 'Digital Expert',
  description: 'Digital expert feature'
}

const legacyTopLevelXpertFeature: IFeature = {
  id: 'feature-legacy-xpert',
  code: AiFeatureEnum.FEATURE_XPERT,
  name: 'Xpert',
  description: 'Legacy top-level Xpert feature'
}

const xpertClawxpertFeature: IFeature = {
  id: 'feature-xpert-clawxpert',
  code: AiFeatureEnum.FEATURE_XPERT_CLAWXPERT,
  name: 'ClawXpert',
  description: 'ClawXpert feature'
}

const xpertFeatureGroup: IFeature = {
  id: 'feature-xpert-group',
  code: 'GROUP_XPERT',
  name: 'Xpert features',
  description: 'Xpert feature group',
  children: [xpertLeafFeature, xpertClawxpertFeature]
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

const rolePermissionFeature: IFeature = {
  id: 'feature-role-permission',
  code: FeatureEnum.FEATURE_ROLES_PERMISSION,
  name: 'Role permission',
  description: 'Role permission feature'
}

const integrationFeature: IFeature = {
  id: 'feature-integration',
  code: FeatureEnum.FEATURE_INTEGRATION,
  name: 'Integration',
  description: 'Integration feature'
}

const referralFeature: IFeature = {
  id: 'feature-referral',
  code: FeatureEnum.FEATURE_REFERRAL,
  name: 'Invitation codes',
  description: 'Invitation code feature'
}

const membershipPlanFeature: IFeature = {
  id: 'feature-membership-plan',
  code: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN,
  name: 'Membership plans',
  description: 'Membership plan feature'
}

const membershipPurchaseFeature: IFeature = {
  id: 'feature-membership-purchase',
  code: AiFeatureEnum.FEATURE_MEMBERSHIP_PURCHASE,
  name: 'Membership purchase',
  description: 'Membership purchase feature'
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
  featureToggle = jest.fn(() => of(true))
  featuresToggle = jest.fn(() => of([true]))
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
  readonly featureTenant$: BehaviorSubject<IFeatureOrganization[]>
  readonly preferredLanguage$ = new BehaviorSubject(LanguagesEnum.Chinese)
  private readonly activeScope$ = new BehaviorSubject({
    level: RequestScopeLevel.ORGANIZATION,
    organizationId: 'org-1'
  })
  private _featureOrganizations: IFeatureOrganization[] | undefined
  featureOrganizationSetCount = 0

  constructor(
    featureOrganizations: IFeatureOrganization[] | undefined = [],
    featureTenant: IFeatureOrganization[] = [tenantFeatureOrganization, childTenantFeatureOrganization]
  ) {
    this._featureOrganizations = featureOrganizations
    this.featureTenant$ = new BehaviorSubject(featureTenant)
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
  it('shows tenant and dual-scope feature toggles in tenant feature management', async () => {
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
            snapshot: { data: { isOrganization: false } },
            data: of({ isOrganization: false })
          }
        }
      ]
    }).createComponent(FeatureToggleComponent)

    fixture.detectChanges()

    const groupIds = fixture.componentInstance
      .visibleFeatureGroups([
        rolePermissionFeature,
        integrationFeature,
        referralFeature,
        membershipPlanFeature,
        membershipPurchaseFeature,
        parentFeature
      ])
      .map((group) => group.id)

    expect(groupIds).toContain(FeatureEnum.FEATURE_ROLES_PERMISSION)
    expect(groupIds).toContain(FeatureEnum.FEATURE_REFERRAL)
    expect(groupIds).toContain(FeatureEnum.FEATURE_INTEGRATION)
    expect(groupIds).toContain(AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN)
    expect(groupIds).toContain(AiFeatureEnum.FEATURE_MEMBERSHIP_PURCHASE)
    expect(groupIds).toContain(AiFeatureEnum.FEATURE_XPERT)
    expect(
      fixture.componentInstance
        .summaryCards([rolePermissionFeature, integrationFeature, parentFeature])
        .find((summary) => summary.id === 'groups')?.value
    ).toBe(3)
  })

  it('shows organization and dual-scope feature toggles in organization feature management', async () => {
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

    fixture.detectChanges()

    const groupIds = fixture.componentInstance
      .visibleFeatureGroups([
        rolePermissionFeature,
        integrationFeature,
        referralFeature,
        membershipPlanFeature,
        membershipPurchaseFeature,
        parentFeature
      ])
      .map((group) => group.id)

    expect(groupIds).toContain(FeatureEnum.FEATURE_INTEGRATION)
    expect(groupIds).toContain(AiFeatureEnum.FEATURE_XPERT)
    expect(groupIds).not.toContain(FeatureEnum.FEATURE_ROLES_PERMISSION)
    expect(groupIds).not.toContain(AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN)
    expect(groupIds).not.toContain(AiFeatureEnum.FEATURE_MEMBERSHIP_PURCHASE)
  })

  it('renders feature toggles with z-checkbox and uses indeterminate state for partial groups', async () => {
    const featureService = {
      getParentFeatures: jest.fn(() => of({ items: [xpertFeatureGroup], total: 1 })),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureDefinitionsRefreshed$: new Subject<void>().asObservable()
    }
    const store = new MockStore(
      [],
      [
        {
          id: 'tenant-xpert',
          featureId: xpertLeafFeature.id,
          feature: xpertLeafFeature,
          isEnabled: true
        },
        {
          id: 'tenant-clawxpert',
          featureId: xpertClawxpertFeature.id,
          feature: xpertClawxpertFeature,
          isEnabled: false
        }
      ]
    )
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: FeatureService,
          useValue: featureService
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

    const element = fixture.nativeElement as HTMLElement
    const groupCheckbox = element.querySelector('[data-feature-parent-checkbox][data-feature-code="GROUP_XPERT"]')

    expect(element.querySelector('z-switch')).toBeNull()
    expect(groupCheckbox).not.toBeNull()
    expect(groupCheckbox?.getAttribute('data-indeterminate')).toBe('')
    expect(element.querySelector('[data-feature-parent-status="partial"]')).not.toBeNull()
    expect(element.querySelectorAll('[data-feature-checkbox]').length).toBe(2)
  })

  it('restores the clicked checkbox when feature toggle confirmation is cancelled', async () => {
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
    const checkboxControl = {
      writeValue: jest.fn(),
      setIndeterminateState: jest.fn()
    }

    fixture.detectChanges()
    jest.spyOn(component, 'confirm').mockReturnValue(EMPTY)

    component.featureChanged(true, organizationFeature, checkboxControl)

    expect(checkboxControl.writeValue).toHaveBeenCalledWith(false)
    expect(checkboxControl.setIndeterminateState).toHaveBeenCalledWith(false)
  })

  it('emits a disable request when unchecking an enabled child feature checkbox', async () => {
    const featureService = {
      getParentFeatures: jest.fn(() => of({ items: [xpertFeatureGroup], total: 1 })),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureToggle: jest.fn(() => NEVER),
      featuresToggle: jest.fn(() => NEVER),
      featureDefinitionsRefreshed$: new Subject<void>().asObservable()
    }
    const store = new MockStore(
      [],
      [
        {
          id: 'tenant-xpert',
          featureId: xpertLeafFeature.id,
          feature: xpertLeafFeature,
          isEnabled: true
        },
        {
          id: 'tenant-clawxpert',
          featureId: xpertClawxpertFeature.id,
          feature: xpertClawxpertFeature,
          isEnabled: true
        }
      ]
    )
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: FeatureService,
          useValue: featureService
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
    const component = fixture.componentInstance

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    jest.spyOn(component, 'confirm').mockImplementation((_info, execution) => execution ?? of(true))

    const checkboxInput = fixture.nativeElement.querySelector(
      '[data-feature-checkbox][data-feature-code="FEATURE_XPERT"] input'
    ) as HTMLInputElement
    expect(checkboxInput.checked).toBe(true)

    checkboxInput.click()
    fixture.detectChanges()

    expect(featureService.featureToggle).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: xpertLeafFeature.id,
        isEnabled: false,
        organizationId: 'org-1'
      })
    )
    expect(featureService.featuresToggle).not.toHaveBeenCalled()
  })

  it('uses feature ids before feature codes when legacy duplicate feature codes exist', async () => {
    const featureService = {
      getParentFeatures: jest.fn(() => of({ items: [xpertFeatureGroup], total: 1 })),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureToggle: jest.fn(() => NEVER),
      featuresToggle: jest.fn(() => NEVER),
      featureDefinitionsRefreshed$: new Subject<void>().asObservable()
    }
    const store = new MockStore(
      [],
      [
        {
          id: 'tenant-legacy-xpert',
          featureId: legacyTopLevelXpertFeature.id,
          feature: legacyTopLevelXpertFeature,
          isEnabled: true
        },
        {
          id: 'tenant-xpert',
          featureId: xpertLeafFeature.id,
          feature: xpertLeafFeature,
          isEnabled: false
        },
        {
          id: 'tenant-clawxpert',
          featureId: xpertClawxpertFeature.id,
          feature: xpertClawxpertFeature,
          isEnabled: false
        }
      ]
    )
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: FeatureService,
          useValue: featureService
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
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.componentInstance.enabledFeature(xpertLeafFeature)).toBe(false)
    expect(fixture.nativeElement.querySelector('[data-feature-parent-status="disabled"]')).not.toBeNull()
  })

  it('keeps the clicked child feature checkbox unchecked while disable confirmation is pending', async () => {
    const featureService = {
      getParentFeatures: jest.fn(() => of({ items: [xpertFeatureGroup], total: 1 })),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureToggle: jest.fn(() => of(true)),
      featuresToggle: jest.fn(() => of([true])),
      featureDefinitionsRefreshed$: new Subject<void>().asObservable()
    }
    const store = new MockStore(
      [],
      [
        {
          id: 'tenant-xpert',
          featureId: xpertLeafFeature.id,
          feature: xpertLeafFeature,
          isEnabled: true
        },
        {
          id: 'tenant-clawxpert',
          featureId: xpertClawxpertFeature.id,
          feature: xpertClawxpertFeature,
          isEnabled: true
        }
      ]
    )
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: FeatureService,
          useValue: featureService
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
    const component = fixture.componentInstance

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    jest.spyOn(component, 'confirm').mockReturnValue(NEVER)

    const checkboxInput = fixture.nativeElement.querySelector(
      '[data-feature-checkbox][data-feature-code="FEATURE_XPERT"] input'
    ) as HTMLInputElement
    expect(checkboxInput.checked).toBe(true)

    checkboxInput.click()
    fixture.detectChanges()

    expect(checkboxInput.checked).toBe(false)
  })

  it('disables child feature toggles when unchecking a partially enabled feature group checkbox', async () => {
    const featureService = {
      getParentFeatures: jest.fn(() => of({ items: [xpertFeatureGroup], total: 1 })),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureToggle: jest.fn(() => NEVER),
      featuresToggle: jest.fn(() => NEVER),
      featureDefinitionsRefreshed$: new Subject<void>().asObservable()
    }
    const store = new MockStore(
      [],
      [
        {
          id: 'tenant-xpert',
          featureId: xpertLeafFeature.id,
          feature: xpertLeafFeature,
          isEnabled: true
        },
        {
          id: 'tenant-clawxpert',
          featureId: xpertClawxpertFeature.id,
          feature: xpertClawxpertFeature,
          isEnabled: false
        }
      ]
    )
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: FeatureService,
          useValue: featureService
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
    const component = fixture.componentInstance

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    jest.spyOn(component, 'confirm').mockImplementation((_info, execution) => execution ?? of(true))

    const groupCheckboxInput = fixture.nativeElement.querySelector(
      '[data-feature-parent-checkbox][data-feature-code="GROUP_XPERT"] input'
    ) as HTMLInputElement
    expect(groupCheckboxInput.indeterminate).toBe(true)

    groupCheckboxInput.click()
    fixture.detectChanges()

    expect(featureService.featuresToggle).toHaveBeenCalledWith([
      expect.objectContaining({
        featureId: xpertLeafFeature.id,
        isEnabled: false,
        organizationId: 'org-1'
      }),
      expect.objectContaining({
        featureId: xpertClawxpertFeature.id,
        isEnabled: false,
        organizationId: 'org-1'
      })
    ])
  })

  it('updates child feature toggles only when disabling a feature group', async () => {
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
    fixture.componentInstance.emitFeatureToggle({ feature: parentFeature, isEnabled: false })

    expect(featureService.featureToggle).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: childFeature.id,
        isEnabled: false,
        organizationId: 'org-1'
      })
    )
    expect(featureService.featuresToggle).not.toHaveBeenCalled()
  })

  it('updates child feature toggles only when enabling a feature group', async () => {
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
    fixture.componentInstance.emitFeatureToggle({ feature: parentFeature, isEnabled: true })

    expect(featureService.featureToggle).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: childFeature.id,
        isEnabled: true,
        organizationId: 'org-1'
      })
    )
    expect(featureService.featuresToggle).not.toHaveBeenCalled()
  })

  it('ships translations for the ClawXpert feature toggle description', () => {
    const locales = [
      ['en', 'Show the ClawXpert entry in the chat sidebar.'],
      ['zh-Hans', '在聊天左侧边栏中显示 ClawXpert 入口。'],
      ['zh-Hant', '在聊天左側邊欄中顯示 ClawXpert 入口。'],
      ['zh-CN', '在聊天左侧边栏中显示 ClawXpert 入口。']
    ]

    locales.forEach(([locale, expected]) => {
      const messages = JSON.parse(readFileSync(join(__dirname, '../../../../assets/i18n', `${locale}.json`), 'utf8'))
      const features = messages.XP?.Feature?.Features ?? messages.Feature?.Features

      expect(features[AiFeatureEnum.FEATURE_XPERT_CLAWXPERT].Description).toBe(expected)
    })
  })

  it('ships translations for the agent marketplace feature toggle description', () => {
    const locales = [
      ['en', 'Show the agent marketplace and access approval entry points.'],
      ['en-US', 'Show the agent marketplace and access approval entry points.'],
      ['zh-Hans', '显示智能体广场及访问审批入口。'],
      ['zh-Hant', '顯示智能體廣場及訪問審批入口。'],
      ['zh-CN', '显示智能体广场及访问审批入口。']
    ]

    locales.forEach(([locale, expected]) => {
      const messages = JSON.parse(readFileSync(join(__dirname, '../../../../assets/i18n', `${locale}.json`), 'utf8'))
      const features = messages.XP?.Feature?.Features ?? messages.Feature?.Features

      expect(features[AiFeatureEnum.FEATURE_XPERT_MARKETPLACE].Description).toBe(expected)
    })
  })

  it('ships membership purchase feature translations for every supported locale', () => {
    const locales = [
      ['en', 'Membership Purchase', 'Enable membership plan and personal point purchases.'],
      ['en-US', 'Membership Purchase', 'Enable membership plan and personal point purchases.'],
      ['zh-CN', '会员购买', '启用会员套餐和个人积分购买。'],
      ['zh-Hans', '会员购买', '启用会员套餐和个人积分购买。'],
      ['zh-Hant', '會員購買', '啟用會員套餐和個人積分購買。']
    ]

    locales.forEach(([locale, expectedName, expectedDescription]) => {
      const messages = JSON.parse(readFileSync(join(__dirname, '../../../../assets/i18n', `${locale}.json`), 'utf8'))
      const feature = messages.XP?.Feature?.Features?.[AiFeatureEnum.FEATURE_MEMBERSHIP_PURCHASE]

      expect(feature?.Name).toBe(expectedName)
      expect(feature?.Description).toBe(expectedDescription)
    })
  })

  it('ships management overview translations for every supported locale', () => {
    const locales = ['en', 'en-US', 'zh-CN', 'zh-Hans', 'zh-Hant']

    locales.forEach((locale) => {
      const messages = JSON.parse(readFileSync(join(__dirname, '../../../../assets/i18n', `${locale}.json`), 'utf8'))
      const featureMessages = messages.XP?.Feature

      expect(featureMessages?.Enabled).toBeTruthy()
      expect(featureMessages?.Disabled).toBeTruthy()
      expect(featureMessages?.AllEnabled).toBeTruthy()
      expect(featureMessages?.PartiallyEnabled).toBeTruthy()
      expect(featureMessages?.AllDisabled).toBeTruthy()
      expect(featureMessages?.Groups?.Organization).toBeTruthy()
      expect(featureMessages?.Features?.GROUP_XPERT?.Name).toBeTruthy()
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
    const groupsGridClass = element.querySelector('[data-feature-groups-grid]')?.className ?? ''
    expect(groupsGridClass).toContain('columns-xl')
    expect(groupsGridClass).not.toContain('2xl:columns-3')

    const featureRowClass = element.querySelector('[data-feature-row]')?.className ?? ''
    expect(featureRowClass).toContain('minmax(0,1fr)')
    expect(element.querySelector('[data-feature-group-id="FEATURE_HOME"]')).not.toBeNull()
    expect(element.querySelector('[data-feature-group-id="FEATURE_ORGANIZATION"] z-card-content')).toBeNull()
    expect(element.querySelector('[data-feature-group-card]')?.className).toContain('break-inside-avoid')
    expect(element.querySelector('[data-feature-group-card]')?.className).toContain('shadow-none')
    expect(element.querySelector('[data-feature-group-card]')?.className).not.toContain('shadow-sm')
    expect(element.querySelector('[data-feature-parent-checkbox][data-feature-code="FEATURE_XPERT"]')).not.toBeNull()
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
        id: 'feature-clawxpert',
        code: AiFeatureEnum.FEATURE_XPERT_CLAWXPERT,
        name: 'ClawXpert',
        description: 'ClawXpert feature'
      },
      {
        id: 'feature-xpert-marketplace',
        code: AiFeatureEnum.FEATURE_XPERT_MARKETPLACE,
        name: 'Agent Marketplace',
        description: 'Agent marketplace feature'
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
    expect(groups.find((group) => group.id === homeFeature.code)?.matchCount).toBe(1)
    expect(groups.find((group) => group.id === customParentFeature.code)?.titleDefault).toBe(customParentFeature.name)
    expect(groups.find((group) => group.id === customParentFeature.code)?.features).toEqual([customChildFeature])
    expect(groups.find((group) => group.id === customParentFeature.code)?.matchCount).toBe(1)
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
