import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router } from '@angular/router'
import { BusinessAreasService } from '@metad/cloud/state'
import { NgmConfirmDeleteComponent, TreeTableModule } from '@metad/ocap-angular/common'
import { DisplayDensity, OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { shareReplay, switchMap, tap } from 'rxjs/operators'
import { IBusinessArea, ToastrService, routeAnimations } from '../../../../@core/index'
import { BusinessAreaComponent } from '../business-area.component'
import { InlineSearchComponent } from 'apps/cloud/src/app/@shared/form-fields'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'

@Component({
  standalone: true,
  selector: 'pac-business-areas',
  templateUrl: './areas.component.html',
  styleUrls: ['./areas.component.scss'],
  animations: [routeAnimations],
  imports: [
    MaterialModule,
    SharedModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,

    InlineSearchComponent,

    // OCAP Modules
    OcapCoreModule,
    TreeTableModule
  ]
})
export class BusinessAreasComponent {
  DisplayDensity = DisplayDensity

  private readonly businessAreaComponent = inject(BusinessAreaComponent)
  private readonly businessAreasStore = inject(BusinessAreasService)
  private readonly _toastrService = inject(ToastrService)
  private readonly _dialog = inject(MatDialog)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)

  loading = false
  private refresh$ = new BehaviorSubject<void>(null)
  public readonly groupTree$ = this.refresh$.pipe(
    tap(() => (this.loading = true)),
    switchMap(() => this.businessAreasStore.getGroupsTree()),
    tap(() => (this.loading = false)),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  private updateSub = this.businessAreaComponent.update$.pipe(takeUntilDestroyed()).subscribe(() => this.refresh())

  editBusinessArea(area?: IBusinessArea) {
    this.router.navigate(['./', area.id], { relativeTo: this.route })
  }

  async addBusinessArea(parent?: IBusinessArea) {
    const area = await this.businessAreaComponent.createBusinessArea(parent)
    if (area) {
      this.refresh$.next()
    }
  }

  async deleteBusinessArea(item: IBusinessArea) {
    const cofirm = await firstValueFrom(
      this._dialog.open(NgmConfirmDeleteComponent, { data: { value: item.name } }).afterClosed()
    )
    if (!cofirm) {
      return
    }

    try {
      await firstValueFrom(this.businessAreasStore.delete(item.id))
      this._toastrService.success('PAC.BUSINESS_AREA.Delete', { Default: 'Delete' })
      this.refresh$.next()
    } catch (err) {
      this._toastrService.error('PAC.BUSINESS_AREA.Delete', '', { Default: 'Delete' })
    }
  }

  refresh() {
    this.refresh$.next()
  }
}
