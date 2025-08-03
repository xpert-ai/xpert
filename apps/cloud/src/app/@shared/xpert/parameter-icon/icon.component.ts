import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { XpertParameterTypeEnum } from '../../../@core'

@Component({
  standalone: true,
  selector: 'xpert-parameter-icon',
  templateUrl: './icon.component.html',
  styleUrl: 'icon.component.scss',
  imports: [CommonModule, FormsModule, TranslateModule],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertParameterIconComponent {
  eXpertParameterTypeEnum = XpertParameterTypeEnum
  eDisplayBehaviour = DisplayBehaviour

  readonly type = input<XpertParameterTypeEnum>()
}
