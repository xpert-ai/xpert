
import { ChangeDetectionStrategy, Component, HostBinding } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ColorFormat } from '@ng-matero/extensions/colorpicker'
import { FieldType } from '@ngx-formly/material/form-field'
import { NgmColorInputComponent } from '@metad/components/form-field'
import { DensityDirective } from '@metad/ocap-angular/core'

@Component({
  standalone: true,
  selector: 'pac-formly-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
  imports: [FormsModule, ReactiveFormsModule, NgmColorInputComponent, DensityDirective]
})
export class PACFormlyColorPickerComponent extends FieldType<any> {
  @HostBinding('class.pac-formly-color-picker') public _formlyColorPickerComponent = true

  format: ColorFormat = 'hex'
}
