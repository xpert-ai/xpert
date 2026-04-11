
import { ChangeDetectionStrategy, Component, forwardRef } from '@angular/core'
import { FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { FieldType } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmColorsComponent } from '@xpert-ai/components/form-field'

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, NgmColorsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-formly-colors',
  templateUrl: './colors.component.html',
  styleUrls: ['./colors.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => PacFormlyColorsComponent)
    }
  ]
})
export class PacFormlyColorsComponent extends FieldType<any> {}
