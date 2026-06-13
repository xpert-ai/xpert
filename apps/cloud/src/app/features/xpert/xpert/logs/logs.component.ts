import { CommonModule } from '@angular/common'
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop'
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  model,
  signal,
  untracked
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardEmptyComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardInputGroupComponent,
  ZardLoaderComponent,
  ZardMenuImports,
  ZardSelectComponent,
  ZardSelectItemComponent,
  ZardTableImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { calcTimeRange, TimeRangeEnum, TimeRangeOptions } from '@xpert-ai/core'
import { ChatConversationPreviewComponent, ChatMessageExecutionPanelComponent } from '@cloud/app/@shared/chat'
import { UserPipe } from '@cloud/app/@shared/pipes'
import {
  ChatConversationService,
  DateRelativePipe,
  IChatConversation,
  LanguagesEnum,
  OrderTypeEnum,
  PaginationParams,
  routeAnimations,
  TChatConversationLog,
  TChatConversationStatus,
  TChatFrom,
  XpertAPIService
} from '@cloud/app/@core'
import { injectLanguage } from '@cloud/app/@core/providers'
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs'
import { XpertComponent } from '../xpert.component'

const LOG_STORAGE_KEY_PREFIX = 'xpert.logs.table.columns.v1'
const DEFAULT_PAGE_SIZE = 20
const MIN_COLUMN_WIDTH = 80

const LOG_COLUMN_KEYS = [
  'title',
  'createdBy',
  'from',
  'fromEndUser',
  'messageCount',
  'status',
  'updatedAt',
  'actions',
  'id',
  'threadId',
  'createdAt',
  'error'
] as const

type LogColumnKey = (typeof LOG_COLUMN_KEYS)[number]

type LogColumn = {
  key: LogColumnKey
  labelKey: string
  defaultLabel: string
  width: number
  minWidth?: number
  defaultVisible?: boolean
  required?: boolean
  resizable?: boolean
  align?: 'left' | 'right'
}

type LogColumnState = {
  visible?: boolean
  width?: number
}

type LogColumnStates = Partial<Record<LogColumnKey, LogColumnState>>

type ColumnResizeState = {
  key: LogColumnKey
  startX: number
  startWidth: number
}

type ColumnDropPlacement = 'before' | 'after'

type SelectValue = string | number | Array<string | number>

const LOG_COLUMNS: readonly LogColumn[] = [
  {
    key: 'title',
    labelKey: 'PAC.KEY_WORDS.Title',
    defaultLabel: 'Title',
    width: 360,
    minWidth: 220,
    required: true
  },
  {
    key: 'createdBy',
    labelKey: 'PAC.KEY_WORDS.CreatedBy',
    defaultLabel: 'Created By',
    width: 180,
    minWidth: 140
  },
  {
    key: 'from',
    labelKey: 'PAC.Xpert.ChatFrom',
    defaultLabel: 'Chat From',
    width: 140,
    minWidth: 120
  },
  {
    key: 'fromEndUser',
    labelKey: 'PAC.KEY_WORDS.EndUser',
    defaultLabel: 'End User',
    width: 180,
    minWidth: 140
  },
  {
    key: 'messageCount',
    labelKey: 'PAC.KEY_WORDS.MessageCount',
    defaultLabel: 'Message Count',
    width: 120,
    minWidth: 100,
    align: 'right'
  },
  {
    key: 'status',
    labelKey: 'PAC.KEY_WORDS.Status',
    defaultLabel: 'Status',
    width: 140,
    minWidth: 120
  },
  {
    key: 'updatedAt',
    labelKey: 'PAC.KEY_WORDS.UpdatedAt',
    defaultLabel: 'Updated At',
    width: 170,
    minWidth: 140
  },
  {
    key: 'actions',
    labelKey: 'PAC.KEY_WORDS.Actions',
    defaultLabel: 'Actions',
    width: 112,
    minWidth: 96,
    required: true,
    resizable: false
  },
  {
    key: 'id',
    labelKey: 'PAC.Xpert.ConversationId',
    defaultLabel: 'Conversation ID',
    width: 240,
    minWidth: 180,
    defaultVisible: false
  },
  {
    key: 'threadId',
    labelKey: 'PAC.Xpert.ThreadId',
    defaultLabel: 'Thread ID',
    width: 260,
    minWidth: 180,
    defaultVisible: false
  },
  {
    key: 'createdAt',
    labelKey: 'PAC.KEY_WORDS.CreatedAt',
    defaultLabel: 'Created At',
    width: 170,
    minWidth: 140,
    defaultVisible: false
  },
  {
    key: 'error',
    labelKey: 'PAC.KEY_WORDS.Error',
    defaultLabel: 'Error',
    width: 300,
    minWidth: 180,
    defaultVisible: false
  }
]

