import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmCommonModule, NgmSelectModule } from '@metad/ocap-angular/common'
import { DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmEntityPropertyComponent } from '../property/property.component'
import { ZardButtonComponent, ZardIconComponent, ZardSwitchComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    MatTooltipModule,
    MatDialogModule,
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
  public data = inject(MAT_DIALOG_DATA)
  public dialogRef? = inject(MatDialogRef<NgmFormattingComponent>)

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
