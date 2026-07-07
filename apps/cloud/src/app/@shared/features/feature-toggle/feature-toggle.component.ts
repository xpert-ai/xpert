import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import {
  AiFeatureEnum,
  AnalyticsFeatures,
  FeatureEnum,
  IFeature,
  IFeatureOrganization,
  IFeatureOrganizationUpdateInput
} from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectRouteData } from 'ngxtension/inject-route-data'
import { Observable, of, pipe } from 'rxjs'
import { finalize, map, startWith, switchMap } from 'rxjs/operators'
import {
  injectConfirm,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardInputGroupComponent,
  ZardLoaderComponent,
  ZardSelectComponent,
  ZardSelectItemComponent,
  ZardCheckboxComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { FeatureService, FeatureStoreService, Store } from '../../../@core/services'
import { injectI18nService } from '../../i18n'

type FeatureStatusFilter = 'all' | 'enabled' | 'disabled'
type FeatureGroupFilter = string
type FeatureGroupStatus = 'enabled' | 'partial' | 'disabled'
type FeatureToggleScope = 'tenant-only' | 'organization-only' | 'dual-scope'
type FeatureToggleRequest = IFeatureOrganizationUpdateInput & { feature: IFeature }
type FeatureCheckboxControl = Pick<ZardCheckboxComponent, 'writeValue' | 'setIndeterminateState'>

interface FeatureGroupView {
  id: string
  feature: IFeature
  deprecated: boolean
  titleKey: string
  titleDefault: string
  descriptionKey: string
  descriptionDefault: string
  icon: string
  features: IFeature[]
  matchCount: number
}

const STATUS_FILTERS: Array<{ value: FeatureStatusFilter; labelKey: string; labelDefault: string }> = [
  { value: 'all', labelKey: 'PAC.Feature.Filters.AllStatus', labelDefault: 'All status' },
  { value: 'enabled', labelKey: 'PAC.Feature.Filters.Enabled', labelDefault: 'Enabled' },
  { value: 'disabled', labelKey: 'PAC.Feature.Filters.Disabled', labelDefault: 'Disabled' }
]

const FEATURE_SCOPE_BY_CODE: Record<string, FeatureToggleScope> = {
  [FeatureEnum.FEATURE_ROLES_PERMISSION]: 'tenant-only',
  [AnalyticsFeatures.FEATURE_BUSINESS_AREA]: 'organization-only',
  [FeatureEnum.FEATURE_INTEGRATION]: 'organization-only'
}

const DEPRECATED_FEATURE_CODES = new Set<string>([AnalyticsFeatures.FEATURE_BUSINESS_AREA])

function isFeatureStatusFilter(value: unknown): value is FeatureStatusFilter {
  return value === 'all' || value === 'enabled' || value === 'disabled'
}

function matchesFeatureToggleScope(scope: FeatureToggleScope, isOrganization: boolean) {
  if (scope === 'dual-scope') {
    return true
  }

  return isOrganization ? scope === 'organization-only' : scope === 'tenant-only'
}

function areFeatureOrganizationsEqual(
  left: IFeatureOrganization[] | null | undefined,
  right: IFeatureOrganization[] | null | undefined
) {
  const leftItems = left ?? []
  const rightItems = right ?? []

  if (leftItems.length !== rightItems.length) {
    return false
  }

  return leftItems.every((leftItem, index) => {
    const rightItem = rightItems[index]

    return (
      leftItem.id === rightItem.id &&
      leftItem.featureId === rightItem.featureId &&
      leftItem.organizationId === rightItem.organizationId &&
      leftItem.tenantId === rightItem.tenantId &&
      leftItem.isEnabled === rightItem.isEnabled &&
      leftItem.feature?.code === rightItem.feature?.code
    )
  })
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ...ZardCardImports,
    ZardIconComponent,
    ZardInputDirective,
    ZardInputGroupComponent,
    ZardLoaderComponent,
    ZardSelectComponent,
    ZardSelectItemComponent,
    ZardCheckboxComponent,
    ...ZardTooltipImports
  ],
  providers: [FeatureStoreService],
  selector: 'pac-feature-toggle',
  templateUrl: './feature-toggle.component.html',
  styleUrls: ['./feature-toggle.component.scss']
})
export class FeatureToggleComponent {
  private readonly _featureService = inject(FeatureService)
  private readonly _featureStoreService = inject(FeatureStoreService)
  private readonly _storeService = inject(Store)
  readonly destroyRef = inject(DestroyRef)
  readonly confirm = injectConfirm()
  readonly translate = injectI18nService()

