import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { XpRemoteSelectComponent } from '@xpert-ai/headless-ui'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'

/**
 */
@Component({
  standalone: true,
  selector: 'xp-formly-remote-select',
  templateUrl: `select.type.html`,
  styleUrls: [`select.type.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'xp-formly-remote-select'
  },
  imports: [FormsModule, ReactiveFormsModule, FormlyModule, TranslateModule, XpRemoteSelectComponent]
})
export class XpFormlyRemoteSelectComponent extends FieldType {
  get valueFormControl() {
    return this.formControl as FormControl
  }
}
