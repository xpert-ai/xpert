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

import {
  childFeature,
  parentFeature,
  xpertLeafFeature,
  legacyTopLevelXpertFeature,
  xpertClawxpertFeature,
  xpertFeatureGroup,
  homeFeature,
  organizationFeature,
  smtpFeature,
  rolePermissionFeature,
  integrationFeature,
  referralFeature,
  membershipPlanFeature,
  membershipPurchaseFeature,
  customChildFeature,
  customParentFeature,
  tenantFeatureOrganization,
  childTenantFeatureOrganization,
  MockFeatureService,
  MockStore
} from './feature-toggle.test-fixtures'

describe('FeatureToggleComponent view', () => {
  it('shows an inline initial loading state and keeps the existing list mounted during refresh', async () => {
    const initialRequest = new Subject<{ items: IFeature[]; total: number }>()
    const refreshRequest = new Subject<{ items: IFeature[]; total: number }>()
    const refreshed = new Subject<void>()
    const featureService = {
      getParentFeatures: jest
        .fn()
        .mockReturnValueOnce(initialRequest.asObservable())
        .mockReturnValueOnce(refreshRequest.asObservable()),
      getFeatureOrganizations: jest.fn(() => of({ items: [], total: 0 })),
      featureDefinitionsRefreshed$: refreshed.asObservable()
    }
    const fixture = await TestBed.configureTestingModule({
      imports: [FeatureToggleComponent, TranslateModule.forRoot()],
      providers: [
        { provide: FeatureService, useValue: featureService },
        { provide: Store, useClass: MockStore },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { isOrganization: false } },
            data: of({ isOrganization: false })
          }
        }
      ]
    }).createComponent(FeatureToggleComponent)
    const element = fixture.nativeElement as HTMLElement

    fixture.detectChanges()
    expect(element.getAttribute('aria-busy')).toBe('true')
    expect(element.querySelector('[role="status"]')).not.toBeNull()
    expect(element.querySelector('[data-feature-summary]')).toBeNull()

    initialRequest.next({ items: [parentFeature], total: 1 })
    initialRequest.complete()
    fixture.detectChanges()
    const summary = element.querySelector('[data-feature-summary]')
    const group = element.querySelector('[data-feature-group-card]')
    expect(summary).not.toBeNull()
    expect(group).not.toBeNull()
    expect(element.querySelector('[role="status"]')).toBeNull()
    expect(element.getAttribute('aria-busy')).toBe('false')

    refreshed.next()
    fixture.detectChanges()
    expect(element.getAttribute('aria-busy')).toBe('true')
    expect(element.querySelector('[data-feature-summary]')).toBe(summary)
    expect(element.querySelector('[data-feature-group-card]')).toBe(group)
    expect(element.querySelector('z-loader')).toBeNull()

    refreshRequest.next({ items: [parentFeature], total: 1 })
    refreshRequest.complete()
    fixture.detectChanges()
    expect(element.getAttribute('aria-busy')).toBe('false')
    expect(element.querySelector('[data-feature-group-card]')).toBe(group)
  })

  it('renders feature groups, statuses and parent controls', async () => {
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

    const featureRowClass = element.querySelector('[data-feature-row]')?.className ?? ''
    expect(featureRowClass).toContain('minmax(0,1fr)')
    expect(element.querySelector('[data-feature-group-id="FEATURE_HOME"]')).not.toBeNull()
    expect(element.querySelector('[data-feature-group-id="FEATURE_ORGANIZATION"] z-card-content')).toBeNull()
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