  readonly isOrganization = injectRouteData<boolean>('isOrganization')

  readonly loading = signal(true)
  readonly searchText = signal('')
  readonly statusFilter = signal<FeatureStatusFilter>('all')
  readonly groupFilter = signal<FeatureGroupFilter>('all')
  readonly statusFilters = STATUS_FILTERS

  readonly organization = toSignal(this._storeService.selectedOrganization$)

  readonly features$ = this._featureService.featureDefinitionsRefreshed$.pipe(
    startWith(undefined),
    switchMap(() => {
      this.loading.set(true)
      return this._featureService.getParentFeatures(['children']).pipe(
        map(({ items }) => items),
        finalize(() => this.loading.set(false))
      )
    })
  )

  readonly featureTenant = toSignal(this._storeService.featureTenant$)

  readonly featureOrganizations = derivedFrom(
    [this.isOrganization],
    pipe(
      switchMap(([isOrganization]) => (isOrganization ? this._storeService.selectedOrganization$ : of(null))),
      switchMap((organization) => {
        const request = {}
        if (organization) {
          request['organizationId'] = organization.id
        }
        return this._featureStoreService.loadFeatureOrganizations(['feature'], request).pipe(map(({ items }) => items))
      })
    ),
    { initialValue: [] }
  )

  readonly featureToggles = computed(() => {
    const isOrganization = this.isOrganization()
    const organization = this.organization()
    const featureTenant = this.featureTenant() ?? []
    const featureOrganizations = this.featureOrganizations()
    const featureToggles = isOrganization && organization ? [...featureOrganizations] : []

    featureTenant.forEach((item) => {
      if (!featureToggles.find((toggle) => toggle.featureId === item.featureId)) {
        featureToggles.push(item)
      }
    })

    return featureToggles
  })

  constructor() {
    effect(() => {
      const isOrganization = this.isOrganization()
      const organization = this.organization()
      const featureOrganizations = this.featureOrganizations()

      if (
        isOrganization &&
        organization &&
        !areFeatureOrganizationsEqual(this._storeService.featureOrganizations, featureOrganizations)
      ) {
        this._storeService.featureOrganizations = featureOrganizations
      }
    })
  }

  getFeatures() {
    this._featureStoreService.loadFeatures(['children']).pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }

  featureChanged(isEnabled: boolean, feature: IFeature, checkboxControl?: FeatureCheckboxControl) {
    if (typeof isEnabled !== 'boolean') {
      return
    }

    let applied = false

    this.confirm(
      {
        title: isEnabled
          ? this.translate.instant('PAC.Feature.EnableFeature', { Default: 'Enable feature' })
          : this.translate.instant('PAC.Feature.DisableFeature', { Default: 'Disable feature' }),
        information:
          this.translate.instant('PAC.Feature.Features.' + feature.code + '.Name', { Default: feature.name }) +
          ': ' +
          this.translate.instant('PAC.Feature.Features.' + feature.code + '.Description', {
            Default: feature.description
          })
      },
      this.emitFeatureToggle({ feature, isEnabled: !!isEnabled }).pipe(
        map((result) => {
          applied = true
          return result
        })
      )
    )
      .pipe(
        finalize(() => {
          if (!applied) {
            checkboxControl?.writeValue(this.featureCheckboxChecked(feature))
            checkboxControl?.setIndeterminateState(this.featureCheckboxIndeterminate(feature))
          }
        })
      )
      .subscribe()
  }

