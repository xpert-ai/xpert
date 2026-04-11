
import { Component, OnInit, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'

import { NgmCommonModule, NgmSelectModule } from '@xpert-ai/ocap-angular/common'
import { DensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmEntityPropertyComponent } from '../property/property.component'
import { Z_MODAL_DATA, ZardButtonComponent, ZardDialogModule, ZardDialogRef, ZardIconComponent, ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTooltipImports,
    ZardDialogModule,
    NgmCommonModule,
    NgmSelectModule,
    DensityDirective,
    NgmEntityPropertyComponent,
    ZardSwitchComponent
],
  selector: 'ngm-formatting',
  templateUrl: './formatting.component.html',
  styleUrls: ['./formatting.component.scss'],
  host: {
    class: 'ngm-dialog-container'
  }
})
export class NgmFormattingComponent implements OnInit {
  public data = inject(Z_MODAL_DATA)
  public dialogRef? = inject(ZardDialogRef<NgmFormattingComponent>)

  formGroup = new FormGroup({
    shortNumber: new FormControl<boolean>(false),
    decimal: new FormControl<number>(null),
    unit: new FormControl<string>(null),
    useUnderlyingUnit: new FormControl<boolean>(false),
    digitsInfo: new FormControl<string>(null)
  })

  ngOnInit(): void {
    if (this.data) {
      this.formGroup.patchValue(this.data)
    }
  }

  onApply() {
    this.dialogRef.close(this.formGroup.value)
  }
}
