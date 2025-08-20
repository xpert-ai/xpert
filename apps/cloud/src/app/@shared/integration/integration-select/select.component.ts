import { CommonModule } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { IIntegration } from '../../../@core/types'
import { NgmSelectComponent } from '../../common'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmSelectComponent],
  selector: 'xp-integration-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class IntegrationSelectComponent {
  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)

  // Inputs
  readonly integrationList = input<IIntegration[]>()

  // States
  readonly selectOptions = computed(() => {
    return this.integrationList().map((integration) => ({
      value: integration.id,
      label: integration.name,
      description: integration.description,
    }))
  })

  readonly integration = this.cva.value$
}
