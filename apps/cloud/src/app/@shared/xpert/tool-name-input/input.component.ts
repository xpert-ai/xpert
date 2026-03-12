import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TranslateModule } from '@ngx-translate/core'
import { TOOL_NAME_REGEX } from '../../../@core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ...ZardTooltipImports, TranslateModule],
  selector: 'xpert-tool-name-input',
  templateUrl: 'input.component.html',
  styleUrls: ['input.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertToolNameInputComponent {
  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)

  readonly model = this.cva.value$

  readonly disabled = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly nameError = computed(() => {
    const name = this.model()
    const isValidName = TOOL_NAME_REGEX.test(name)
    return !name || !isValidName
  })
}
