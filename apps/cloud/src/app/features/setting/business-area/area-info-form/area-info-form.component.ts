import { Component, effect, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { BusinessAreasService, ToastrService } from '@metad/cloud/state'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { pick } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { EditBusinessAreaComponent } from '../business-area/business-area.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'

@Component({
  standalone: true,
  selector: 'pac-area-info-form',
  templateUrl: './area-info-form.component.html',
  imports: [MaterialModule, TranslateModule, ReactiveFormsModule, NgmCommonModule]
})
export class BusinessAreaInfoFormComponent extends TranslationBaseComponent {
  private readonly businessAreasService = inject(BusinessAreasService)
  private readonly businessAreaComponent = inject(EditBusinessAreaComponent)
  private readonly _toastrService = inject(ToastrService)

  //Fields for the form
  public form = new FormGroup({
    id: new FormControl(null),
    name: new FormControl(null)
  })
  get model() {
    return this.form.value
  }

  constructor() {
    super()

    effect(() => {
      this.form.patchValue(this.businessAreaComponent.businessArea())
      this.form.markAsPristine()
    }, {allowSignalWrites: true})
  }

  async save() {
    try {
      await firstValueFrom(this.businessAreasService.update(this.model.id, pick(this.model, 'name')))
      this.businessAreaComponent.refresh()
      this._toastrService.success('PAC.BUSINESS_AREA.Update', { Default: 'Update' })
      this.form.markAsPristine()
    } catch (err) {
      this._toastrService.error('PAC.BUSINESS_AREA.Update', '', { Default: 'Update' })
    }
  }
}
