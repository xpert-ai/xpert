import { Component, DestroyRef, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute } from '@angular/router'
import { IFeature, IFeatureOrganization } from '@metad/contracts'
import { NgmCountdownConfirmationComponent } from '@metad/ocap-angular/common'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectRouteData } from 'ngxtension/inject-route-data'
import { of, pipe } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'
import { environment } from '../../../environments/environment'
import { FeatureService, FeatureStoreService, Store } from '../../@core/services'
import { TranslationBaseComponent } from '../language/translation-base.component'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MaterialModule } from '../material.module'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, MaterialModule],
  providers: [FeatureStoreService],
  selector: 'pac-feature-toggle',
  templateUrl: './feature-toggle.component.html',
  styleUrls: ['./feature-toggle.component.scss']
})
export class FeatureToggleComponent extends TranslationBaseComponent {
  private readonly _activatedRoute = inject(ActivatedRoute)
  private readonly _featureService = inject(FeatureService)
  private readonly _featureStoreService = inject(FeatureStoreService)
  private readonly _storeService = inject(Store)
  private readonly _matDialog = inject(MatDialog)
  readonly destroyRef = inject(DestroyRef)

  readonly isOrganization = injectRouteData('isOrganization')

  // loading = false
  readonly loading = signal(false)
  readonly featureToggles = signal([])
  // featureTogglesDefinitions: IFeatureToggle[] = []

  // public readonly isOrganization$ = this._activatedRoute.data.pipe(
  //   startWith(this._activatedRoute.snapshot.data),
  //   map((data) => data?.isOrganization),
  //   distinctUntilChanged(),
  //   takeUntilDestroyed(),
  //   shareReplay(1)
  // )
  readonly organization = toSignal(this._storeService.selectedOrganization$)

  readonly features$ = this._featureService.getParentFeatures(['children']).pipe(
    map(({ items }) => items),
  )
  // readonly features$ = this._featureService.getFeatureToggleDefinition()

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
    super()

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

  // ngOnInit(): void {

  //   combineLatest([this.featureTenant$, this.featureOrganizations$])
  //     .pipe(
  //       withLatestFrom(combineLatest([this.isOrganization$, this.organization$])),
  //       takeUntilDestroyed(this.destroyRef)
  //     )
  //     .subscribe(([[featureTenant, featureOrganizations], [isOrganization, organization]]) => {

  //     })

  //   this._storeService.featureToggles$
  //     .pipe(
  //       tap((toggles) => (this.featureTogglesDefinitions = toggles)),
  //       takeUntilDestroyed(this.destroyRef)
  //     )
  //     .subscribe()
  // }

  getFeatures() {
    this._featureStoreService.loadFeatures(['children']).pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }

  async featureChanged(isEnabled: boolean, feature: IFeature) {
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
