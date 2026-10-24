import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core'
import { FormControl } from '@angular/forms'
import {
  COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
  COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
  MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
  MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
  isNil
} from '@xpert-ai/contracts'
import { DataSourceTypesService } from '@cloud/app/@core/state'
import { TenantService, ToastrService, getErrorMessage } from '../../../../@core'
import { jsonSyntaxValidator } from './setting-json-editor.component'

const retentionSettingNames = new Set<string>([
  COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
  COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
  MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
  MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING
])

interface ItemData {
  id?: string
  name: string
  value: any
}

@Component({
  standalone: false,
  selector: 'xp-tenant-settings',
  templateUrl: 'settings.component.html',
  host: { class: 'block w-full min-w-0' }
})
export class SettingsComponent implements OnInit {
  readonly dataSourceTypeAPI = inject(DataSourceTypesService)
  readonly #toastr = inject(ToastrService)

  pageIndex = 0
  pageSize = 20
  i = 0
  editCache: { [key: string]: { edit: boolean; data: ItemData; jsonControl?: FormControl<string>; saving?: boolean } } =
    {}

  listOfData: ItemData[] = []
  constructor(
    private readonly tenantService: TenantService,
    private readonly _cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    const settings = await this.tenantService.getSettings()
    Object.keys(settings)
      .filter((name) => !isNil(settings[name]) && !retentionSettingNames.has(name))
      .forEach((name) => {
        this.add({ name, value: settings[name] })
      })
    this._cdr.detectChanges()
  }

  add(item?: ItemData) {
    this.listOfData = [
      ...this.listOfData,
      {
        id: `${++this.i}`,
        name: item?.name || '',
        value: item?.value ?? ''
      }
    ]
    this.updateEditCache()
  }

  addNew(item?: ItemData) {
    this.add(item)
    this.pageIndex = Math.floor((this.listOfData.length - 1) / this.pageSize)
    this.startEdit(`${this.i}`)
  }

  startEdit(id: string): void {
    const draft = this.editCache[id]
    draft.edit = true
    try {
      const parsed: unknown = typeof draft.data.value === 'string' ? JSON.parse(draft.data.value) : draft.data.value
      if (parsed !== null && typeof parsed === 'object') {
        draft.jsonControl = new FormControl(JSON.stringify(parsed, null, 2), {
          nonNullable: true,
          validators: [jsonSyntaxValidator]
        })
      }
    } catch {
      // Plain text stays editable without imposing JSON syntax.
    }
  }

  editAsJson(id: string): void {
    const draft = this.editCache[id]
    draft.jsonControl = new FormControl(draft.data.value === '' ? '{}' : String(draft.data.value ?? '{}'), {
      nonNullable: true,
      validators: [jsonSyntaxValidator]
    })
  }

  cancelEdit(id: string): void {
    const index = this.listOfData.findIndex((item) => item.id === id)
    this.editCache[id] = {
      data: { ...this.listOfData[index] },
      edit: false
    }
  }

  async saveEdit(id: string) {
    const draft = this.editCache[id]
    if (draft.saving) return
    if (draft.jsonControl?.invalid) {
      draft.jsonControl.markAsTouched()
      this.#toastr.error('XP.SettingsValue.InvalidJson')
      return
    }
    const row = this.listOfData.find((item) => item.id === id)
    const data = { ...draft.data, value: draft.jsonControl?.value ?? draft.data.value }
    if (retentionSettingNames.has(data.name)) {
      this.#toastr.error('XP.MENU.TENANT.RETENTION_MANAGED_SETTING', undefined, {
        Default: 'Cleanup policies can only be configured under Data Management in the default tenant.'
      })
      return
    }

    try {
      draft.saving = true
      await this.tenantService.saveSettings({ [data.name]: data.value })
      Object.assign(row, data)
      draft.data = { ...data }
      draft.edit = false
      draft.jsonControl = undefined
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      draft.saving = false
      this._cdr.markForCheck()
    }
  }

  async deleteRow(id: string) {
    const index = this.listOfData.findIndex((item) => item.id === id)
    await this.tenantService.saveSettings({ [this.listOfData[index].name]: null })
    this.listOfData.splice(index, 1)
    this.listOfData = [...this.listOfData]
    this.pageIndex = Math.min(this.pageIndex, Math.max(0, Math.ceil(this.listOfData.length / this.pageSize) - 1))
    this._cdr.detectChanges()
  }

  updateEditCache(): void {
    this.listOfData.forEach((item) => {
      this.editCache[item.id] ??= {
        edit: false,
        data: { ...item }
      }
    })
  }

  // DataSource Types Sync
  readonly syncing = signal(false)
  syncDataSourceTypes() {
    this.syncing.set(true)
    this.dataSourceTypeAPI.sync().subscribe({
      next: () => {
        this.syncing.set(false)
        this.#toastr.success('XP.MESSAGE.DataSourceTypesSyncSuccess', {
          Default: 'DataSource Types synchronized successfully'
        })
      },
      error: (error) => {
        this.syncing.set(false)
        this.#toastr.error('XP.MESSAGE.DataSourceTypesSyncError', error.message, {
          Default: 'DataSource Types synchronization failed'
        })
      }
    })
  }
}