const STATUS_OPTIONS: readonly {
  value: TChatConversationStatus
  labelKey: string
  defaultLabel: string
}[] = [
  { value: 'busy', labelKey: 'PAC.Xpert.Busy', defaultLabel: 'Busy' },
  { value: 'error', labelKey: 'PAC.Xpert.Failure', defaultLabel: 'Failure' },
  { value: 'interrupted', labelKey: 'PAC.Xpert.Interrupted', defaultLabel: 'Interrupted' },
  { value: 'idle', labelKey: 'PAC.Xpert.Idle', defaultLabel: 'Idle' }
]

const SOURCE_OPTIONS: readonly {
  value: TChatFrom
  labelKey: string
  defaultLabel: string
}[] = [
  { value: 'platform', labelKey: 'PAC.Xpert.ChatFromPlatform', defaultLabel: 'Platform' },
  { value: 'webapp', labelKey: 'PAC.Xpert.ChatFromWebapp', defaultLabel: 'Web App' },
  { value: 'debugger', labelKey: 'PAC.Xpert.ChatFromDebugger', defaultLabel: 'Debugger' },
  { value: 'knowledge', labelKey: 'PAC.Xpert.ChatFromKnowledge', defaultLabel: 'Knowledge' },
  { value: 'job', labelKey: 'PAC.Xpert.ChatFromJob', defaultLabel: 'Job' },
  { value: 'api', labelKey: 'PAC.Xpert.ChatFromApi', defaultLabel: 'API' },
  { value: 'feishu', labelKey: 'PAC.Xpert.ChatFromFeishu', defaultLabel: 'Feishu' },
  { value: 'lark', labelKey: 'PAC.Xpert.ChatFromLark', defaultLabel: 'Lark' },
  { value: 'dingtalk', labelKey: 'PAC.Xpert.ChatFromDingtalk', defaultLabel: 'DingTalk' },
  { value: 'wecom', labelKey: 'PAC.Xpert.ChatFromWecom', defaultLabel: 'WeCom' }
]

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function isLogColumnKey(value: unknown): value is LogColumnKey {
  return typeof value === 'string' && LOG_COLUMN_KEYS.some((key) => key === value)
}

function isStatus(value: string): value is TChatConversationStatus {
  return STATUS_OPTIONS.some((option) => option.value === value)
}

function isSource(value: string): value is TChatFrom {
  return SOURCE_OPTIONS.some((option) => option.value === value)
}

function parseSelectStrings(value: SelectValue): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean)
  }

  const stringValue = String(value)
  return stringValue ? [stringValue] : []
}

function isFixedColumnKey(key: LogColumnKey) {
  return key === 'title' || key === 'actions'
}

function createDefaultColumnOrder(): LogColumnKey[] {
  const middleKeys = LOG_COLUMNS.map((column) => column.key).filter((key) => !isFixedColumnKey(key))
  return ['title', ...middleKeys, 'actions']
}

