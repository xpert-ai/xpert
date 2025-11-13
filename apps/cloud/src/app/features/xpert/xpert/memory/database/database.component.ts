import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { OverlayAnimation1 } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { map, shareReplay } from 'rxjs'
import {
  injectToastr,
  injectTranslate,
  injectXpertTableAPI,
  IXpertTable,
  TSelectOption,
  TXpertTableColumn,
  XpertAPIService,
  XpertTableStatus
} from '../../../../../@core'
import { XpertComponent } from '../../xpert.component'
import { toSignal } from '@angular/core/rxjs-interop'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    NgmSpinComponent,
    NgmSelectComponent
  ],
  selector: 'xp-xpert-memory-database',
  templateUrl: './database.component.html',
  styleUrl: 'database.component.scss',
  animations: [OverlayAnimation1],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMemoryDatabaseComponent {
  eXpertTableStatus = XpertTableStatus

  readonly #translate = inject(TranslateService)
  readonly colI18n = injectTranslate('PAC.Xpert.MemoryCols')
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly xpertTableAPI = injectXpertTableAPI()
  readonly xpertService = inject(XpertAPIService)
  readonly xpertComponent = inject(XpertComponent)
  readonly #clipboard = inject(Clipboard)

  readonly xpertId = this.xpertComponent.paramId

  readonly #tablesResource = myRxResource({
    request: () => {
      return {
        xpertId: this.xpertId()
      }
    },
    loader: ({ request }) => {
      return request.xpertId
        ? this.xpertTableAPI.getAll({
            where: {
              xpertId: request.xpertId
            }
          })
        : null
    }
  })

  readonly tables = computed(() => this.#tablesResource.value()?.items || [])
  readonly #loading = signal(false)
  readonly loading = computed(() => this.#tablesResource.status() === 'loading' || this.#loading())

  readonly search = model<string>('')

  // Edit table
  readonly table = model<Partial<IXpertTable> | null>(null)
  readonly database = attrModel(this.table, 'database')
  readonly name = attrModel(this.table, 'name')
  readonly description = attrModel(this.table, 'description')
  readonly #schemasRs = myRxResource({
    request: () => ({
      databaseId: this.database()
    }),
    loader: ({ request }) => {
      if (request.databaseId) {
        return this.xpertTableAPI.getDatabaseSchemas(request.databaseId)
      }
      return null
    }
  })
  readonly schema = attrModel(this.table, 'schema')
  readonly columns = attrModel(this.table, 'columns')
  
  readonly schemasOptions = computed(() => {
    return (this.#schemasRs.value() || []).map((schema) => ({
      value: schema.name,
      label: schema.name
    }))
  })

  readonly types: TSelectOption[] = [
    {
      value: 'string',
      label: {
        en_US: 'String',
        zh_Hans: '字符串'
      }
    }
  ]

  readonly databases$ = this.xpertTableAPI.getDatabases().pipe(
    map((databases) => {
      return databases.map((db) => ({
        value: db.id,
        label: db.name
      }))
    }),
    shareReplay(1)
  )

  addTable() {
    this.table.set({
      name: ''
    })
  }

  addColumn() {
    const columns = [
      ...(this.table().columns ?? []),
      { name: '', label: '', type: 'string', required: false } as TXpertTableColumn
    ]
    this.table.update((v) => ({ ...v, columns }))
  }

  removeColumn(index: number) {
    const columns = [...(this.table().columns ?? [])]
    columns.splice(index, 1)
    this.table.update((v) => ({ ...v, columns }))
  }

  toggleRequired(index: number) {
    const columns = [...(this.table().columns ?? [])]
    columns[index].required = !columns[index].required
    this.table.update((v) => ({ ...v, columns }))
  }

  editTable(table: IXpertTable) {
    this.table.set({ ...table })
  }

  save() {
    this.#loading.set(true)
    if (!this.table().xpertId) {
      this.table.update((v) => ({ ...v, xpertId: this.xpertId() }))
    }
    this.xpertTableAPI.create(this.table()).subscribe({
      next: () => {
        this.#loading.set(false)
        this.#toastr.success(this.#translate.instant('PAC.Messages.CreatedSuccessfully', { Default: 'Created Successfully' }))
        this.#tablesResource.reload()
        this.table.set(null)
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.danger(err.message || err)
      }
    })
  }

  activate(tableId: string) {
    this.#loading.set(true)
    this.xpertTableAPI.activateTable(tableId).subscribe({
      next: () => {
        this.#loading.set(false)
        this.#toastr.success(this.#translate.instant('PAC.Xpert.MemoryMessages.TableActivationStarted', { Default: 'Table activation started' }))
        this.#tablesResource.reload()
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.danger(err.message || err)
      }
    })
  }
}
