import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal
} from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IIntegration, TIntegrationProvider, TWorkflowTriggerIntegration } from '@xpert-ai/contracts'
import { XpI18nPipe, ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import {
  getErrorMessage,
  IntegrationService,
  IntegrationTestResult,
  normalizeIntegrationTestResult
} from '../../../@core'
import { ParameterFormComponent } from '../../../@shared/forms'
import { buildJsonSchemaDefaults, hasJsonSchemaRequiredErrors } from '../../../@shared/workflow'
import { ClawXpertFacade } from '../../chat/clawxpert/clawxpert.facade'

@Component({
  standalone: true,
  selector: 'xp-assistant-integration-create',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardInputDirective,
    ParameterFormComponent
  ],
  templateUrl: './assistant-integration-create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssistantIntegrationCreateComponent implements OnInit, OnDestroy {
  private readonly api = inject(IntegrationService)
  private readonly facade = inject(ClawXpertFacade)
  readonly requirement = input.required<TWorkflowTriggerIntegration>()
  readonly organizationId = input.required<string>()
  readonly xpertId = input.required<string>()
  readonly created = output<IIntegration>()
  readonly cancel = output<void>()
  readonly busyChange = output<boolean>()
  readonly providers = signal<TIntegrationProvider[]>([])
  readonly selectedProvider = signal<TIntegrationProvider | null>(null)
  readonly options = signal<Record<string, unknown>>({})
  readonly loading = signal(false)
  readonly busy = signal(false)
  readonly error = signal<string | null>(null)
  readonly saved = signal<IIntegration | null>(null)
  readonly result = signal<IntegrationTestResult | null>(null)
  readonly tested = signal(false)
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] })
  })
  readonly invalidOptions = computed(() => hasJsonSchemaRequiredErrors(this.selectedProvider()?.schema, this.options()))
  readonly scopeChanged = computed(
    () => this.facade.organizationId() !== this.organizationId() || this.facade.xpertId() !== this.xpertId()
  )
  private destroyed = false

  ngOnInit() {
    void this.loadProviders()
  }

  async loadProviders() {
    if (this.loading() || this.busy()) return
    this.loading.set(true)
    this.error.set(null)
    try {
      const providers = await firstValueFrom(this.api.getProviders())
      if (this.destroyed || this.scopeChanged()) return
      const allowed = providers.filter((provider) => this.requirement().providers.includes(provider.name))
      this.providers.set(allowed)
      this.selectProvider(allowed[0]?.name ?? '')
    } catch (error) {
      if (!this.destroyed) this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  selectProvider(name: string) {
    if (this.busy() || this.saved()) return
    const provider = this.providers().find(
      (provider) => provider.name === name && this.requirement().providers.includes(name)
    )
    this.selectedProvider.set(provider ?? null)
    this.options.set(buildJsonSchemaDefaults(provider?.schema) ?? {})
    this.result.set(null)
    this.tested.set(false)
    this.error.set(null)
  }

  updateOptions(options: Record<string, unknown>) {
    this.options.set(options)
    this.tested.set(false)
    this.result.set(null)
  }

  canSubmit() {
    return (
      !this.destroyed &&
      !this.loading() &&
      !this.busy() &&
      !this.scopeChanged() &&
      this.form.valid &&
      !this.invalidOptions() &&
      !!this.selectedProvider() &&
      this.requirement().providers.includes(this.selectedProvider().name)
    )
  }

  private payload(): Partial<IIntegration<Record<string, unknown>>> {
    return {
      name: this.form.controls.name.value.trim(),
      provider: this.selectedProvider().name,
      options: structuredClone(this.options()),
      features: this.selectedProvider().features ?? [],
      organizationId: this.organizationId()
    }
  }

  async create() {
    if (this.saved() || !this.canSubmit()) return
    const payload = this.payload()
    this.setBusy(true)
    this.error.set(null)
    try {
      const integration = await firstValueFrom(this.api.create(payload))
      if (this.destroyed || this.scopeChanged()) return
      this.saved.set(integration)
      // Saved ids are needed to compute callback URLs and authorization links.
      if (this.selectedProvider()?.setup?.autoValidateOnLoad) await this.validate(integration)
    } catch (error) {
      if (!this.destroyed) this.error.set(getErrorMessage(error))
    } finally {
      this.setBusy(false)
    }
  }

  async test() {
    if (!this.canSubmit()) return
    this.setBusy(true)
    this.error.set(null)
    try {
      await this.validate(this.saved() ?? this.payload())
    } catch (error) {
      if (!this.destroyed) this.error.set(getErrorMessage(error))
    } finally {
      this.setBusy(false)
    }
  }

  private async validate(integration: Partial<IIntegration>) {
    this.tested.set(false)
    this.result.set(null)
    const result = await firstValueFrom(this.api.test(integration))
    if (this.destroyed || this.scopeChanged()) return
    this.result.set(normalizeIntegrationTestResult(result))
    this.tested.set(true)
  }

  useIntegration() {
    const integration = this.saved()
    if (
      integration &&
      !this.busy() &&
      !this.scopeChanged() &&
      this.requirement().providers.includes(integration.provider)
    ) {
      this.created.emit(integration)
    }
  }

  private setBusy(busy: boolean) {
    this.busy.set(busy)
    if (!this.destroyed) this.busyChange.emit(busy)
  }

  ngOnDestroy() {
    this.destroyed = true
  }
}