  nextFeatureCheckboxValue(isChecked: boolean, feature: IFeature) {
    if (this.hasChildFeatures(feature) && this.featureCheckboxIndeterminate(feature)) {
      return false
    }

    return isChecked
  }

  emitFeatureToggle({
    feature,
    isEnabled
  }: {
    feature: IFeature
    isEnabled: boolean
  }): Observable<boolean | boolean[]> {
    const requests = this.featureToggleRequests(feature, isEnabled)
    if (!requests.length) {
      return of(false)
    }

    const toggle: Observable<boolean | boolean[]> =
      requests.length === 1
        ? this._featureStoreService.changedFeature(requests[0])
        : this._featureStoreService.changedFeatures(requests)

    return toggle.pipe(
      map((result) => {
        window.location.reload()
        return result
      })
    )
  }

  private featureToggleRequests(feature: IFeature, isEnabled: boolean): FeatureToggleRequest[] {
    const isOrganization = this.isOrganization()
    const organization = this.organization()
    const features = this.hasChildFeatures(feature)
      ? this.childFeaturesForParent(feature).filter((childFeature) => this.matchesCurrentFeatureScope(childFeature))
      : [feature]

    return features.map((item) =>
      this.featureToggleRequest(item, isEnabled, organization && isOrganization ? organization.id : undefined)
    )
  }

  private featureToggleRequest(feature: IFeature, isEnabled: boolean, organizationId?: string): FeatureToggleRequest {
    if (!feature.id) {
      throw new Error(`Feature "${feature.code}" is missing an id`)
    }

    return {
      featureId: feature.id,
      feature,
      isEnabled,
      ...(organizationId ? { organizationId } : {})
    }
  }

  enabledFeature(row: IFeature) {
    const featureOrganizationById = this.featureToggles().find(
      (featureOrganization: IFeatureOrganization) => featureOrganization.featureId === row.id
    )
    if (featureOrganizationById) {
      return featureOrganizationById.isEnabled
    }

    const featureOrganizationsByCode = this.featureToggles().filter(
      (featureOrganization: IFeatureOrganization) => featureOrganization.feature.code === row.code
    )
    const featureOrganization =
      featureOrganizationsByCode.find((featureOrganization) => featureOrganization.feature.parentId) ??
      featureOrganizationsByCode[0]
    if (featureOrganization) {
      return featureOrganization.isEnabled
    }

    // const featureToggle = this.featureTogglesDefinitions.find((item: IFeatureToggle) => item.code == row.code)
    // if (featureToggle) {
    //   return featureToggle.enabled
    // }

    return false
  }

  hasChildFeatures(feature: IFeature) {
    return this.childFeaturesForParent(feature).some((childFeature) => this.matchesCurrentFeatureScope(childFeature))
  }

  featureCheckboxChecked(feature: IFeature) {
    if (!this.hasChildFeatures(feature)) {
      return this.enabledFeature(feature)
    }

    const childFeatures = this.childFeaturesForParent(feature).filter((childFeature) =>
      this.matchesCurrentFeatureScope(childFeature)
    )

    return childFeatures.length > 0 && childFeatures.every((childFeature) => this.enabledFeature(childFeature))
  }

  featureCheckboxIndeterminate(feature: IFeature) {
    const childFeatures = this.childFeaturesForParent(feature).filter((childFeature) =>
      this.matchesCurrentFeatureScope(childFeature)
    )

    if (!childFeatures.length) {
      return false
    }

    const enabledCount = childFeatures.filter((childFeature) => this.enabledFeature(childFeature)).length
    return enabledCount > 0 && enabledCount < childFeatures.length
  }

