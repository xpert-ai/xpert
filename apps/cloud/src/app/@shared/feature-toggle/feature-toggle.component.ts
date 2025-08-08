import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, DestroyRef, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatDialog } from '@angular/material/dialog'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { IFeature, IFeatureOrganization } from '@metad/contracts'
import { NgmCountdownConfirmationComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectRouteData } from 'ngxtension/inject-route-data'
import { of, pipe } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'
import { environment } from '../../../environments/environment'
import { FeatureService, FeatureStoreService, Store } from '../../@core/services'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    CdkMenuModule,
    MatExpansionModule,
    MatSlideToggleModule,
    MatListModule,
    MatCheckboxModule,
    MatProgressSpinnerModule
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
  private readonly _matDialog = inject(MatDialog)
  readonly destroyRef = inject(DestroyRef)

  readonly isOrganization = injectRouteData('isOrganization')

  // loading = false
  readonly loading = signal(false)
  readonly featureToggles = signal([])

  readonly organization = toSignal(this._storeService.selectedOrganization$)

  readonly features$ = this._featureService.getParentFeatures(['children']).pipe(map(({ items }) => items))

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

  constructor() {
    this.loading.set(true)
    effect(
      () => {
        const isOrganization = this.isOrganization()
        const organization = this.organization()
        const featureTenant = this.featureTenant()
        const featureOrganizations = this.featureOrganizations()
        if (isOrganization && organization) {
          this._storeService.featureOrganizations = featureOrganizations
        }

        let featureToggles = []
        if (isOrganization && organization) {
          featureToggles = [...featureOrganizations]
        }

        featureTenant.forEach((item) => {
          if (!featureToggles.find((toggle) => toggle.featureId === item.featureId)) {
            featureToggles.push(item)
          }
        })

        this.featureToggles.set(featureToggles)

        this.loading.set(false)
      },
      { allowSignalWrites: true }
    )
  }

  getFeatures() {
    this._featureStoreService.loadFeatures(['children']).pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }

  featureChanged(isEnabled: boolean, feature: IFeature) {
    this._matDialog
      .open(NgmCountdownConfirmationComponent, {
        data: {
          recordType: feature.description,
          isEnabled: isEnabled
        }
      })
      .afterClosed()
      .pipe(
        switchMap((result) => {
          if (result) {
            return this.emitFeatureToggle({ feature, isEnabled: !!isEnabled })
          }
        })
      )
      .subscribe()
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
        if (!environment.IS_ELECTRON) {
          window.location.reload()
        }
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
