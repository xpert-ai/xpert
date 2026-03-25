import { CommonModule, formatDate } from '@angular/common'
import {
  LOCALE_ID,
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import {
  channelName,
  getErrorMessage,
  IXpertAgentExecution,
  STATE_VARIABLE_HUMAN,
  STATE_VARIABLE_SYS,
  TWorkflowVarGroup,
  ToastrService,
  TXpertAgentExecutionCheckpoint,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum
} from 'apps/cloud/src/app/@core'
import { expandVariablesWithItems, TStateVariableType } from 'apps/cloud/src/app/@shared/agent/types'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { catchError, distinctUntilChanged, forkJoin, of, switchMap, tap } from 'rxjs'
import {
  ZardResizableComponent,
  ZardResizableImports,
  ZardStepperImports,
  type ZardResizeEvent
} from '@xpert-ai/headless-ui'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'
import { XpertStudioComponent } from '../../studio.component'

type TInspectorCategoryId = 'global' | 'human' | 'system' | 'node_channels' | 'dynamic'

type TInspectorVariable = TStateVariableType & {
  path: string
  origin: 'schema' | 'dynamic'
}

type TInspectorGroup = {
  id: string
  category: TInspectorCategoryId
  label: string
  scopeKey: string | null
  variables: TInspectorVariable[]
  order: number
}

type TInspectorCategory = {
  id: TInspectorCategoryId
  label: string
  groups: TInspectorGroup[]
}

type TSnapshotCacheEntry = {
  status: 'loading' | 'success' | 'error'
  value?: Record<string, unknown>
  error?: string
}

const DYNAMIC_GROUP_ID = '__dynamic__'
const DEFAULT_INSPECTOR_HEIGHT = 600
const COLLAPSED_INSPECTOR_HEIGHT = 64
const CATEGORY_LABELS: Record<TInspectorCategoryId, string> = {
  global: 'Global',
  human: 'Human',
  system: 'System',
  node_channels: 'Node Channels',
  dynamic: 'Dynamic'
}

@Component({
  standalone: true,
  selector: 'xpert-studio-state-inspector',
  templateUrl: './state-inspector.component.html',
  styleUrl: './state-inspector.component.css',
  imports: [
    CommonModule,
    TranslateModule,
    MarkdownModule,
    NgxJsonViewerModule,
    ...ZardResizableImports,
    ...ZardStepperImports
  ]
})
export class XpertStudioStateInspectorComponent {
  readonly executionService = inject(XpertExecutionService)
  readonly executionApi = inject(XpertAgentExecutionService)
  readonly studioApi = inject(XpertStudioApiService)
  readonly studioComponent = inject(XpertStudioComponent)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #locale = inject(LOCALE_ID)
  readonly i18n = new NgmI18nPipe()
  readonly resizable = viewChild(ZardResizableComponent)

  readonly eExecutionStatusEnum = XpertAgentExecutionStatusEnum
  readonly collapsedInspectorHeight = COLLAPSED_INSPECTOR_HEIGHT
  readonly selectedExecutionId = this.executionService.inspectorExecutionId

  readonly collapsed = signal(true)
  readonly preferredInspectorHeight = signal(DEFAULT_INSPECTOR_HEIGHT)
  readonly execution = signal<IXpertAgentExecution>(null)
  readonly checkpoints = signal<TXpertAgentExecutionCheckpoint[]>([])
  readonly schemaGroups = signal<TWorkflowVarGroup[]>([])
  readonly selectedCheckpointId = signal<string>(null)
  readonly selectedPath = signal<string>(null)
  readonly selectedGroupId = signal<string>(null)
  readonly stringViewMode = signal<'code' | 'preview'>('code')
  readonly expandedPaths = signal<Record<string, boolean>>({})
  readonly snapshotCache = signal<Record<string, TSnapshotCacheEntry>>({})
  readonly loadingExecution = signal(false)
  readonly loadingCheckpoints = signal(false)
  readonly loadingSchema = signal(false)
  readonly currentCacheKey = computed(() => {
    const executionId = this.selectedExecutionId()
    const checkpointId = this.selectedCheckpointId()
    return executionId && checkpointId ? `${executionId}:${checkpointId}` : null
  })
  readonly currentSnapshotEntry = computed(() => {
    const cacheKey = this.currentCacheKey()
    return cacheKey ? this.snapshotCache()[cacheKey] : null
  })
  readonly currentSnapshot = computed(() => this.currentSnapshotEntry()?.value ?? null)
  readonly selectedCheckpointIndex = computed(() => {
    const checkpointId = this.selectedCheckpointId()
    const checkpoints = this.checkpoints()
    const index = checkpoints.findIndex((checkpoint) => checkpoint.checkpointId === checkpointId)
    return index >= 0 ? index : 0
  })
  readonly currentCheckpoint = computed(
    () => this.checkpoints().find((checkpoint) => checkpoint.checkpointId === this.selectedCheckpointId()) ?? null
  )
  readonly retryMessageId = computed(() => {
    const executionId = this.selectedExecutionId()
    if (!executionId) {
      return null
    }
    return (
      this.executionService.conversation()?.messages?.find((message) => message.executionId === executionId)?.id ?? null
    )
  })
  readonly canRerun = computed(() => {
    const execution = this.execution()
    return (
      !!execution &&
      (execution.checkpointNs ?? '') === '' &&
      execution.status !== XpertAgentExecutionStatusEnum.RUNNING &&
      !!this.selectedCheckpointId() &&
      !!this.retryMessageId()
    )
  })

  readonly categories = computed<TInspectorCategory[]>(() => {
    const groups = this.buildGroups(this.schemaGroups(), this.currentSnapshot())
    return (Object.keys(CATEGORY_LABELS) as TInspectorCategoryId[]).map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      groups: groups
        .filter((group) => group.category === id)
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    }))
  })
  readonly hasCategories = computed(() => this.categories().some((category) => category.groups.length > 0))
  readonly selectedVariable = computed(() => {
    const selectedPath = this.selectedPath()
    if (!selectedPath) {
      return null
    }

    for (const category of this.categories()) {
      for (const group of category.groups) {
        const variable = group.variables.find((item) => item.path === selectedPath)
        if (variable) {
          return {
            group,
            variable
          }
        }
      }
    }

    return null
  })
  readonly selectedValue = computed(() => {
    const variable = this.selectedVariable()
    const snapshot = this.currentSnapshot()
    return variable && snapshot ? getValueByPath(snapshot, variable.variable.path) : undefined
  })
  readonly selectedValueIsObject = computed(() => isRecord(this.selectedValue()))
  readonly selectedValueIsArray = computed(() => Array.isArray(this.selectedValue()))
  readonly selectedValueIsString = computed(() => typeof this.selectedValue() === 'string')
  readonly selectedValueCanPreviewMarkdown = computed(
    () => this.selectedValueIsString() && looksLikeMarkdown(this.selectedValue() as string)
  )

  private readonly schemaSub = toObservable(this.studioComponent.id)
    .pipe(
      distinctUntilChanged(),
      tap(() => this.loadingSchema.set(true)),
      switchMap((xpertId) =>
        xpertId
          ? this.studioApi.getVariables({
              xpertId,
              type: 'output'
            })
          : of([])
      ),
      catchError((error) => {
        this.#toastr.error(getErrorMessage(error))
        return of([])
      }),
      takeUntilDestroyed()
    )
    .subscribe((groups) => {
      this.loadingSchema.set(false)
      this.schemaGroups.set(groups ?? [])
    })

  private readonly selectionSub = toObservable(this.selectedExecutionId)
    .pipe(
      distinctUntilChanged(),
      tap((executionId) => {
        this.execution.set(null)
        this.checkpoints.set([])
        this.selectedCheckpointId.set(null)
        this.selectedPath.set(null)
        this.selectedGroupId.set(null)
        this.expandedPaths.set({})
        this.snapshotCache.set({})
        this.loadingExecution.set(!!executionId)
        this.loadingCheckpoints.set(!!executionId)
        if (executionId) {
          this.collapsed.set(false)
        }
      }),
      switchMap((executionId) =>
        executionId
          ? forkJoin({
              execution: this.executionApi.getOneLog(executionId),
              checkpoints: this.executionApi.getCheckpoints(executionId)
            }).pipe(
              catchError((error) => {
                this.#toastr.error(getErrorMessage(error))
                return of({
                  execution: null,
                  checkpoints: []
                })
              })
            )
          : of(null)
      ),
      takeUntilDestroyed()
    )
    .subscribe((result) => {
      this.loadingExecution.set(false)
      this.loadingCheckpoints.set(false)
      this.execution.set(result?.execution ?? null)
      this.checkpoints.set(result?.checkpoints ?? [])

      const currentCheckpointId =
        result?.checkpoints?.find((checkpoint) => checkpoint.isCurrent)?.checkpointId ??
        result?.checkpoints?.[result.checkpoints.length - 1]?.checkpointId ??
        result?.execution?.checkpointId ??
        null

      this.selectedCheckpointId.set(currentCheckpointId)
    })

  constructor() {
    effect((onCleanup) => {
      const executionId = this.selectedExecutionId()
      const checkpointId = this.selectedCheckpointId()
      if (!executionId || !checkpointId) {
        return
      }

      const cacheKey = `${executionId}:${checkpointId}`
      if (untracked(() => this.snapshotCache()[cacheKey])) {
        return
      }

      this.snapshotCache.update((state) => ({
        ...state,
        [cacheKey]: {
          status: 'loading'
        }
      }))

      const subscription = this.executionApi.getOneState(executionId, checkpointId).subscribe({
        next: (snapshot) => {
          this.snapshotCache.update((state) => ({
            ...state,
            [cacheKey]: {
              status: 'success',
              value: snapshot ?? {}
            }
          }))
        },
        error: (error) => {
          this.snapshotCache.update((state) => ({
            ...state,
            [cacheKey]: {
              status: 'error',
              error: getErrorMessage(error)
            }
          }))
        }
      })

      onCleanup(() => {
        subscription.unsubscribe()
      })
    })

    effect(() => {
      if (!this.currentSnapshot()) {
        return
      }

      const currentSelection = this.selectedVariable()
      if (currentSelection) {
        return
      }

      for (const category of this.categories()) {
        for (const group of category.groups) {
          const firstVariable = group.variables.find((item) => !item.parent)
          if (firstVariable) {
            this.selectedGroupId.set(group.id)
            this.selectedPath.set(firstVariable.path)
            return
          }
        }
      }
    })

    effect(() => {
      this.stringViewMode.set(this.selectedValueCanPreviewMarkdown() ? 'preview' : 'code')
    })
  }

  toggleCollapsed() {
    this.collapsed.update((state) => !state)
  }

  closeInspector() {
    this.executionService.selectInspectorExecution(null)
  }

  selectCheckpoint(checkpointId: string) {
    const executionId = this.selectedExecutionId()
    if (!checkpointId || !executionId) {
      return
    }

    const cacheKey = `${executionId}:${checkpointId}`
    const cacheEntry = this.snapshotCache()[cacheKey]
    if (cacheEntry?.status === 'error') {
      this.snapshotCache.update((state) => {
        const next = { ...state }
        delete next[cacheKey]
        return next
      })
    }

    this.selectedCheckpointId.set(checkpointId)
  }

  selectCheckpointByIndex(index: number) {
    const checkpoint = this.checkpoints()[index]
    if (!checkpoint) {
      return
    }

    this.selectCheckpoint(checkpoint.checkpointId)
  }

  getCheckpointLabel(checkpoint: TXpertAgentExecutionCheckpoint, index: number) {
    return this.formatCheckpointDate(checkpoint.createdAt, 'short') || `#${index + 1}`
  }

  getCheckpointTooltip(checkpoint: TXpertAgentExecutionCheckpoint, index: number) {
    const timestamp = this.formatCheckpointDate(checkpoint.createdAt, 'medium')
    const source =
      checkpoint.metadata?.['source'] && typeof checkpoint.metadata['source'] === 'string'
        ? checkpoint.metadata['source']
        : this.#translate.instant('PAC.Xpert.Snapshot', { Default: 'Snapshot' })

    return [
      `${this.#translate.instant('PAC.Xpert.Checkpoint', { Default: 'Checkpoint' })} #${index + 1}`,
      timestamp ? `${this.#translate.instant('PAC.KEY_WORDS.Time', { Default: 'Time' })}: ${timestamp}` : null,
      `${this.#translate.instant('PAC.KEY_WORDS.Source', { Default: 'Source' })}: ${source}`,
      `${this.#translate.instant('PAC.KEY_WORDS.ID', { Default: 'ID' })}: ${checkpoint.checkpointId}`,
      checkpoint.isCurrent ? this.#translate.instant('PAC.Xpert.Current', { Default: 'Current' }) : null
    ]
      .filter(Boolean)
      .join(' • ')
  }

  selectVariable(group: TInspectorGroup, variable: TInspectorVariable) {
    this.selectedGroupId.set(group.id)
    this.selectedPath.set(variable.path)
  }

  toggleVariable(event: MouseEvent, variable: TInspectorVariable) {
    event.stopPropagation()
    this.expandedPaths.update((state) => ({
      ...state,
      [variable.path]: !state[variable.path]
    }))
  }

  isVariableExpandable(group: TInspectorGroup, variable: TInspectorVariable) {
    return group.variables.some((item) => item.parent === variable.name)
  }

  isVariableExpanded(variable: TInspectorVariable) {
    return !!this.expandedPaths()[variable.path] || this.hasSelectedDescendant(variable)
  }

  shouldShowVariable(group: TInspectorGroup, variable: TInspectorVariable) {
    if (!variable.parent) {
      return true
    }

    let parentName: string | undefined = variable.parent
    let guard = 0
    while (parentName && guard < 50) {
      const parent = group.variables.find((item) => item.name === parentName)
      if (!parent) {
        return false
      }

      if (!this.isVariableExpanded(parent)) {
        return false
      }

      parentName = parent.parent
      guard += 1
    }

    return true
  }

  getPaddingLevels(variable: TInspectorVariable) {
    const levels = []
    let currentLevel = variable.level ?? 0
    while (currentLevel > 0) {
      levels.push(currentLevel)
      currentLevel -= 1
    }
    return levels.reverse()
  }

  rerunFromCheckpoint() {
    const messageId = this.retryMessageId()
    const checkpointId = this.selectedCheckpointId()
    if (!messageId || !checkpointId) {
      this.#toastr.error('PAC.Xpert.ExecutionRetrySourceMissing', '', {
        Default: 'Retry source message not found'
      })
      return
    }

    this.executionService.requestPreviewRetry(messageId, checkpointId)
  }

  private hasSelectedDescendant(variable: TInspectorVariable) {
    const selectedPath = this.selectedPath()
    return !!selectedPath && selectedPath.startsWith(`${variable.path}.`)
  }

  private formatCheckpointDate(createdAt: string | null | undefined, format: string) {
    if (!createdAt) {
      return null
    }

    try {
      return formatDate(createdAt, format, this.#locale)
    } catch {
      return null
    }
  }

  private buildGroups(schemaGroups: TWorkflowVarGroup[], snapshot: Record<string, unknown> | null): TInspectorGroup[] {
    const groups = expandVariablesWithItems(
      (schemaGroups ?? []).map((group) => ({
        ...group,
        variables: (group.variables ?? []).map((variable) => ({
          ...variable,
          displayName: variable?.name?.split('.').pop() ?? variable?.name
        }))
      }))
    )

    const nodeLabels = new Map<string, { label: string; order: number }>()
    this.studioComponent.nodes()?.forEach((node, index) => {
      const entity = (node.entity ?? {}) as { title?: string; name?: string }
      nodeLabels.set(channelName(node.key), {
        label: entity.title || entity.name || node.key,
        order: index
      })
    })

    const knownScopeKeys = new Set<string>()
    const result: TInspectorGroup[] = []

    for (const group of groups ?? []) {
      const scopeKey = group.group?.name || null
      if (scopeKey) {
        knownScopeKeys.add(scopeKey)
      }

      const category = classifyScope(scopeKey)
      const scopeValue = scopeKey ? snapshot?.[scopeKey] : snapshot
      const order = category === 'node_channels' ? (nodeLabels.get(scopeKey)?.order ?? Number.MAX_SAFE_INTEGER) : 0
      result.push({
        id: scopeKey || 'global',
        category,
        label: this.getGroupLabel(scopeKey, group.group?.description, nodeLabels),
        scopeKey,
        order,
        variables: this.mergeVariables(scopeKey, (group.variables as TStateVariableType[]) ?? [], scopeValue)
      })
    }

    Object.entries(snapshot ?? {}).forEach(([key, value]) => {
      if (knownScopeKeys.has(key)) {
        return
      }

      if (classifyScope(key) === 'node_channels') {
        result.push({
          id: key,
          category: 'node_channels',
          label: nodeLabels.get(key)?.label ?? key,
          scopeKey: key,
          order: nodeLabels.get(key)?.order ?? Number.MAX_SAFE_INTEGER,
          variables: this.mergeVariables(key, [], value)
        })
        return
      }
    })

    const dynamicVariables = applyVariableLevels(
      buildDynamicVariables(snapshot, null, null)
        .filter(([name]) => {
          const [rootKey] = name.split('.')
          return !knownScopeKeys.has(rootKey) && classifyScope(rootKey) !== 'node_channels'
        })
        .map(([name, value, parent]) => this.createDynamicVariable(null, name, value, parent))
    )
    if (dynamicVariables.length) {
      result.push({
        id: DYNAMIC_GROUP_ID,
        category: 'dynamic',
        label: 'Dynamic Variables',
        scopeKey: null,
        order: Number.MAX_SAFE_INTEGER,
        variables: dynamicVariables
      })
    }

    return result.filter((group) => group.variables.length > 0)
  }

  private mergeVariables(scopeKey: string | null, schemaVariables: TStateVariableType[], scopeValue: unknown) {
    const variables = schemaVariables.map((variable) => ({
      ...variable,
      displayName: variable.displayName || variable.name?.split('.').pop() || variable.name,
      path: buildVariablePath(scopeKey, variable.name),
      origin: 'schema' as const
    }))
    const seen = new Set(variables.map((variable) => variable.name))
    const dynamicVariables = buildDynamicVariables(scopeValue, null, null)
      .filter(([name]) => !seen.has(name))
      .map(([name, value, parent]) => this.createDynamicVariable(scopeKey, name, value, parent))

    return applyVariableLevels([...variables, ...dynamicVariables])
  }

  private createDynamicVariable(scopeKey: string | null, name: string, value: unknown, parent?: string | null) {
    return {
      name,
      displayName: name.split('.').pop() || name,
      type: inferVariableType(value),
      parent: parent ?? undefined,
      path: buildVariablePath(scopeKey, name),
      origin: 'dynamic' as const
    } satisfies TInspectorVariable
  }

  private getGroupLabel(
    scopeKey: string | null,
    description: unknown,
    nodeLabels: Map<string, { label: string; order: number }>
  ) {
    if (!scopeKey) {
      return 'Global'
    }
    if (nodeLabels.has(scopeKey)) {
      return nodeLabels.get(scopeKey).label
    }

    return this.i18n.transform(description as never) || scopeKey
  }
}

