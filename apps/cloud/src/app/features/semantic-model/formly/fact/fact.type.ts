import { A11yModule } from '@angular/cdk/a11y'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  OnInit,
  runInInjectionContext,
  signal
} from '@angular/core'
import { FormControl, FormsModule } from '@angular/forms'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { attrModel, bindFormControlToSignal, linkedModel } from '@metad/core'
import { NgmDisplayBehaviourComponent, NgmRadioSelectComponent } from '@metad/ocap-angular/common'
import { TSelectOption } from '@metad/ocap-angular/core'
import { Cube } from '@metad/ocap-core'
import { FieldType } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { Observable } from 'rxjs'
import { MODEL_TYPE } from '../../model/types'
import { TablesJoinComponent } from '../../tables-join'

/**
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    NgmRadioSelectComponent,
    NgmSelectComponent,
    NgmDisplayBehaviourComponent,
    TablesJoinComponent,
    A11yModule
  ],
  selector: 'ngm-formly-fact',
  templateUrl: `fact.type.html`,
  host: {
    class: 'ngm-formly-fact'
  },
  styleUrls: ['fact.type.scss']
})
export class NgmFactComponent extends FieldType implements OnInit {
  readonly injector = inject(Injector)
  readonly #destroyRef = inject(DestroyRef)

  readonly modelType = signal<MODEL_TYPE | null>(null)
  readonly selectOptions = computed(() => {
    const modelType = this.modelType()
    const options: TSelectOption[] = [
      {
        value: 'table',
        label: {
          en_US: 'Table',
          zh_Hans: '表'
        }
      }
    ]
    if (modelType === MODEL_TYPE.SQL) {
      options.push({
        value: 'tables',
        label: {
          en_US: 'Tables',
          zh_Hans: '多表'
        }
      })
    }
    options.push({
      value: 'view',
      label: {
        en_US: 'View',
        zh_Hans: '视图'
      }
    })
    return options
  })

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

  readonly tables = linkedModel({
    initialValue: null,
    compute: () => this.value()?.tables,
    update: (tables) => {
      this.value.update((state) => ({ ...(state ?? {}), tables }))
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

  // Props
  get options$() {
    return this.props['options$'] as Observable<
      {
        value: string
        label: string
      }[]
    >
  }
  get dataSource() {
    return this.props['dataSource'] as string
  }

  private cleanup?: () => void

  constructor() {
    super()
    this.#destroyRef.onDestroy(() => {
      // Clean up subscription to prevent memory leaks
      this.cleanup?.()
    })

    afterNextRender(() => {
      this.modelType.set(this.props['modelType'] ?? null)
    })
  }

  ngOnInit(): void {
    runInInjectionContext(this.injector, () => {
      this.cleanup = bindFormControlToSignal(this.formControl as FormControl, this.value)
    })
  }

  addJoinTable(table: string) {
    this.tables.update((tables) => {
      const updatedTables = tables ? [...tables] : []
      updatedTables.push({ name: table, join: { type: 'Inner', fields: [] } })
      return updatedTables
    })
  }
}
