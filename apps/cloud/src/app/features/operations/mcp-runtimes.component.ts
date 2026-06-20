import { CommonModule } from '@angular/common'
import { Component, OnInit, computed, inject, signal } from '@angular/core'
import {
  McpRuntimeListFilter,
  McpRuntimeListOptions,
  McpRuntimeService,
  McpRuntimeStatus,
  McpStdioRuntimeSnapshot,
  getErrorMessage,
  injectToastr
} from '@cloud/app/@core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardSelectImports,
  ZardTableImports,
  type ZardSelectValue,
  type ZardTableSortDirection
} from '@xpert-ai/headless-ui'
import { NgmSpinComponent, injectConfirmDelete } from '@xpert-ai/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'

type RuntimeStatusFilter = McpRuntimeStatus | 'active' | 'all'
type RuntimeFilterKey = 'workspaceId' | 'toolsetId' | 'pluginName' | 'executionId' | 'appInstanceId'
type RuntimeSortKey = 'runtime' | 'status' | 'plugin' | 'scope' | 'process' | 'relations' | 'startedAt' | 'closeReason'

const ACTIVE_STATUSES = new Set<McpRuntimeStatus>(['starting', 'running'])
const ALL_FILTER_VALUE = '__all__'
const RUNTIME_STATUS_FILTERS = new Set<RuntimeStatusFilter>([
  'active',
  'all',
  'starting',
  'running',
  'failed',
  'closing',
  'closed'
])
const EMPTY_FILTER_OPTIONS: McpRuntimeListOptions = {
  workspaces: [],
  toolsets: [],
  plugins: [],
  executions: [],
  appInstances: []
}
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

@Component({
  standalone: true,
  selector: 'xp-mcp-runtimes',
  imports: [
    CommonModule,
    TranslateModule,
    NgmSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ...ZardCardImports,
    ...ZardSelectImports,
    ...ZardTableImports
  ],
  templateUrl: './mcp-runtimes.component.html',
  host: {
    class: 'block h-full w-full min-w-0 flex-1'
  }
})
export class McpRuntimesComponent implements OnInit {
  readonly #runtimeService = inject(McpRuntimeService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly confirmDelete = injectConfirmDelete()
  readonly allFilterValue = ALL_FILTER_VALUE

  readonly workspaceId = signal('')
  readonly toolsetId = signal('')
  readonly pluginName = signal('')
  readonly executionId = signal('')
  readonly appInstanceId = signal('')
  readonly statusFilter = signal<RuntimeStatusFilter>('active')

  readonly runtimes = signal<McpStdioRuntimeSnapshot[]>([])
  readonly filterOptions = signal<McpRuntimeListOptions>(EMPTY_FILTER_OPTIONS)
  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly stoppingRuntimeId = signal<string | null>(null)
  readonly killing = signal(false)
  readonly lastLoadedAt = signal<Date | null>(null)
  readonly sortState = signal<{ active: RuntimeSortKey | null; direction: ZardTableSortDirection }>({
    active: 'startedAt',
    direction: 'desc'
  })

  readonly listFilter = computed<McpRuntimeListFilter>(() => ({
    workspaceId: this.workspaceId().trim() || undefined,
    toolsetId: this.toolsetId().trim() || undefined,
    pluginName: this.pluginName().trim() || undefined,
    executionId: this.executionId().trim() || undefined,
    appInstanceId: this.appInstanceId().trim() || undefined,
    ...(this.statusFilter() === 'active'
      ? { activeOnly: true }
      : this.statusFilter() === 'all'
        ? { status: 'all' as const }
        : { status: this.statusFilter() as McpRuntimeStatus })
  }))

  readonly hasApiFilters = computed(() => {
    const filter = this.listFilter()
    return Boolean(
      filter.workspaceId ||
      filter.toolsetId ||
      filter.pluginName ||
      filter.executionId ||
      filter.appInstanceId ||
      filter.activeOnly ||
      (filter.status && filter.status !== 'all')
    )
  })

  readonly filteredRuntimes = computed(() => {
    const status = this.statusFilter()
    return this.runtimes().filter((runtime) => {
      if (status === 'all') {
        return true
      }
      if (status === 'active') {
        return ACTIVE_STATUSES.has(runtime.status)
      }
      return runtime.status === status
    })
  })

