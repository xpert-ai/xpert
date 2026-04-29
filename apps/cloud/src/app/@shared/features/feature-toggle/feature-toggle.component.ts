import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { IFeature, IFeatureOrganization } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectRouteData } from 'ngxtension/inject-route-data'
import { of, pipe } from 'rxjs'
import { finalize, map, startWith, switchMap, tap } from 'rxjs/operators'
import { injectConfirm, ZardAccordionImports, ZardCheckboxComponent, ZardLoaderComponent } from '@xpert-ai/headless-ui'
import { environment } from '../../../../environments/environment'
import { FeatureService, FeatureStoreService, Store } from '../../../@core/services'
import { injectI18nService } from '../../i18n'

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
    CdkMenuModule,
    ...ZardAccordionImports,
    ZardCheckboxComponent,
    ZardLoaderComponent
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
}
