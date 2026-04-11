import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'

import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core'
import { injectXpertTableAPI } from '@cloud/app/@core'
import { IXpertTable } from '@xpert-ai/contracts'
import { myRxResource } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

export type SelectDatabaseOrder = 'createdAt' | 'updatedAt' | 'name'

export interface SelectDatabaseFilters {
  search: string
  collection: string
  owner: string
  order: SelectDatabaseOrder
}

export interface SelectDatabaseNavItem {
  value: string
  label: string
  icon: string
  description?: string
}

export interface SelectDatabaseFilterOption<T extends string = string> {
  value: T
  label: string
}

const DEFAULT_NAV_ITEMS: SelectDatabaseNavItem[] = [
  {
    value: 'all',
    label: 'All Databases',
    icon: 'ri-database-2-line'
  },
  {
    value: 'workspace',
    label: 'Workspace Databases',
    icon: 'ri-archive-stack-line',
    description: 'Databases from the current workspace'
  }
]

const DEFAULT_OWNER_OPTIONS: SelectDatabaseFilterOption[] = [
  {
    value: 'all',
    label: 'Everyone'
  },
  {
    value: 'me',
    label: 'Created by me'
  }
]

const DEFAULT_ORDER_OPTIONS: SelectDatabaseFilterOption<SelectDatabaseOrder>[] = [
  {
    value: 'createdAt',
    label: 'Created time'
  },
  {
    value: 'updatedAt',
    label: 'Updated time'
  },
  {
    value: 'name',
    label: 'Name'
  }
]

@Component({
  selector: 'xp-workspace-select-database',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './select-database.component.html',
  styleUrls: ['./select-database.component.scss']
})
export class WorkspaceSelectDatabaseComponent {
  // Injectors
  readonly dialogRef = inject(DialogRef)
  readonly xpertTableAPI = injectXpertTableAPI()

  // Inputs
  readonly _data = inject<{workspaceId: string}>(DIALOG_DATA)
  
  // Resources
  readonly workspaceId = signal<string>(this._data.workspaceId)
  readonly #tableResource = myRxResource({
    request: () => ({
      workspaceId: this.workspaceId()
    }),
    loader: ({request}) => {
      return request.workspaceId ? this.xpertTableAPI.getAll({
        where: {
          workspaceId: request.workspaceId
        }
      }) : null
    }
  })
  readonly tables = computed(() => this.#tableResource.value()?.items ?? [])
  readonly tablesLoading = computed(() => this.#tableResource.status() === 'loading')

  readonly #databaseResource = myRxResource({
    request: () => ({}),
    loader: ({request}) => {
      return this.xpertTableAPI.getDatabases()
    }
  })
  readonly databases = computed(() => this.#databaseResource.value())
  readonly navItems = computed(() => {
    const items = [...DEFAULT_NAV_ITEMS]
    this.databases()?.forEach((element) => {
      items.push({
        value: element.id,
        label: element.name,
        icon: 'ri-database-2-line',
        description: element.name
      })
    })
    return items
  })

  readonly title = input('Select Database')
  readonly description = input('Select a database resource to connect')
  readonly loading = computed(() => this.tablesLoading())
  readonly hasMore = input(false)
  readonly emptyHint = input('No more items')
  readonly ownerOptions = input<SelectDatabaseFilterOption[]>(DEFAULT_OWNER_OPTIONS)
  readonly orderOptions = input<SelectDatabaseFilterOption<SelectDatabaseOrder>[]>(DEFAULT_ORDER_OPTIONS)

  // UI State
  readonly searchTerm = signal('')
  readonly selectedNav = signal(DEFAULT_NAV_ITEMS[0].value)
  readonly selectedOwner = signal(DEFAULT_OWNER_OPTIONS[0].value)
  readonly selectedOrder = signal<SelectDatabaseOrder>('createdAt')
  readonly filterPanel = signal<'owner' | 'order' | null>(null)

  // Outputs for parent integrations
  readonly closed = output<void>()
  readonly filterChanged = output<SelectDatabaseFilters>()
  // readonly databaseSelected = output<IXpertTable>()
  readonly createRequested = output<void>()
  readonly refreshRequested = output<void>()
  readonly loadMoreRequested = output<void>()

  readonly filters = computed<SelectDatabaseFilters>(() => ({
    search: this.searchTerm(),
    collection: this.selectedNav(),
    owner: this.selectedOwner(),
    order: this.selectedOrder()
  }))

  readonly selectedCollectionLabel = computed(
    () => this.navItems()?.find((item) => item.value === this.selectedNav())?.label ?? DEFAULT_NAV_ITEMS[0].label
  )
  readonly selectedOwnerLabel = computed(
    () => this.ownerOptions()?.find((option) => option.value === this.selectedOwner())?.label ?? DEFAULT_OWNER_OPTIONS[0].label
  )
  readonly selectedOrderLabel = computed(
    () => this.orderOptions()?.find((option) => option.value === this.selectedOrder())?.label ?? DEFAULT_ORDER_OPTIONS[0].label
  )

  readonly filteredDatabases = computed(() => {
    const term = this.searchTerm().trim().toLowerCase()
    const selectedCollection = this.selectedNav()
    return this.tables().filter((table) => {
      const dbName = table.database?.toLowerCase()
      const matchesTerm =
        !term ||
        table.name?.toLowerCase().includes(term) ||
        table.description?.toLowerCase().includes(term) ||
        dbName?.includes(term)

      const matchesCollection = selectedCollection === 'all' || table.database === selectedCollection || table.workspaceId === selectedCollection

      return matchesTerm && matchesCollection
    })
  })

  constructor() {
    effect(
      () => {
        const navItems = this.navItems()
        if (navItems?.length && !navItems.find((item) => item.value === this.selectedNav())) {
          this.selectedNav.set(navItems[0].value)
        }

        const owners = this.ownerOptions()
        if (owners?.length && !owners.find((item) => item.value === this.selectedOwner())) {
          this.selectedOwner.set(owners[0].value)
        }

        const orders = this.orderOptions()
        if (orders?.length && !orders.find((item) => item.value === this.selectedOrder())) {
          this.selectedOrder.set(orders[0].value)
        }

        this.filterChanged.emit(this.filters())
      }
    )
  }

  trackByTable(_index: number, table: IXpertTable) {
    return table.id ?? table.name
  }

  onOverlayClick() {
    this.close()
  }

  close() {
    this.dialogRef.close()
    this.closed.emit()
  }

  selectNav(value: string) {
    this.selectedNav.set(value)
  }

  updateSearch(term: string) {
    this.searchTerm.set(term)
  }

  toggleFilter(panel: 'owner' | 'order') {
    this.filterPanel.update((current) => (current === panel ? null : panel))
  }

  pickOwner(value: string) {
    this.selectedOwner.set(value)
    this.filterPanel.set(null)
  }

  pickOrder(value: SelectDatabaseOrder) {
    this.selectedOrder.set(value)
    this.filterPanel.set(null)
  }

  selectDatabase(table: IXpertTable) {
    this.dialogRef.close(table)
    // this.databaseSelected.emit(table)
  }

  requestCreate() {
    this.createRequested.emit()
  }

  requestRefresh() {
    this.refreshRequested.emit()
  }

  requestLoadMore() {
    if (this.loading()) {
      return
    }
    this.loadMoreRequested.emit()
  }
}
