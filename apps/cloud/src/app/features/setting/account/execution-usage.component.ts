import { modelExecutionSourceId, modelExecutionEntry } from '@xpert-ai/contracts'
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { ModelExecutionCallView, ModelExecutionCallQuery } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardSelectImports } from '@xpert-ai/headless-ui'
import { injectOrganizationId } from '../../../@core/state'
import { CopilotUsageService } from '../../../@core/services/copilot-usage.service'

const ALL_EXECUTION_FILTERS = '__all__'

@Component({
  standalone: true,
  selector: 'xp-execution-usage',
  imports: [ReactiveFormsModule, CommonModule, TranslateModule, ZardButtonComponent, ...ZardSelectImports],
  templateUrl: './execution-usage.component.html'
})
export class ExecutionUsageComponent {
  readonly entry = modelExecutionEntry
  readonly all = ALL_EXECUTION_FILTERS
  readonly #usage = inject(CopilotUsageService)
  readonly organizationId = injectOrganizationId()
  readonly items = signal<ModelExecutionCallView[]>([])
  readonly loading = signal(false)
  readonly failed = signal(false)
  readonly total = signal(0)
  readonly page = signal(0)
  readonly pageSize = 20
  readonly assistants = signal<Array<{ id: string; name: string }>>([])
  readonly models = signal<string[]>([])
  readonly tools = signal<string[]>([])
  readonly filters = new FormGroup(
    {
      entry: new FormControl<ModelExecutionCallQuery['entry'] | typeof ALL_EXECUTION_FILTERS>(this.all, {
        nonNullable: true
      }),
      status: new FormControl<ModelExecutionCallQuery['status'] | typeof ALL_EXECUTION_FILTERS>(this.all, {
        nonNullable: true
      }),
      environment: new FormControl<ModelExecutionCallQuery['environment'] | typeof ALL_EXECUTION_FILTERS>(this.all, {
        nonNullable: true
      }),
      usageSource: new FormControl<ModelExecutionCallQuery['usageSource'] | typeof ALL_EXECUTION_FILTERS>(this.all, {
        nonNullable: true
      }),
      pricingStatus: new FormControl<ModelExecutionCallQuery['pricingStatus'] | typeof ALL_EXECUTION_FILTERS>(
        this.all,
        { nonNullable: true }
      ),
      assistantId: new FormControl(this.all, { nonNullable: true }),
      model: new FormControl(this.all, { nonNullable: true, validators: Validators.maxLength(191) }),
      tool: new FormControl(this.all, { nonNullable: true, validators: Validators.maxLength(80) }),
      executionId: new FormControl('', {
        nonNullable: true,
        validators: (control) => {
          const value = String(control.value ?? '').trim()
          return !value || /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) ? null : { executionId: true }
        }
      }),
      startedAfter: new FormControl('', { nonNullable: true }),
      startedBefore: new FormControl('', { nonNullable: true })
    },
    { validators: executionDateRange }
  )
  // Pagination and refresh use the applied query, not edits still in the filter form.
  #filter: ModelExecutionCallQuery = {}
  #version = 0
  #scopeVersion = 0

  applyFilters() {
    if (this.filters.invalid) {
      this.filters.markAllAsTouched()
      return
    }
    const value = this.filters.getRawValue()
    this.#filter = {
      entry: value.entry === this.all ? undefined : value.entry,
      status: value.status === this.all ? undefined : value.status,
      environment: value.environment === this.all ? undefined : value.environment,
      usageSource: value.usageSource === this.all ? undefined : value.usageSource,
      pricingStatus: value.pricingStatus === this.all ? undefined : value.pricingStatus,
      assistantId: value.assistantId === this.all ? undefined : value.assistantId || undefined,
      model: value.model === this.all ? undefined : value.model.trim() || undefined,
      tool: value.tool === this.all ? undefined : value.tool.trim() || undefined,
      executionId: value.executionId.trim() || undefined,
      startedAfter: value.startedAfter ? new Date(value.startedAfter + 'T00:00:00').toISOString() : undefined,
      startedBefore: value.startedBefore ? new Date(value.startedBefore + 'T23:59:59.999').toISOString() : undefined
    }
    this.page.set(0)
    void this.load()
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#version++
      this.#scopeVersion++
    })
    effect(() => {
      this.organizationId()
      untracked(() => {
        this.#scopeVersion++
        this.page.set(0)
        this.filters.reset()
        this.#filter = {}
        this.assistants.set([])
        this.models.set([])
        this.tools.set([])
        void this.loadOptions()
        void this.load()
      })
    })
  }
  async loadOptions() {
    const scopeVersion = this.#scopeVersion
    if (!this.organizationId()) return
    try {
      const result = await firstValueFrom(this.#usage.getExecutionCallOptions())
      if (scopeVersion === this.#scopeVersion) {
        this.assistants.set(result.assistants)
        this.models.set(result.models)
        this.tools.set(result.tools)
      }
    } catch {
      /* Filtering by other dimensions remains available. */
    }
  }
  async load() {
    const version = ++this.#version
    this.items.set([])
    this.failed.set(false)
    this.total.set(0)
    if (!this.organizationId()) {
      this.loading.set(false)
      return
    }
    this.loading.set(true)
    try {
      const result = await firstValueFrom(
        this.#usage.getExecutionCalls(this.pageSize, this.page() * this.pageSize, this.#filter)
      )
      if (version === this.#version) {
        this.items.set(result.items)
        this.total.set(result.total)
      }
    } catch {
      if (version === this.#version) this.failed.set(true)
    } finally {
      if (version === this.#version) this.loading.set(false)
    }
  }
  changePage(delta: number) {
    this.page.update((page) => Math.max(0, page + delta))
    void this.load()
  }
  executionId(item: ModelExecutionCallView) {
    return modelExecutionSourceId(item.context.source)
  }
  customOption(value: string, options: string[]) {
    const normalized = value.trim()
    return normalized && normalized !== this.all && !options.includes(normalized) ? normalized : null
  }
}

/** Local date boundaries are inclusive; reject invalid or reversed ranges before sending a request. */
function executionDateRange(control: AbstractControl) {
  const start: unknown = control.get('startedAfter')?.value
  const end: unknown = control.get('startedBefore')?.value
  if (typeof start !== 'string' || typeof end !== 'string') return { dateRange: true }
  for (const value of [start, end]) {
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value + 'T00:00:00')) ||
        new Date(value + 'T00:00:00').getDate() !== Number(value.slice(-2)))
    )
      return { dateRange: true }
  }
  return start && end && start > end ? { dateRange: true } : null
}
