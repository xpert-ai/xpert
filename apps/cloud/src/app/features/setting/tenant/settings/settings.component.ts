import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core'
import { isNil } from '@metad/ocap-core'
import { DataSourceTypesService } from '@metad/cloud/state'
import { TenantService, ToastrService } from '../../../../@core'

interface ItemData {
  id?: string
  name: string
  value: any
}

@Component({
  selector: 'pac-tenant-settings',
  templateUrl: 'settings.component.html',
  styles: [':host {display: block; width: 100%; padding: 1rem;}']
})
export class SettingsComponent implements OnInit {

  readonly dataSourceTypeAPI = inject(DataSourceTypesService)
  readonly #toastr = inject(ToastrService)

  i = 0
  editCache: { [key: string]: { edit: boolean; data: ItemData } } = {}

  listOfData: ItemData[] = []
  constructor(private readonly tenantService: TenantService, private readonly _cdr: ChangeDetectorRef) {}

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
    this._cdr.detectChanges()
  }

  updateEditCache(): void {
    this.listOfData.forEach((item) => {
      this.editCache[item.id] = {
        ...(this.editCache[item.id] ?? {edit: false}),
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
        this.#toastr.success('PAC.MESSAGE.DataSourceTypesSyncSuccess', {Default: 'DataSource Types synchronized successfully'})
      },
      error: (error) => {
        this.syncing.set(false)
        this.#toastr.error('PAC.MESSAGE.DataSourceTypesSyncError', error.message, {Default: 'DataSource Types synchronization failed'})
      }
    })
  }
}