  featureGroupStatus(feature: IFeature): FeatureGroupStatus {
    if (this.featureCheckboxIndeterminate(feature)) {
      return 'partial'
    }

    return this.featureCheckboxChecked(feature) ? 'enabled' : 'disabled'
  }

  featureStatusBadgeClass(status: FeatureGroupStatus) {
    switch (status) {
      case 'enabled':
        return 'h-5 border-state-success-hover bg-state-success-hover/20 text-text-success'
      case 'partial':
        return 'h-5 border-state-warning-hover bg-state-warning-hover/20 text-text-warning'
      case 'disabled':
        return 'h-5 border-destructive/25 bg-destructive/10 text-destructive'
    }
  }

  setStatusFilter(value: unknown) {
    if (isFeatureStatusFilter(value)) {
      this.statusFilter.set(value)
    }
  }

  setGroupFilter(value: unknown) {
    if (typeof value === 'string') {
      this.groupFilter.set(value)
    }
  }

  allFeatures(features: readonly IFeature[] | null | undefined) {
    return (features ?? []).flatMap((feature) => {
      if (!this.matchesCurrentFeatureScope(feature)) {
        return []
      }

      const childFeatures = this.childFeaturesForParent(feature).filter((childFeature) =>
        this.matchesCurrentFeatureScope(childFeature)
      )

      return childFeatures.length > 0 ? childFeatures : [feature]
    })
  }

  groupFilterOptions(features: readonly IFeature[] | null | undefined) {
    return [
      { value: 'all', labelKey: 'PAC.Feature.Filters.AllGroups', labelDefault: 'All categories' },
      ...(features ?? [])
        .filter((feature) => this.matchesCurrentFeatureScope(feature))
        .map((feature) => ({
          value: feature.code,
          labelKey: `PAC.Feature.Features.${feature.code}.Name`,
          labelDefault: feature.name
        }))
    ]
  }

  summaryCards(features: readonly IFeature[] | null | undefined) {
    const featureGroups = (features ?? []).filter((feature) => this.matchesCurrentFeatureScope(feature))
    const allFeatures = this.allFeatures(features)
    const enabledCount = allFeatures.filter((feature) => this.enabledFeature(feature)).length

    return [
      {
        id: 'enabled',
        icon: 'circle-check',
        labelKey: 'PAC.Feature.Summary.Enabled',
        labelDefault: 'Enabled modules',
        value: enabledCount
      },
      {
        id: 'disabled',
        icon: 'circle-x',
        labelKey: 'PAC.Feature.Summary.Disabled',
        labelDefault: 'Disabled modules',
        value: allFeatures.length - enabledCount
      },
      {
        id: 'groups',
        icon: 'layers',
        labelKey: 'PAC.Feature.Summary.Groups',
        labelDefault: 'Feature groups',
        value: featureGroups.length
      },
      {
        id: 'items',
        icon: 'code',
        labelKey: 'PAC.Feature.Summary.Items',
        labelDefault: 'Feature items',
        value: allFeatures.length
      }
    ]
  }

  visibleFeatureGroups(features: readonly IFeature[] | null | undefined): FeatureGroupView[] {
    return (features ?? [])
      .filter((feature) => this.matchesCurrentFeatureScope(feature))
      .filter((feature) => this.groupFilter() === 'all' || this.groupFilter() === feature.code)
      .map((feature) => {
        const scopedChildFeatures = this.childFeaturesForParent(feature).filter((childFeature) =>
          this.matchesCurrentFeatureScope(childFeature)
        )
        const parentMatchesSearch = this.matchesSearchTerm(feature)
        const childFeatures = scopedChildFeatures.filter(
          (childFeature) =>
            this.matchesCurrentFeatureScope(childFeature) &&
            this.matchesStatusFilter(childFeature) &&
            (parentMatchesSearch || this.matchesSearchTerm(childFeature))
        )
        const parentMatches = this.matchesFilters(feature)

        return {
          id: feature.code,
          feature,
          deprecated: this.isDeprecatedFeature(feature),
          titleKey: `PAC.Feature.Features.${feature.code}.Name`,
          titleDefault: feature.name,
          descriptionKey: `PAC.Feature.Features.${feature.code}.Description`,
          descriptionDefault: feature.description,
          icon: this.featureIcon(feature),
          features: childFeatures,
          matchCount: scopedChildFeatures.length > 0 ? childFeatures.length : parentMatches ? 1 : 0
        }
      })
      .filter((group) => group.matchCount > 0)
  }

