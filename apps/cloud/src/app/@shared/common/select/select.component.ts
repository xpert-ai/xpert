import { CdkListboxModule, ListboxValueChangeEvent } from '@angular/cdk/listbox'
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { booleanAttribute, Component, computed, inject, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

/**
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkListboxModule,
    CdkMenuModule,
    NgmI18nPipe,
    NgmHighlightDirective
  ],
  selector: 'ngm-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class NgmSelectComponent {
  readonly httpClient = inject(HttpClient)
  protected cva = inject<NgxControlValueAccessor<any>>(NgxControlValueAccessor)
  readonly i18n = new NgmI18nPipe()

  readonly placeholder = input<string>()
  readonly selectOptions = input<TSelectOption[]>()
  readonly multiple = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly selectedOptions = computed(() => {
    return this.values()?.map((value) => this.selectOptions()?.find((_) => _.value === value))
  })

  readonly values = computed(() => {
    if (this.multiple()) {
      return this.cva.value$()
    } else {
      return this.cva.value$() ? [this.cva.value$()] : []
    }
  })

  selectValues(event: ListboxValueChangeEvent<unknown>) {
    if (this.multiple()) {
      this.cva.value$.set([...event.value])
    } else {
      this.cva.value$.set(event.value[0] ?? null)
    }
  }

  selectOption(trigger: CdkMenuTrigger, value: any) {
    if (!this.multiple()) {
      trigger.close()
    }
  }
}
