import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, inject, input } from '@angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TXpertParameter, XpertParameterTypeEnum } from '../../../@core'

@Component({
  standalone: true,
  selector: 'xpert-parameter-menu-item',
  templateUrl: './menu-item.component.html',
  styleUrl: 'menu-item.component.scss',
  imports: [CommonModule, FormsModule, TranslateModule],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertParameterMenuItemComponent {
  eXpertParameterTypeEnum = XpertParameterTypeEnum
  eDisplayBehaviour = DisplayBehaviour

  readonly type = input<XpertParameterTypeEnum>()
}
