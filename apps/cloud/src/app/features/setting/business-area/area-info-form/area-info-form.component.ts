import { Component, effect, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { BusinessAreasService, ToastrService } from '@metad/cloud/state'
import { pick } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardFormImports, ZardInputDirective } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { EditBusinessAreaComponent } from '../business-area/business-area.component'

@Component({
  standalone: true,
  selector: 'pac-area-info-form',
  templateUrl: './area-info-form.component.html',
  imports: [TranslateModule, ReactiveFormsModule, ...ZardFormImports, ZardInputDirective, ZardButtonComponent]
})
export class BusinessAreaInfoFormComponent {
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
    effect(() => {
      this.form.patchValue(this.businessAreaComponent.businessArea())
      this.form.markAsPristine()
    })
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
