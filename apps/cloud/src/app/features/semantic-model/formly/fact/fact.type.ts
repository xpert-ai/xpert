import { CommonModule } from '@angular/common'
import { Component, inject, Injector, OnInit, runInInjectionContext, signal } from '@angular/core'
import { FormControl, FormsModule } from '@angular/forms'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { attrModel, bindFormControlToSignal, linkedModel } from '@metad/core'
import { NgmRadioSelectComponent } from '@metad/ocap-angular/common'
import { TSelectOption } from '@metad/ocap-angular/core'
import { Cube } from '@metad/ocap-core'
import { FieldType } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'

/**
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmRadioSelectComponent, NgmSelectComponent],
  selector: 'ngm-formly-fact',
  templateUrl: `fact.type.html`,
  host: {
    class: 'ngm-formly-fact'
  },
  styleUrls: ['fact.type.scss']
})
export class NgmFactComponent extends FieldType implements OnInit {
  readonly injector = inject(Injector)

  readonly selectOptions = signal<TSelectOption[]>([
    {
      value: 'table',
      label: {
        en_US: 'Table',
        zh_Hans: '表'
      }
    },
    {
      value: 'view',
      label: {
        en_US: 'View',
        zh_Hans: '视图'
      }
    }
  ])

  // Placeholder signal for form control value
  readonly value = signal<Cube['fact']>(null)

  readonly type = linkedModel({
    initialValue: null,
    compute: () => this.value()?.type,
    update: (type) => {
      this.value.update((state) => ({ ...(state ?? {}), type }))
    }
  })

  readonly table = linkedModel({
    initialValue: null,
    compute: () => this.value()?.table,
    update: (table) => {
      this.value.update((state) => ({ ...(state ?? {}), table }))
    }
  })

  readonly tableName = linkedModel({
    initialValue: null,
    compute: () => this.table()?.name,
    update: (name) => {
      this.table.update((state) => ({ ...(state ?? {}), name }))
    }
  })

  readonly view = linkedModel({
    initialValue: null,
    compute: () => this.value()?.view,
    update: (view) => {
      this.value.update((state) => ({ ...(state ?? {}), view }))
    }
  })

  readonly viewAlias = attrModel(this.view, 'alias')
  readonly viewSql = attrModel(this.view, 'sql')

  readonly sqlContent = attrModel(this.viewSql, 'content')

  private cleanup?: () => void

  ngOnInit(): void {
    runInInjectionContext(this.injector, () => {
      this.cleanup = bindFormControlToSignal(this.formControl as FormControl, this.value)
    })
  }

  ngOnDestroy(): void {
    // Clean up subscription to prevent memory leaks
    this.cleanup?.()
  }
}
