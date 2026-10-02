import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { ModelExecutionCallView, ModelExecutionCallQuery } from '@xpert-ai/contracts'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { injectOrganizationId } from '../../../@core/state'
import { CopilotUsageService } from '../../../@core/services/copilot-usage.service'

@Component({
  standalone: true,
  selector: 'xp-execution-usage',
  imports: [ReactiveFormsModule, CommonModule, TranslateModule, ZardButtonComponent],
  templateUrl: './execution-usage.component.html'
})
export class ExecutionUsageComponent {
  readonly #usage = inject(CopilotUsageService)
  readonly organizationId = injectOrganizationId()
  readonly items = signal<ModelExecutionCallView[]>([])
  readonly loading = signal(false)
  readonly failed = signal(false)
  readonly total = signal(0)
  readonly page = signal(0)
  readonly pageSize = 20
  readonly assistants = signal<Array<{ id: string; name: string }>>([])
  readonly filters = new FormGroup(
    {
      entry: new FormControl<ModelExecutionCallQuery['entry'] | ''>('', { nonNullable: true }),
      status: new FormControl<ModelExecutionCallQuery['status'] | ''>('', { nonNullable: true }),
      environment: new FormControl<ModelExecutionCallQuery['environment'] | ''>('', { nonNullable: true }),
      usageSource: new FormControl<ModelExecutionCallQuery['usageSource'] | ''>('', { nonNullable: true }),
      pricingStatus: new FormControl<ModelExecutionCallQuery['pricingStatus'] | ''>('', { nonNullable: true }),
      assistantId: new FormControl('', { nonNullable: true }),
      model: new FormControl('', { nonNullable: true, validators: Validators.maxLength(191) }),
      tool: new FormControl('', { nonNullable: true, validators: Validators.maxLength(80) }),
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
      entry: value.entry || undefined,
      status: value.status || undefined,
      environment: value.environment || undefined,
      usageSource: value.usageSource || undefined,
      pricingStatus: value.pricingStatus || undefined,
      assistantId: value.assistantId || undefined,
      model: value.model.trim() || undefined,
      tool: value.tool.trim() || undefined,
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
      if (scopeVersion === this.#scopeVersion) this.assistants.set(result.assistants)
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
    return item.context.source.type === 'cli_session'
      ? item.context.source.cliSessionId
      : item.context.source.invocationId
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
