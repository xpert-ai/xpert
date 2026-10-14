import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core'
import { isNil } from '@xpert-ai/contracts'
import { DataSourceTypesService } from '@cloud/app/@core/state'
import { TenantService, ToastrService } from '../../../../@core'

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
  editCache: { [key: string]: { edit: boolean; data: ItemData } } = {}

  listOfData: ItemData[] = []
  constructor(
    private readonly tenantService: TenantService,
    private readonly _cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    const settings = await this.tenantService.getSettings()
    Object.keys(settings)
      .filter((name) => !isNil(settings[name]))
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
        value: item?.value || ''
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
    this.editCache[id].edit = true
  }

  cancelEdit(id: string): void {
    const index = this.listOfData.findIndex((item) => item.id === id)
    this.editCache[id] = {
      data: { ...this.listOfData[index] },
      edit: false
    }
  }

  async saveEdit(id: string) {
    const index = this.listOfData.findIndex((item) => item.id === id)
    Object.assign(this.listOfData[index], this.editCache[id].data)
    this.editCache[id].edit = false

    await this.tenantService.saveSettings({
      [this.editCache[id].data.name]: this.editCache[id].data.value
    })
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
      this.editCache[item.id] = {
        ...(this.editCache[item.id] ?? { edit: false }),
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
