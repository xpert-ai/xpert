import { ChangeDetectionStrategy, Component, forwardRef } from '@angular/core'
import { FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { FieldType } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpColorsComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, XpColorsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-formly-colors',
  templateUrl: './colors.component.html',
  styleUrls: ['./colors.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => XpFormlyColorsComponent)
    }
  ]
})
export class XpFormlyColorsComponent extends FieldType<any> {}
