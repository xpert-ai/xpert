import { CommonModule } from '@angular/common'
import { afterNextRender, booleanAttribute, ChangeDetectorRef, Component, computed, effect, inject, input, Signal, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule } from '@angular/forms'
import { JSON_SCHEMA_WIDGET_CONTEXT } from '@cloud/app/@shared/forms'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { catchError, combineLatest, distinctUntilChanged, map, of, tap } from 'rxjs'
import {
  getEnabledTools,
  injectXpertAgentAPI,
  IWFNMiddleware,
  IWorkflowNode,
  IXpertAgent,
  IXpertToolset,
  TXpertGraph,
  TXpertTeamNode,
  WorkflowNodeTypeEnum
} from '../../../../@core'
import { XpertToolsetService } from 'apps/cloud/src/app/@core'

type InterruptDecision = 'approve' | 'edit' | 'reject'
type InterruptOnConfig = Record<
  string,
  {
    description: string
    allowedDecisions: InterruptDecision[]
  }
>

type ToolOption = {
  name: string
  description?: string
}

const DEFAULT_DECISIONS: InterruptDecision[] = ['approve', 'edit', 'reject']

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  selector: 'xp-agent-interrupt-on',
  templateUrl: 'interrupt-on.component.html',
  styleUrls: ['interrupt-on.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class AgentInterruptOnComponent implements ControlValueAccessor {
  protected cva = inject<NgxControlValueAccessor<InterruptOnConfig | null>>(NgxControlValueAccessor)
  readonly context = inject<{ context: Signal<{ draft: TXpertGraph; entity: IWFNMiddleware }> }>(
    JSON_SCHEMA_WIDGET_CONTEXT,
    { optional: true }
  )
  readonly agentAPI = injectXpertAgentAPI()
  readonly toolsetService = inject(XpertToolsetService)
  readonly #cdr = inject(ChangeDetectorRef)

  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly required = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  onChange: ((value: InterruptOnConfig | null) => void) | null = null
  onTouched: (() => void) | null = null

  // States
  readonly draft = computed(() => this.context?.context().draft)
  readonly entity = computed(() => this.context?.context().entity)
  readonly agentNode = computed(
    () => {
      const draft = this.draft()
      const entity = this.entity()
      if (!draft || !entity?.key) {
        return null
      }
      return this.resolveAgentNode(draft, entity.key)
    },
    { equal: (a, b) => normalizeKey(a?.key) === normalizeKey(b?.key) }
  )

  // Models
  readonly interruptOn = this.cva.value$
  readonly toolEntries = computed(() => {
    const configs = this.normalizeConfigs(this.interruptOn())
    return Object.entries(configs).map(([name, config]) => ({
      name,
      description: config.description ?? '',
      allowedDecisions: config.allowedDecisions ?? []
    }))
  })

  readonly middlewareToolRequests = computed(() => {
    const draft = this.draft()
    const entity = this.entity()
    const agentNode = this.agentNode()
    if (!draft || !entity?.key || !agentNode) {
      return []
    }

    const middlewareConnections = (draft.connections ?? []).filter(
      (connection) =>
        connection.type === 'workflow' && normalizeKey(connection.from) === normalizeKey(agentNode.key)
    )

    const unique = new Map<string, { provider: string; options: Record<string, any> }>()
    middlewareConnections.forEach((connection) => {
      const node = draft.nodes?.find((item) => normalizeKey(item.key) === normalizeKey(connection.to))
      if (!node) return
      const middleware = node.entity as IWorkflowNode
      if (middleware?.type !== WorkflowNodeTypeEnum.MIDDLEWARE) {
        return
      }
      const provider = (middleware as IWFNMiddleware).provider
      if (!provider) {
        return
      }
      const key = normalizeKey(node.key)
      if (!unique.has(key)) {
        unique.set(key, { provider, options: (middleware as IWFNMiddleware).options ?? {} })
      }
    })

    return Array.from(unique.values())
  })

  readonly #middlewareToolsRes = myRxResource({
    request: () => this.middlewareToolRequests(),
    loader: ({ request }) => {
      if (!request?.length) {
        return of<ToolOption[]>([])
      }

      return combineLatest(
        request.map((item) =>
          this.agentAPI.getAgentMiddlewareTools(item.provider, item.options).pipe(
            map((tools) => tools?.map((tool) => ({ name: tool.name, description: tool.description })) ?? []),
            catchError(() => of<ToolOption[]>([]))
          )
        )
      ).pipe(
        map((results) => results.flat()),
        tap(() => {
          this.#cdr.markForCheck()
          this.#cdr.detectChanges()
          setTimeout(() => this.#cdr.detectChanges(), 1000)
        })
      )
    }
  })

  readonly middlewareTools = computed(() => this.#middlewareToolsRes.value() ?? [])

  readonly toolsetToolRequests = computed(() => {
    const draft = this.draft()
    const agentNode = this.agentNode()
    if (!draft || !agentNode) {
      return []
    }

    const toolsetConnections = (draft.connections ?? []).filter(
      (connection) => connection.type === 'toolset' && normalizeKey(connection.from) === normalizeKey(agentNode.key)
    )

    const unique = new Map<string, { id: string; name: string }>()
    toolsetConnections.forEach((connection) => {
      const toolsetNode = draft.nodes?.find(
        (node) => node.type === 'toolset' && normalizeKey(node.key) === normalizeKey(connection.to)
      ) as (TXpertTeamNode & { type: 'toolset'; entity: IXpertToolset }) | undefined

      const toolset = toolsetNode?.entity
      if (!toolset?.id) {
        return
      }
      const key = normalizeKey(toolset.id)
      if (!unique.has(key)) {
        unique.set(key, { id: toolset.id, name: toolset.name })
      }
    })

    return Array.from(unique.values())
  })

  readonly #toolsetToolsRes = myRxResource({
    request: () => this.toolsetToolRequests(),
    loader: ({ request }) => {
      if (!request?.length) {
        return of<{ toolsetName: string; tools: ToolOption[] }[]>([])
      }
      return combineLatest(
        request.map((item) =>
          this.toolsetService.getOneById(item.id, { relations: ['tools'] }).pipe(
            map((toolset) => ({
              toolsetName: toolset?.name ?? item.name,
              tools: (getEnabledTools(toolset) ?? []).map((tool) => ({
                name: tool.name,
                description: tool.description
              }))
            })),
            catchError(() => of({ toolsetName: item.name, tools: [] as ToolOption[] })),
            tap(() => {
              this.#cdr.markForCheck()
              this.#cdr.detectChanges()
              setTimeout(() => this.#cdr.detectChanges(), 1000)
            })
          )
        )
      )
    }
  })

  readonly toolsetTools = computed<ToolOption[]>(() => {
    const agentNode = this.agentNode()
    if (!agentNode) {
      return []
    }

    const availableToolsMap = agentNode.entity.options?.availableTools ?? {}
    const toolOptions: ToolOption[] = []

    ;(this.#toolsetToolsRes.value() ?? []).forEach(({ toolsetName, tools }) => {
      const allowed = availableToolsMap?.[toolsetName] ?? []
      const filteredTools = allowed.length ? tools.filter((tool) => allowed.includes(tool.name)) : tools
      filteredTools.forEach((tool) => {
        toolOptions.push(tool)
      })
    })

    const uniqueTools = new Map<string, ToolOption>()
    toolOptions.forEach((tool) => {
      if (!uniqueTools.has(tool.name)) {
        uniqueTools.set(tool.name, tool)
      }
    })

    return Array.from(uniqueTools.values())
  })

  readonly availableTools = computed<ToolOption[]>(() => {
    const tools = [...this.toolsetTools(), ...this.middlewareTools()]
    const unique = new Map<string, ToolOption>()
    tools.forEach((tool) => {
      if (tool?.name && !unique.has(tool.name)) {
        unique.set(tool.name, tool)
      }
    })
    return Array.from(unique.values())
  })

  readonly toolOptions = computed(() => {
    const options = new Map<string, ToolOption>()
    this.availableTools().forEach((tool) => options.set(tool.name, tool))
    this.toolEntries().forEach((tool) => {
      if (!options.has(tool.name)) {
        options.set(tool.name, { name: tool.name })
      }
    })
    return Array.from(options.values())
  })
  readonly addableTools = computed(() => {
    const used = new Set(this.toolEntries().map((tool) => tool.name))
    return this.availableTools().filter((tool) => !used.has(tool.name))
  })
  readonly selectedTool = signal<string | null>(null)
  readonly decisionOptions = DEFAULT_DECISIONS

  private valueChangeSub = this.cva.valueChange.pipe(distinctUntilChanged()).subscribe((value) => {
    this.onChange?.(value)
  })

  constructor() {
    afterNextRender(() => {
      setTimeout(() => {
        this.#cdr.detectChanges()
      }, 1000);
    })
  }

  writeValue(obj: any): void {
    this.cva.writeValue(obj)
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.cva.setDisabledState(isDisabled)
  }

  addTool() {
    if (this.readonly()) return
    const nextTool = this.selectedTool() ?? this.addableTools()[0]?.name
    if (!nextTool) return

    const available = this.availableTools().find((tool) => tool.name === nextTool)
    const description = available?.description ?? ''

    this.updateConfigs((configs) => ({
      ...configs,
      [nextTool]: {
        description,
        allowedDecisions: [...DEFAULT_DECISIONS]
      }
    }))

    const remaining = this.addableTools().filter((tool) => tool.name !== nextTool)
    this.selectedTool.set(remaining[0]?.name ?? null)
  }

  removeTool(name: string) {
    if (this.readonly()) return
    this.updateConfigs((configs) => {
      const next = { ...configs }
      delete next[name]
      return next
    })
  }

  updateDescription(name: string, description: string) {
    this.updateConfigs((configs) => ({
      ...configs,
      [name]: {
        ...(configs[name] ?? { description: '', allowedDecisions: [] }),
        description
      }
    }))
  }

  updateToolName(previousName: string, nextName: string) {
    if (this.readonly()) return
    if (!nextName || previousName === nextName) return

    this.updateConfigs((configs) => {
      if (configs[nextName]) {
        return configs
      }
      if (!configs[previousName]) {
        return configs
      }
      const next = { ...configs }
      next[nextName] = next[previousName]
      delete next[previousName]
      return next
    })
  }

  toggleDecision(name: string, decision: InterruptDecision, event: Event) {
    if (this.readonly()) return
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false

    this.updateConfigs((configs) => {
      const current = configs[name] ?? { description: '', allowedDecisions: [] }
      const allowed = new Set(current.allowedDecisions ?? [])
      if (checked) {
        allowed.add(decision)
      } else {
        allowed.delete(decision)
      }

      return {
        ...configs,
        [name]: {
          ...current,
          allowedDecisions: Array.from(allowed)
        }
      }
    })
  }

  private updateConfigs(updater: (configs: InterruptOnConfig) => InterruptOnConfig) {
    this.interruptOn.update((value) => updater(this.normalizeConfigs(value)))
  }

  private normalizeConfigs(value: unknown): InterruptOnConfig {
    const record = this.normalizeRecord(value)
    const normalized: InterruptOnConfig = {}

    Object.entries(record).forEach(([name, config]) => {
      const normalizedConfig = this.normalizeConfig(config)
      if (normalizedConfig) {
        normalized[name] = normalizedConfig
      }
    })

    return normalized
  }

  private normalizeRecord(value: unknown): Record<string, unknown> {
    if (Array.isArray(value)) {
      return value.reduce(
        (acc, item) => {
          if (typeof item === 'string' && item) {
            acc[item] = true
          }
          return acc
        },
        {} as Record<string, unknown>
      )
    }

    if (value && typeof value === 'object') {
      return value as Record<string, unknown>
    }

    return {}
  }

  private normalizeConfig(value: unknown): InterruptOnConfig[string] | null {
    if (value === false || value == null) {
      return null
    }

    if (value === true) {
      return {
        description: '',
        allowedDecisions: [...DEFAULT_DECISIONS]
      }
    }

    if (typeof value === 'object') {
      const raw = value as { description?: unknown; allowedDecisions?: unknown }
      const description = typeof raw.description === 'string' ? raw.description : ''
      const allowedDecisions = Array.isArray(raw.allowedDecisions)
        ? raw.allowedDecisions.filter((decision): decision is InterruptDecision =>
            DEFAULT_DECISIONS.includes(decision as InterruptDecision)
          )
        : [...DEFAULT_DECISIONS]

      return {
        description,
        allowedDecisions
      }
    }

    return null
  }

  private resolveAgentNode(draft: TXpertGraph, middlewareKey: string) {
    const connection = draft.connections?.find(
      (conn) => conn.type === 'workflow' && normalizeKey(conn.to) === normalizeKey(middlewareKey)
    )
    if (!connection) {
      return null
    }

    return draft.nodes?.find(
      (node) => node.type === 'agent' && normalizeKey(node.key) === normalizeKey(connection.from)
    ) as (TXpertTeamNode & { type: 'agent'; entity: IXpertAgent }) | null
  }
}

function normalizeKey(key?: string | null) {
  return key?.split('/')?.[0] ?? ''
}