  filteredFeatureCount(features: readonly IFeature[] | null | undefined) {
    return this.visibleFeatureGroups(features).reduce((total, group) => total + group.matchCount, 0)
  }

  featureIcon(feature: IFeature) {
    switch (feature.code) {
      case FeatureEnum.FEATURE_HOME:
        return 'house'
      case FeatureEnum.FEATURE_DASHBOARD:
        return 'layout-dashboard'
      case FeatureEnum.FEATURE_ORGANIZATION:
      case FeatureEnum.FEATURE_ORGANIZATIONS:
        return 'corporate_fare'
      case FeatureEnum.FEATURE_USER:
      case FeatureEnum.FEATURE_USERS:
      case FeatureEnum.FEATURE_EMPLOYEES:
        return 'users'
      case FeatureEnum.FEATURE_USER_GROUPS:
        return 'group'
      case FeatureEnum.FEATURE_ROLES_PERMISSION:
        return 'shield'
      case FeatureEnum.FEATURE_SETTING:
        return 'settings'
      case FeatureEnum.FEATURE_FILE_STORAGE:
        return 'folder'
      case FeatureEnum.FEATURE_SMTP:
      case FeatureEnum.FEATURE_EMAIL_HISTORY:
      case FeatureEnum.FEATURE_EMAIL_TEMPLATE:
        return 'mail'
      case FeatureEnum.FEATURE_INTEGRATION:
        return 'hub'
      case 'GROUP_COPILOT':
      case AiFeatureEnum.FEATURE_COPILOT:
        return 'robot_2'
      case AiFeatureEnum.FEATURE_XPERT:
      case 'GROUP_XPERT':
        return 'sparkles'
      case AiFeatureEnum.FEATURE_XPERT_MARKETPLACE:
        return 'robot_2'
      case AiFeatureEnum.FEATURE_XPERT_CHATBI:
        return 'query_stats'
      case AnalyticsFeatures.FEATURE_MODEL:
        return 'database'
      case AnalyticsFeatures.FEATURE_STORY:
        return 'book-open-text'
      case AnalyticsFeatures.FEATURE_INDICATOR:
        return 'leaderboard'
      case AnalyticsFeatures.FEATURE_PROJECT:
        return 'workspaces'
      default:
        return 'extension'
    }
  }

  private childFeaturesForParent(feature: IFeature) {
    return feature.children ?? []
  }

  private matchesCurrentFeatureScope(feature: IFeature) {
    return matchesFeatureToggleScope(FEATURE_SCOPE_BY_CODE[feature.code] ?? 'dual-scope', !!this.isOrganization())
  }

  private isDeprecatedFeature(feature: IFeature) {
    return DEPRECATED_FEATURE_CODES.has(feature.code)
  }

  private matchesFilters(feature: IFeature) {
    return this.matchesStatusFilter(feature) && this.matchesSearchTerm(feature)
  }

  private matchesStatusFilter(feature: IFeature) {
    const statusFilter = this.statusFilter()
    const enabled = this.enabledFeature(feature)

    if (statusFilter === 'enabled' && !enabled) {
      return false
    }

    if (statusFilter === 'disabled' && enabled) {
      return false
    }

    return true
  }

  private matchesSearchTerm(feature: IFeature) {
    const term = this.searchText().trim().toLowerCase()

    if (!term) {
      return true
    }

    return [feature.code, feature.name, feature.description]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .some((value) => value.toLowerCase().includes(term))
  }
}
