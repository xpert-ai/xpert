
import { Component, ElementRef, TemplateRef, ViewChild, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { BusinessAreasService } from '@xpert-ai/cloud/state'
import { NgmCommonModule, SplitterType } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { Subject, firstValueFrom } from 'rxjs'
import { IBusinessArea, ToastrService, routeAnimations } from '../../../@core'
import { AppService } from '../../../app.service'
import { BusinessAreasComponent } from './business-areas/areas.component'
import { SharedModule } from '../../../@shared/shared.module'
import { SharedUiModule } from '../../../@shared/ui.module'
import { ManageEntityBaseComponent } from '../../../@shared/directives'

import { ZardDialogService } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  selector: 'pac-business-area',
  templateUrl: './business-area.component.html',
  styleUrls: ['./business-area.component.scss'],
  animations: [routeAnimations],
  imports: [
    SharedModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    SharedUiModule,
    NgmCommonModule,
    BusinessAreasComponent
]
})
export class BusinessAreaComponent extends ManageEntityBaseComponent<IBusinessArea> {
  SplitterType = SplitterType
  
  readonly _dialog = inject(ZardDialogService)
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