function normalizeColumnOrder(value: readonly LogColumnKey[] | undefined): LogColumnKey[] {
  const middleDefaults = createDefaultColumnOrder().filter((key) => !isFixedColumnKey(key))
  const orderedMiddle: LogColumnKey[] = []

  for (const key of value ?? []) {
    if (!isFixedColumnKey(key) && middleDefaults.includes(key) && !orderedMiddle.includes(key)) {
      orderedMiddle.push(key)
    }
  }

  for (const key of middleDefaults) {
    if (!orderedMiddle.includes(key)) {
      orderedMiddle.push(key)
    }
  }

  return ['title', ...orderedMiddle, 'actions']
}

function readPersistedColumnSettings(value: unknown): { states: LogColumnStates; order?: LogColumnKey[] } {
  if (!isObjectLike(value)) {
    return { states: {} }
  }

  const columns = Reflect.get(value, 'columns')
  if (!Array.isArray(columns)) {
    return { states: {} }
  }

  const state: LogColumnStates = {}

  for (const item of columns) {
    if (!isObjectLike(item)) {
      continue
    }

    const key = Reflect.get(item, 'key')
    if (!isLogColumnKey(key)) {
      continue
    }

    const width = Reflect.get(item, 'width')
    const visible = Reflect.get(item, 'visible')
    state[key] = {
      ...(typeof width === 'number' && Number.isFinite(width) ? { width } : {}),
      ...(typeof visible === 'boolean' ? { visible } : {})
    }
  }

  const orderValue = Reflect.get(value, 'order')
  const order = Array.isArray(orderValue) ? orderValue.filter(isLogColumnKey) : undefined

  return { states: state, order }
}

