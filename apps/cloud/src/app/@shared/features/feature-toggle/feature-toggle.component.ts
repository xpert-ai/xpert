import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { AiFeatureEnum, AnalyticsFeatures, FeatureEnum, IFeature, IFeatureOrganization } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectRouteData } from 'ngxtension/inject-route-data'
import { of, pipe } from 'rxjs'
import { finalize, map, startWith, switchMap, tap } from 'rxjs/operators'
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
  ZardSwitchComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { FeatureService, FeatureStoreService, Store } from '../../../@core/services'
import { injectI18nService } from '../../i18n'

type FeatureStatusFilter = 'all' | 'enabled' | 'disabled'
type FeatureGroupFilter = string

interface FeatureGroupView {
  id: string
  feature: IFeature
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

function isFeatureStatusFilter(value: unknown): value is FeatureStatusFilter {
  return value === 'all' || value === 'enabled' || value === 'disabled'
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
    ZardSwitchComponent,
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

  readonly isOrganization = injectRouteData('isOrganization')

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

  featureChanged(isEnabled: boolean, feature: IFeature) {
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
      this.emitFeatureToggle({ feature, isEnabled: !!isEnabled })
    ).subscribe()
  }

  emitFeatureToggle({ feature, isEnabled }: { feature: IFeature; isEnabled: boolean }) {
    const isOrganization = this.isOrganization()
    const organization = this.organization()
    const { id: featureId } = feature
    const request = {
      featureId,
      feature,
      isEnabled
    }
    if (organization && isOrganization) {
      const { id: organizationId } = organization
      request['organizationId'] = organizationId
    }
    return this._featureStoreService.changedFeature(request).pipe(
      tap(() => {
        window.location.reload()
      })
    )
  }

  enabledFeature(row: IFeature) {
    const featureOrganization = this.featureToggles().find(
      (featureOrganization: IFeatureOrganization) => featureOrganization.feature.code === row.code
    )
    if (featureOrganization) {
      return featureOrganization.isEnabled
    }

    // const featureToggle = this.featureTogglesDefinitions.find((item: IFeatureToggle) => item.code == row.code)
    // if (featureToggle) {
    //   return featureToggle.enabled
    // }

    return false
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
    return (features ?? []).flatMap((feature) => [feature, ...(feature.children ?? [])])
  }

  groupFilterOptions(features: readonly IFeature[] | null | undefined) {
    return [
      { value: 'all', labelKey: 'PAC.Feature.Filters.AllGroups', labelDefault: 'All categories' },
      ...(features ?? []).map((feature) => ({
        value: feature.code,
        labelKey: `PAC.Feature.Features.${feature.code}.Name`,
        labelDefault: feature.name
      }))
    ]
  }

  summaryCards(features: readonly IFeature[] | null | undefined) {
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
        value: (features ?? []).length
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
      .filter((feature) => this.groupFilter() === 'all' || this.groupFilter() === feature.code)
      .map((feature) => {
        const childFeatures = this.childFeaturesForParent(feature).filter((childFeature) =>
          this.matchesFilters(childFeature)
        )
        const parentMatches = this.matchesFilters(feature)

        return {
          id: feature.code,
          feature,
          titleKey: `PAC.Feature.Features.${feature.code}.Name`,
          titleDefault: feature.name,
          descriptionKey: `PAC.Feature.Features.${feature.code}.Description`,
          descriptionDefault: feature.description,
          icon: this.featureIcon(feature),
          features: childFeatures,
          matchCount: childFeatures.length + (parentMatches ? 1 : 0)
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
      case FeatureEnum.FEATURE_EMPLOYEES:
        return 'users'
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
      case AiFeatureEnum.FEATURE_COPILOT:
        return 'robot_2'
      case AiFeatureEnum.FEATURE_XPERT:
        return 'sparkles'
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

  private matchesFilters(feature: IFeature) {
    const term = this.searchText().trim().toLowerCase()
    const enabled = this.enabledFeature(feature)
    const statusFilter = this.statusFilter()

    if (statusFilter === 'enabled' && !enabled) {
      return false
    }

    if (statusFilter === 'disabled' && enabled) {
      return false
    }

    if (!term) {
      return true
    }

    return [feature.code, feature.name, feature.description]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .some((value) => value.toLowerCase().includes(term))
  }
}
