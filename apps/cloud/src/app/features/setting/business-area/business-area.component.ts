import { CommonModule } from '@angular/common'
import { Component, ElementRef, TemplateRef, ViewChild, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { BusinessAreasService } from '@metad/cloud/state'
import { NgmCommonModule, SplitterType } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { Subject, firstValueFrom } from 'rxjs'
import { IBusinessArea, ToastrService, routeAnimations } from '../../../@core'
import { AppService } from '../../../app.service'
import { BusinessAreasComponent } from './business-areas/areas.component'
import { SharedModule } from '../../../@shared/shared.module'
import { MaterialModule } from '../../../@shared/material.module'
import { ManageEntityBaseComponent } from '../../../@shared/directives'

@Component({
  standalone: true,
  selector: 'pac-business-area',
  templateUrl: './business-area.component.html',
  styleUrls: ['./business-area.component.scss'],
  animations: [routeAnimations],
  imports: [
    SharedModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MaterialModule,
    NgmCommonModule,

    BusinessAreasComponent
  ]
})
export class BusinessAreaComponent extends ManageEntityBaseComponent<IBusinessArea> {
  SplitterType = SplitterType
  
  readonly _dialog = inject(MatDialog)
  readonly appService = inject(AppService)
  readonly businessAreasStore = inject(BusinessAreasService)
  readonly toastrService = inject(ToastrService)

  @ViewChild('createTempl') private createTempl: TemplateRef<ElementRef>

  update$ = new Subject<void>()

  // Is mobile
  readonly isMobile = toSignal(this.appService.isMobile$)
  sideMenuOpened = !this.isMobile()

  async createBusinessArea(parent?: IBusinessArea) {
    try {
      const ba = await firstValueFrom(
        this.businessAreasStore.create({
          parentId: parent?.id
        })
      )

      this.update$.next()
      this.router.navigate(['./', ba.id], { relativeTo: this.route })

      return ba
    } catch (err) {
      this.toastrService.error(err)
    }
  }

  refresh() {
    this.update$.next()
  }
}