  readonly sortedRuntimes = computed(() => {
    const rows = [...this.filteredRuntimes()]
    const { active, direction } = this.sortState()
    if (!active || !direction) {
      return rows
    }
    const multiplier = direction === 'asc' ? 1 : -1
    return rows.sort(
      (left, right) => this.compareValues(this.sortValue(left, active), this.sortValue(right, active)) * multiplier
    )
  })

  readonly activeCount = computed(() => this.runtimes().filter((runtime) => ACTIVE_STATUSES.has(runtime.status)).length)
  readonly failedCount = computed(() => this.runtimes().filter((runtime) => runtime.status === 'failed').length)
  readonly closedCount = computed(() => this.runtimes().filter((runtime) => runtime.status === 'closed').length)
  readonly actionableCount = computed(() => this.filteredRuntimes().filter((runtime) => this.canStop(runtime)).length)

  ngOnInit() {
    void this.refresh()
  }

  async refresh() {
    this.loading.set(true)
    this.error.set(null)
    try {
      const response = await firstValueFrom(this.#runtimeService.list(this.listFilter()))
      this.runtimes.set(response.items ?? [])
      this.filterOptions.set(response.options ?? EMPTY_FILTER_OPTIONS)
      this.lastLoadedAt.set(new Date())
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  clearFilters() {
    this.workspaceId.set('')
    this.toolsetId.set('')
    this.pluginName.set('')
    this.executionId.set('')
    this.appInstanceId.set('')
    this.statusFilter.set('active')
    void this.refresh()
  }

  setFilter(key: RuntimeFilterKey, value: ZardSelectValue | ZardSelectValue[]) {
    const selected = this.selectValue(value)
    switch (key) {
      case 'workspaceId':
        this.workspaceId.set(selected)
        break
      case 'toolsetId':
        this.toolsetId.set(selected)
        break
      case 'pluginName':
        this.pluginName.set(selected)
        break
      case 'executionId':
        this.executionId.set(selected)
        break
      case 'appInstanceId':
        this.appInstanceId.set(selected)
        break
    }
  }

  setStatusFilter(value: ZardSelectValue | ZardSelectValue[]) {
    const selected = this.selectValue(value)
    if (RUNTIME_STATUS_FILTERS.has(selected as RuntimeStatusFilter)) {
      this.statusFilter.set(selected as RuntimeStatusFilter)
    }
  }

  filterSelectValue(value: string) {
    return value || ALL_FILTER_VALUE
  }

  onSortChange(columnName: RuntimeSortKey, direction: ZardTableSortDirection) {
    this.sortState.set({
      active: direction ? columnName : null,
      direction
    })
  }

  sortDirection(columnName: RuntimeSortKey): ZardTableSortDirection {
    const sortState = this.sortState()
    return sortState.active === columnName ? sortState.direction : ''
  }

  ariaSort(columnName: RuntimeSortKey) {
    const direction = this.sortDirection(columnName)
    return direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
  }

  stopRuntime(runtime: McpStdioRuntimeSnapshot) {
    if (!this.canStop(runtime)) {
      return
    }
    this.confirmDelete(
      {
        title: this.t('PAC.Operations.StopMcpRuntimeTitle', 'Stop MCP runtime'),
        information: this.t(
          'PAC.Operations.StopMcpRuntimeConfirm',
          'Stop runtime {{id}} for server "{{serverName}}"?',
          {
            id: runtime.id,
            serverName: runtime.serverName
          }
        )
      },
      () => {
        this.stoppingRuntimeId.set(runtime.id)
        return this.#runtimeService.stop(runtime.id)
      }
    ).subscribe({
      next: (result) => {
        const stopped = (result as { stopped?: boolean }).stopped === true
        this.stoppingRuntimeId.set(null)
        if (stopped) {
          this.#toastr.success(this.t('PAC.Operations.McpRuntimeStopped', 'MCP runtime stopped'))
        } else {
          this.#toastr.error(
            this.t('PAC.Operations.McpRuntimeNotFoundOrClosed', 'MCP runtime was not found or already closed')
          )
        }
        void this.refresh()
      },
      error: (error) => {
        this.stoppingRuntimeId.set(null)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  killMatching() {
    const filter = this.listFilter()
    const scope = this.killScopeLabel(filter)
    this.confirmDelete(
      {
        title: this.t('PAC.Operations.KillMcpRuntimesTitle', 'Kill MCP runtimes'),
        information: this.t('PAC.Operations.KillMcpRuntimesConfirm', 'Stop all MCP runtimes matching {{scope}}?', {
          scope
        })
      },
      () => {
        this.killing.set(true)
        return this.#runtimeService.kill(filter)
      }
    ).subscribe({
      next: (result) => {
        const stopped = (result as { stopped?: number }).stopped ?? 0
        this.killing.set(false)
        this.#toastr.success(
          this.t('PAC.Operations.McpRuntimeStoppedCount', 'Stopped {{count}} MCP runtime(s)', { count: stopped })
        )
        void this.refresh()
      },
      error: (error) => {
        this.killing.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  canStop(runtime: McpStdioRuntimeSnapshot) {
    return runtime.live === true && ACTIVE_STATUSES.has(runtime.status)
  }

  statusLabel(status: McpRuntimeStatus) {
    return this.t(`PAC.Operations.RuntimeStatus.${status}`, status)
  }

  statusClass(status: McpRuntimeStatus) {
    switch (status) {
      case 'running':
        return 'border-state-success-hover bg-state-success-hover/20 text-text-success'
      case 'starting':
        return 'border-divider-regular bg-components-input-bg-normal text-text-info'
      case 'failed':
        return 'border-text-destructive bg-status-error-bg text-text-destructive'
      case 'closing':
        return 'border-text-warning bg-background-default-subtle text-text-warning'
      case 'closed':
      default:
        return 'border-divider-regular bg-background-default-subtle text-text-tertiary'
    }
  }

  runtimeTitle(runtime: McpStdioRuntimeSnapshot) {
    return runtime.toolsetName || runtime.toolsetId || runtime.serverName
  }

  friendlyId(value?: string | null, head = 8, tail = 6) {
    if (!value) {
      return '-'
    }
    if (value.length <= head + tail + 3) {
      return value
    }
    return `${value.slice(0, head)}...${value.slice(-tail)}`
  }

  friendlyNameWithId(name?: string | null, id?: string | null) {
    const shortId = this.friendlyId(id)
    if (name && id) {
      return `${name} (${shortId})`
    }
    return name || shortId
  }

  formatDate(value?: string | Date | null) {
    if (!value) {
      return '-'
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium'
    }).format(new Date(value))
  }

  duration(runtime: McpStdioRuntimeSnapshot) {
    const startedAt = new Date(runtime.startedAt).getTime()
    const endedAt = runtime.closedAt ? new Date(runtime.closedAt).getTime() : Date.now()
    const seconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000))
    if (seconds < 60) {
      return this.t('PAC.Operations.DurationSeconds', '{{count}}s', { count: seconds })
    }
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
      return this.t('PAC.Operations.DurationMinutesSeconds', '{{minutes}}m {{seconds}}s', {
        minutes,
        seconds: seconds % 60
      })
    }
    const hours = Math.floor(minutes / 60)
    if (hours < 24) {
      return this.t('PAC.Operations.DurationHoursMinutes', '{{hours}}h {{minutes}}m', {
        hours,
        minutes: minutes % 60
      })
    }
    const days = Math.floor(hours / 24)
    return this.t('PAC.Operations.DurationDaysHours', '{{days}}d {{hours}}h', {
      days,
      hours: hours % 24
    })
  }

  pidLabel(runtime: McpStdioRuntimeSnapshot) {
    const pids = [
      runtime.runnerPid ? `${this.t('PAC.Operations.RunnerPid', 'runner')} ${runtime.runnerPid}` : '',
      runtime.childPid ? `${this.t('PAC.Operations.ChildPid', 'child')} ${runtime.childPid}` : ''
    ].filter(Boolean)
    return pids.length ? pids.join(' / ') : '-'
  }

  commandLabel(runtime: McpStdioRuntimeSnapshot) {
    return runtime.commandLabel || runtime.command || '-'
  }

  pluginRuntimeType(runtime: McpStdioRuntimeSnapshot) {
    return runtime.pluginManaged
      ? this.t('PAC.Operations.PluginManagedRuntime', 'plugin-managed')
      : this.t('PAC.Operations.CustomStdioRuntime', 'custom stdio')
  }

  runtimeOriginLabel(runtime: McpStdioRuntimeSnapshot) {
    return runtime.origin === 'mcp-app-host'
      ? this.t('PAC.Operations.RuntimeOrigin.McpAppHost', 'MCP App host')
      : this.t('PAC.Operations.RuntimeOrigin.AgentToolset', 'Agent toolset')
  }

  workspaceLabel(workspaceId?: string | null) {
    if (!workspaceId) {
      return '-'
    }
    const option = this.filterOptions().workspaces.find((item) => item.value === workspaceId)
    return option?.label && option.label !== workspaceId ? option.label : this.friendlyId(workspaceId)
  }

  workspaceTitle(workspaceId?: string | null) {
    if (!workspaceId) {
      return '-'
    }
    const label = this.workspaceLabel(workspaceId)
    return label === this.friendlyId(workspaceId) ? workspaceId : `${label} (${workspaceId})`
  }

  idleExpiryLabel(runtime: McpStdioRuntimeSnapshot) {
    return runtime.idleExpiresAt
      ? this.t('PAC.Operations.IdleExpiresAt', 'Idle expires {{time}}', {
          time: this.formatDate(runtime.idleExpiresAt)
        })
      : this.t('PAC.Operations.NoExpiry', 'No expiry')
  }

  maxLifetimeLabel(runtime: McpStdioRuntimeSnapshot) {
    return runtime.maxLifetimeExpiresAt
      ? this.t('PAC.Operations.MaxLifetimeAt', 'Max lifetime {{time}}', {
          time: this.formatDate(runtime.maxLifetimeExpiresAt)
        })
      : this.t('PAC.Operations.NoExpiry', 'No expiry')
  }

  trackByRuntimeId(_: number, runtime: McpStdioRuntimeSnapshot) {
    return runtime.id
  }

  private selectValue(value: ZardSelectValue | ZardSelectValue[]) {
    const selected = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
    return selected === ALL_FILTER_VALUE ? '' : selected
  }

  private sortValue(runtime: McpStdioRuntimeSnapshot, key: RuntimeSortKey) {
    switch (key) {
      case 'runtime':
        return `${this.runtimeTitle(runtime)} ${runtime.id} ${this.commandLabel(runtime)}`
      case 'status':
        return runtime.status
      case 'plugin':
        return `${runtime.pluginName ?? ''} ${runtime.serverName ?? ''} ${runtime.componentKey ?? ''}`
      case 'scope':
        return `${runtime.tenantId ?? ''} ${runtime.organizationId ?? ''} ${this.workspaceLabel(runtime.workspaceId)} ${
          runtime.toolsetId ?? ''
        }`
      case 'process':
        return runtime.runnerPid ?? runtime.childPid ?? 0
      case 'relations':
        return `${runtime.executionId ?? ''} ${runtime.conversationId ?? ''} ${runtime.appInstanceId ?? ''} ${
          runtime.resourceInstallationId ?? ''
        }`
      case 'startedAt':
        return new Date(runtime.startedAt).getTime()
      case 'closeReason':
        return runtime.closeReason ?? ''
    }
  }

  private compareValues(left: string | number, right: string | number) {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right
    }
    return COLLATOR.compare(String(left ?? ''), String(right ?? ''))
  }

  private killScopeLabel(filter: McpRuntimeListFilter) {
    const parts = [
      filter.workspaceId ? `${this.t('PAC.Operations.Workspace', 'workspace')}=${filter.workspaceId}` : '',
      filter.toolsetId ? `${this.t('PAC.Operations.Toolset', 'toolset')}=${filter.toolsetId}` : '',
      filter.pluginName ? `${this.t('PAC.Operations.Plugin', 'plugin')}=${filter.pluginName}` : '',
      filter.executionId ? `${this.t('PAC.Operations.Execution', 'execution')}=${filter.executionId}` : '',
      filter.appInstanceId ? `${this.t('PAC.Operations.AppInstance', 'app instance')}=${filter.appInstanceId}` : ''
    ].filter(Boolean)

    return parts.length
      ? parts.join(', ')
      : this.t('PAC.Operations.CurrentScopeActiveRuntimes', 'active runtimes in the current tenant and organization')
  }

  private t(key: string, defaultValue: string, params: Record<string, unknown> = {}) {
    const translated = this.#translate.instant(key, { Default: defaultValue, ...params })
    const text = typeof translated === 'string' && translated !== key ? translated : defaultValue
    return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, paramName) => {
      const value = params[paramName]
      return value === undefined || value === null ? match : String(value)
    })
  }
}
