import { CommonModule } from '@angular/common'
import { Component, computed } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { I18nObject, TSelectOption } from '@cloud/app/@core'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { AbstractInterruptComponent } from '../../types'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmI18nPipe, NgmSelectComponent],
  selector: 'xp-agent-interrupt-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss']
})
export class XpAgentInterruptSelectComponent extends AbstractInterruptComponent<
  { select_options?: TSelectOption<string>[]; placeholder?: I18nObject },
  { url?: string }
> {
  readonly i18nService = injectI18nService()

  readonly placeholder = computed(() => this.data()?.placeholder || '')
  readonly selectOptions = computed(() => this.data()?.select_options || [])

  readonly selectedValue = linkedModel({
    initialValue: null,
    compute: () => this.value()?.url,
    update: (value) => this.value.set({ url: value })
  })
}