function classifyScope(scopeKey: string | null): TInspectorCategoryId {
  if (!scopeKey) {
    return 'global'
  }
  if (scopeKey === STATE_VARIABLE_HUMAN) {
    return 'human'
  }
  if (scopeKey === STATE_VARIABLE_SYS || scopeKey === 'env') {
    return 'system'
  }
  if (scopeKey.endsWith('_channel')) {
    return 'node_channels'
  }
  return 'dynamic'
}

function buildVariablePath(scopeKey: string | null, name: string) {
  return scopeKey ? `${scopeKey}.${name}` : name
}

function inferVariableType(value: unknown) {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return XpertParameterTypeEnum.ARRAY_STRING
    }
    if (value.every((item) => typeof item === 'number')) {
      return XpertParameterTypeEnum.ARRAY_NUMBER
    }
    return XpertParameterTypeEnum.ARRAY
  }
  if (isRecord(value)) {
    return XpertParameterTypeEnum.OBJECT
  }
  if (typeof value === 'number') {
    return XpertParameterTypeEnum.NUMBER
  }
  if (typeof value === 'boolean') {
    return XpertParameterTypeEnum.BOOLEAN
  }
  return XpertParameterTypeEnum.STRING
}

function buildDynamicVariables(
  value: unknown,
  prefix: string | null,
  parent: string | null
): Array<[string, unknown, string | null]> {
  if (!isRecord(value)) {
    return []
  }

  const variables: Array<[string, unknown, string | null]> = []
  Object.entries(value).forEach(([key, childValue]) => {
    const name = prefix ? `${prefix}.${key}` : key
    variables.push([name, childValue, parent])
    if (isRecord(childValue)) {
      variables.push(...buildDynamicVariables(childValue, name, name))
    }
  })

  return variables
}

function applyVariableLevels(variables: TInspectorVariable[]) {
  const variablesByName = new Map<string, TInspectorVariable>()
  variables.forEach((variable) => variablesByName.set(variable.name, variable))

  return variables.map((variable) => {
    let level = 0
    let currentName = variable.parent
    let guard = 0

    while (currentName && guard < 50) {
      const parent = variablesByName.get(currentName)
      if (!parent) {
        break
      }
      level += 1
      currentName = parent.parent
      guard += 1
    }

    return {
      ...variable,
      level
    }
  })
}

function getValueByPath(value: unknown, path: string) {
  return path.split('.').reduce((current, key) => {
    if (!isRecord(current) && !Array.isArray(current)) {
      return undefined
    }
    return current?.[key]
  }, value as any)
}

function looksLikeMarkdown(value: string) {
  return /(^#{1,6}\s)|(```)|(\[[^\]]+\]\([^)]+\))|(^-\s)|(^\d+\.\s)|(\*\*)|(__)|(\|.+\|)/m.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
