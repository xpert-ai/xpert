import { Component, OnDestroy, computed, effect, inject } from '@angular/core'
import { BusinessAreasService } from '@metad/cloud/state'
import { BusinessType } from '@metad/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { computedAsync } from 'ngxtension/computed-async'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, EMPTY, catchError, switchMap } from 'rxjs'
import { BusinessAreaInfoFormComponent } from '../area-info-form/area-info-form.component'
import { BusinessAreaUsersComponent } from '../area-users/area-users.component'
import { BusinessAreaComponent } from '../business-area.component'

@Component({
  standalone: true,
  selector: 'pac-edit-business-area',
  templateUrl: './business-area.component.html',
  styleUrls: ['./business-area.component.scss'],
  imports: [MaterialModule, TranslateModule, BusinessAreaInfoFormComponent, BusinessAreaUsersComponent]
})
export class EditBusinessAreaComponent implements OnDestroy {
  BUSINESS_AREA_TYPE = BusinessType

  private businessAreasService = inject(BusinessAreasService)
  private businessAreaComponent = inject(BusinessAreaComponent)

  readonly params = injectParams()

  readonly refresh$ = new BehaviorSubject<void>(null)
  businessArea = computedAsync(() => {
    // will use switchMap under the hood by default
    const { id } = this.params() // will recompute when queryParams change
    return this.refresh$.pipe(switchMap(() => this.businessAreasService.getById(id)), catchError((err) => EMPTY)) // getData is a method that returns an Observable
  }) // returns a signal

  readonly businessAreaId = computed(() => this.params()?.id)

  public readonly name = computed(() => this.businessArea()?.name)

  constructor() {
    effect(
      () => {
        if (this.businessArea()) {
          this.businessAreaComponent.setCurrentLink(this.businessArea())
        }
      },
      { allowSignalWrites: true }
    )
  }

  refresh() {
    this.refresh$.next()
    this.businessAreaComponent.refresh()
  }

  ngOnDestroy(): void {
    this.businessAreaComponent.setCurrentLink(null)
  }
}
