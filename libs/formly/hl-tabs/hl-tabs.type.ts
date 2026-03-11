import { CommonModule } from '@angular/common'
import { Component, computed, inject, Injector, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { ZardIconComponent } from '@xpert-ai/headless-ui'

/**
 * 
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ZardIconComponent, FormlyModule],
  selector: 'hl-formly-tabs',
  templateUrl: `hl-tabs.type.html`,
  host: {
    class: 'hl-formly-tabs'
  },
  styleUrls: ['hl-tabs.type.scss']
})
export class HLFormlyTabsComponent extends FieldType {
  readonly injector = inject(Injector)

  readonly tabIndex = signal(0)

  readonly tabField = computed(() => this.field.fieldGroup?.[this.tabIndex()])
}
