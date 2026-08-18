import { ChangeDetectionStrategy, Component, HostBinding } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { FieldType } from '@ngx-formly/core'
import { ColorInputFormat, XpColorInputComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-formly-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
  imports: [FormsModule, ReactiveFormsModule, XpColorInputComponent]
})
export class XpFormlyColorPickerComponent extends FieldType<any> {
  @HostBinding('class.xp-formly-color-picker') public _formlyColorPickerComponent = true

  format: ColorInputFormat = 'hex'
}