function createDefaultColumnStates(): LogColumnStates {
  const state: LogColumnStates = {}

  for (const column of LOG_COLUMNS) {
    state[column.key] = {
      visible: column.required ? true : column.defaultVisible !== false,
      width: column.width
    }
  }

  return state
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return ''
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    TranslateModule,
    RouterModule,
    WaIntersectionObserver,
    UserPipe,
    DateRelativePipe,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardInputGroupComponent,
    ZardLoaderComponent,
    ZardSelectComponent,
    ZardSelectItemComponent,
    ...ZardMenuImports,
    ...ZardTableImports,
    ...ZardTooltipImports,
    ChatConversationPreviewComponent,
    ChatMessageExecutionPanelComponent
  ],
  selector: 'xpert-logs',
  templateUrl: './logs.component.html',
  styleUrl: 'logs.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertLogsComponent {
  readonly timeRanges = TimeRangeOptions
  readonly statusOptions = STATUS_OPTIONS
  readonly sourceOptions = SOURCE_OPTIONS
  readonly logColumns = LOG_COLUMNS

  readonly xpertService = inject(XpertAPIService)
  readonly conversationService = inject(ChatConversationService)
  readonly xpertComponent = inject(XpertComponent)
  readonly language = injectLanguage()

  readonly xpert = this.xpertComponent.latestXpert
  readonly xpertId = computed(() => this.xpert()?.id ?? null)

  readonly searchControl = new FormControl<string>('', { nonNullable: true })
  readonly searchText = signal('')
  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly selectedStatuses = signal<TChatConversationStatus[]>([])
  readonly selectedSources = signal<TChatFrom[]>([])
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly filterSignature = computed(() =>
    JSON.stringify({
      xpertId: this.xpertId(),
      search: this.searchText(),
      sources: this.selectedSources(),
      statuses: this.selectedStatuses(),
      timeRange: this.timeRangeValue()
    })
  )
  readonly loading = signal(false)
  readonly error = signal('')
  readonly total = signal(0)
  readonly pageSize = DEFAULT_PAGE_SIZE
  readonly currentPage = signal(0)
  readonly done = signal(false)
  readonly conversations = signal<TChatConversationLog[]>([])

  readonly columnStates = signal<LogColumnStates>(createDefaultColumnStates())
  readonly columnOrder = signal<LogColumnKey[]>(createDefaultColumnOrder())
  readonly orderedColumns = computed(() =>
    normalizeColumnOrder(this.columnOrder())
      .map((key) => LOG_COLUMNS.find((column) => column.key === key))
      .filter((column): column is LogColumn => Boolean(column))
  )
  readonly pinnedStartColumns = computed(() => this.orderedColumns().filter((column) => column.key === 'title'))
  readonly reorderableColumns = computed(() =>
    this.orderedColumns().filter((column) => this.isColumnReorderable(column))
  )
  readonly pinnedEndColumns = computed(() => this.orderedColumns().filter((column) => column.key === 'actions'))
  readonly visibleColumns = computed(() => this.orderedColumns().filter((column) => this.isColumnVisible(column)))
  readonly tableMinWidth = computed(() =>
    this.visibleColumns().reduce((width, column) => width + this.columnWidth(column), 0)
  )
  readonly resizingColumn = signal<LogColumnKey | null>(null)

  readonly preview = signal<string | null>(null)
  readonly executionId = signal<string | null>(null)
  readonly previewConversation = computed(() => this.conversations().find((item) => item.id === this.preview()) ?? null)
  readonly previewOrganizationId = computed(() => this.previewConversation()?.organizationId ?? null)

  #requestSeq = 0
  #activeResize: ColumnResizeState | null = null

  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.searchText.set(value.trim())
      })

    effect(() => {
      const xpertId = this.xpertId()
      untracked(() => this.loadColumnSettings(xpertId))
    })

    effect(() => {
      const signature = this.filterSignature()
      if (!this.xpertId()) {
        return
      }

      untracked(() => {
        void this.reloadConversations(signature)
      })
    })
  }

  async reloadConversations(_signature?: string) {
    this.#requestSeq += 1
    this.conversations.set([])
    this.currentPage.set(0)
    this.done.set(false)
    this.total.set(0)
    await this.loadConversations(true, this.#requestSeq)
  }

  async loadConversations(reset = false, requestId = ++this.#requestSeq) {
    const xpertId = this.xpertId()
    if (!xpertId || (!reset && (this.loading() || this.done()))) {
      return
    }

    this.loading.set(true)
    this.error.set('')

    const page = reset ? 0 : this.currentPage()

    try {
      const result = await firstValueFrom(
        this.xpertService.getConversations(
          xpertId,
          {
            relations: ['createdBy'],
            where: this.buildWhere(),
            order: { updatedAt: OrderTypeEnum.DESC },
            take: this.pageSize,
            skip: page * this.pageSize
          },
          this.timeRange(),
          this.searchText()
        )
      )

      if (requestId !== this.#requestSeq) {
        return
      }

      this.conversations.update((state) => (reset ? result.items : [...state, ...result.items]))
      this.total.set(result.total)
      this.currentPage.set(page + 1)
      if (result.items.length < this.pageSize || (page + 1) * this.pageSize >= result.total) {
        this.done.set(true)
      }
    } catch (err) {
      if (requestId === this.#requestSeq) {
        this.error.set(getErrorText(err))
        this.done.set(true)
      }
    } finally {
      if (requestId === this.#requestSeq) {
        this.loading.set(false)
      }
    }
  }

  onIntersection() {
    if (!this.loading() && !this.done()) {
      void this.loadConversations()
    }
  }

  setTimeRange(value: SelectValue) {
    const [next] = parseSelectStrings(value)
    if (TimeRangeOptions.some((option) => option.value === next)) {
      this.timeRangeValue.set(next as TimeRangeEnum)
    }
  }

  setStatuses(value: SelectValue) {
    this.selectedStatuses.set(parseSelectStrings(value).filter(isStatus))
  }

  setSources(value: SelectValue) {
    this.selectedSources.set(parseSelectStrings(value).filter(isSource))
  }

  resetFilters() {
    this.searchControl.setValue('')
    this.searchText.set('')
    this.selectedStatuses.set([])
    this.selectedSources.set([])
    this.timeRangeValue.set(TimeRangeEnum.Last7Days)
  }

  togglePreview(id: string) {
    this.preview.update((state) => (state === id ? null : id))
    this.executionId.set(null)
  }

  selectExecution(id: string) {
    this.executionId.set(id)
  }

  closeExecution() {
    this.executionId.set(null)
  }

  cancelConversation(event: MouseEvent, conversation: TChatConversationLog) {
    event.stopPropagation()
    if (conversation.status !== 'busy') {
      return
    }

    this.conversationService.cancelConversation(conversation.id, conversation.organizationId ?? undefined).subscribe({
      next: () => {
        this.conversations.update((state) =>
          state.map((item) => (item.id === conversation.id ? { ...item, status: 'interrupted' } : item))
        )
      }
    })
  }

  isColumnVisible(column: LogColumn) {
    if (column.required) {
      return true
    }

    const state = this.columnStates()[column.key]
    return state?.visible ?? column.defaultVisible !== false
  }

  columnWidth(column: LogColumn) {
    const width = this.columnStates()[column.key]?.width ?? column.width
    return Math.max(column.minWidth ?? MIN_COLUMN_WIDTH, width)
  }

  setColumnVisible(column: LogColumn, visible: boolean) {
    if (column.required) {
      return
    }

    const next = {
      ...this.columnStates(),
      [column.key]: {
        ...(this.columnStates()[column.key] ?? {}),
        visible
      }
    }
    this.columnStates.set(next)
    this.persistColumnSettings(next)
  }

  resetColumns() {
    const next = createDefaultColumnStates()
    this.columnStates.set(next)
    this.columnOrder.set(createDefaultColumnOrder())
    this.removePersistedColumnSettings()
  }

  isColumnReorderable(column: LogColumn) {
    return !isFixedColumnKey(column.key)
  }

  dropColumnOrder(event: CdkDragDrop<LogColumn[]>) {
    if (event.previousIndex === event.currentIndex) {
      return
    }

    const middleKeys = this.reorderableColumns().map((column) => column.key)
    const sourceKey = middleKeys[event.previousIndex]
    if (!sourceKey) {
      return
    }

    const nextMiddle = middleKeys.filter((key) => key !== sourceKey)
    const nextIndex = Math.max(0, Math.min(event.currentIndex, nextMiddle.length))
    nextMiddle.splice(nextIndex, 0, sourceKey)

    const nextOrder = normalizeColumnOrder(['title', ...nextMiddle, 'actions'])
    this.columnOrder.set(nextOrder)
    this.persistColumnSettings(this.columnStates(), nextOrder)
  }

  moveColumnOrder(sourceKey: LogColumnKey, targetKey: LogColumnKey, placement: ColumnDropPlacement) {
    if (sourceKey === targetKey || isFixedColumnKey(sourceKey) || isFixedColumnKey(targetKey)) {
      return
    }

    const middleKeys = normalizeColumnOrder(this.columnOrder()).filter((key) => !isFixedColumnKey(key))
    const nextMiddle = middleKeys.filter((key) => key !== sourceKey)
    const targetIndex = nextMiddle.indexOf(targetKey)
    if (targetIndex < 0) {
      return
    }

    nextMiddle.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, sourceKey)
    const nextOrder = normalizeColumnOrder(['title', ...nextMiddle, 'actions'])
    this.columnOrder.set(nextOrder)
    this.persistColumnSettings(this.columnStates(), nextOrder)
  }

  startColumnResize(event: MouseEvent, column: LogColumn) {
    if (event.button !== 0 || column.resizable === false) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    this.#activeResize = {
      key: column.key,
      startX: event.clientX,
      startWidth: this.columnWidth(column)
    }
    this.resizingColumn.set(column.key)

    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent) {
    if (!this.#activeResize) {
      return
    }

    const column = LOG_COLUMNS.find((item) => item.key === this.#activeResize?.key)
    if (!column) {
      this.stopColumnResize()
      return
    }

    const width = Math.max(
      column.minWidth ?? MIN_COLUMN_WIDTH,
      this.#activeResize.startWidth + event.clientX - this.#activeResize.startX
    )

    this.columnStates.update((state) => ({
      ...state,
      [column.key]: {
        ...(state[column.key] ?? {}),
        width
      }
    }))
  }

  @HostListener('document:mouseup')
  @HostListener('window:blur')
  stopColumnResize() {
    if (!this.#activeResize) {
      return
    }

    this.#activeResize = null
    this.resizingColumn.set(null)
    this.persistColumnSettings(this.columnStates())

    if (typeof document !== 'undefined') {
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
  }

  statusLabelKey(status: TChatConversationStatus | null | undefined) {
    return STATUS_OPTIONS.find((option) => option.value === status)?.labelKey ?? 'PAC.KEY_WORDS.Status'
  }

  statusDefaultLabel(status: TChatConversationStatus | null | undefined) {
    return STATUS_OPTIONS.find((option) => option.value === status)?.defaultLabel ?? status ?? ''
  }

  sourceLabelKey(source: TChatFrom | null | undefined) {
    return SOURCE_OPTIONS.find((option) => option.value === source)?.labelKey ?? 'PAC.Xpert.ChatFrom'
  }

  sourceDefaultLabel(source: TChatFrom | null | undefined) {
    return SOURCE_OPTIONS.find((option) => option.value === source)?.defaultLabel ?? source ?? ''
  }

  timeRangeLabel(option: (typeof TimeRangeOptions)[number]) {
    const language = this.language()
    return language === LanguagesEnum.SimplifiedChinese || language === LanguagesEnum.Chinese
      ? option.label.zh_Hans
      : option.label.en_US
  }

  private buildWhere(): NonNullable<PaginationParams<IChatConversation>['where']> {
    const where: NonNullable<PaginationParams<IChatConversation>['where']> = {}
    const statuses = this.selectedStatuses()
    const sources = this.selectedSources()

    if (statuses.length) {
      where.status = { $in: statuses }
    }

    if (sources.length) {
      where.from = { $in: sources }
    }

    return where
  }

  private loadColumnSettings(xpertId: string | null) {
    const defaults = createDefaultColumnStates()
    const defaultOrder = createDefaultColumnOrder()
    if (!xpertId || typeof localStorage === 'undefined') {
      this.columnStates.set(defaults)
      this.columnOrder.set(defaultOrder)
      return
    }

    const raw = localStorage.getItem(this.columnStorageKey(xpertId))
    if (!raw) {
      this.columnStates.set(defaults)
      this.columnOrder.set(defaultOrder)
      return
    }

    try {
      const persisted = readPersistedColumnSettings(JSON.parse(raw) as unknown)
      this.columnStates.set({
        ...defaults,
        ...persisted.states
      })
      this.columnOrder.set(normalizeColumnOrder(persisted.order))
    } catch {
      this.columnStates.set(defaults)
      this.columnOrder.set(defaultOrder)
    }
  }

  private persistColumnSettings(state: LogColumnStates, order = this.columnOrder()) {
    const xpertId = this.xpertId()
    if (!xpertId || typeof localStorage === 'undefined') {
      return
    }

    const columns = LOG_COLUMNS.map((column) => ({
      key: column.key,
      visible: this.isColumnVisibleWithState(column, state),
      width: state[column.key]?.width ?? column.width
    }))

    localStorage.setItem(
      this.columnStorageKey(xpertId),
      JSON.stringify({
        columns,
        order: normalizeColumnOrder(order)
      })
    )
  }

  private removePersistedColumnSettings() {
    const xpertId = this.xpertId()
    if (!xpertId || typeof localStorage === 'undefined') {
      return
    }

    localStorage.removeItem(this.columnStorageKey(xpertId))
  }

  private isColumnVisibleWithState(column: LogColumn, state: LogColumnStates) {
    if (column.required) {
      return true
    }

    return state[column.key]?.visible ?? column.defaultVisible !== false
  }

  private columnStorageKey(xpertId: string) {
    return `${LOG_STORAGE_KEY_PREFIX}:${xpertId}`
  }
}
