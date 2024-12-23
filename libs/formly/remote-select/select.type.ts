import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmRemoteSelectComponent } from '@metad/ocap-angular/common'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'

/**
 */
@Component({
  standalone: true,
  selector: 'ngm-formly-remote-select',
  templateUrl: `select.type.html`,
  styleUrls: [`select.type.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ngm-formly-remote-select'
  },
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, TranslateModule, NgmRemoteSelectComponent]
})
export class NgmFormlyRemoteSelectComponent extends FieldType {
  get valueFormControl() {
    return this.formControl as FormControl
  }
}
