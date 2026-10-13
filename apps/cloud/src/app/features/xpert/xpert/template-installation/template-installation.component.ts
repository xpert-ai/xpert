import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core'
import { DialogRef } from '@angular/cdk/dialog'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { toSignal } from '@angular/core/rxjs-interop'
import { Store, API_PREFIX } from '@cloud/app/@core/state'
import {
  AiProviderRole,
  CopilotServerService,
  getErrorMessage,
  XpertAPIService,
  XpertTemplateService,
  XpertWorkspaceService
} from '@cloud/app/@core'
import { TemplateInstallationService } from '@cloud/app/@core/services/template-installation.service'
import { XpDialogFrameImports, ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import type { IXpertWorkspace, TemplateInstallation, XpertTemplateSetup, TXpertTemplate } from '@xpert-ai/contracts'
import {
  createInstallationClient,
  installationStageLabels,
  installationStatusLabel,
  type InstallationSnapshot
} from '@xpert-ai/template-installation-client'
import type { BlankXpertWizardResult } from '../blank/blank-wizard-data'

const empty: InstallationSnapshot = {
  operation: null,
  history: [],
  hasMore: false,
  busy: false,
  uncertain: false,
  error: ''
}
@Component({
  selector: 'xp-template-installation',
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, ...XpDialogFrameImports, ZardButtonComponent, ZardInputDirective],
  templateUrl: './template-installation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col overflow-hidden' }
})
export class TemplateInstallationComponent {
  readonly templateId = input.required<string>()
  readonly initialWorkspaceId = input<string | null>(null)
  readonly completed = output<BlankXpertWizardResult>()
  readonly back = output<void>()
  private readonly store = inject(Store)
  private readonly service = inject(TemplateInstallationService)
  private readonly templates = inject(XpertTemplateService)
  private readonly workspacesService = inject(XpertWorkspaceService)
  private readonly xperts = inject(XpertAPIService)
  private readonly copilots = inject(CopilotServerService)
  private readonly router = inject(Router)
  private readonly dialog = inject(DialogRef)
  readonly translate = inject(TranslateService)
  private readonly organizationId = toSignal(this.store.selectOrganizationId())
  private readonly user = toSignal(this.store.user$)
  readonly workspaces = signal<IXpertWorkspace[]>([])
  readonly workspaceId = signal('')
  readonly template = signal<TXpertTemplate | null>(null)
  readonly setup = signal<XpertTemplateSetup | null>(null)
  readonly state = signal<InstallationSnapshot>(empty)
  readonly loading = signal(false)
  readonly primaryAvailable = signal(false)
  readonly revision = signal(0)
  readonly error = signal('')
  readonly capabilities = signal<string[]>([])
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    model: new FormControl('', { nonNullable: true }),
    voiceModel: new FormControl('', { nonNullable: true }),
    voice: new FormControl('', { nonNullable: true })
  })
  readonly statusLabel = installationStatusLabel
  readonly stages = installationStageLabels
  client: ReturnType<typeof createInstallationClient> | null = null
  constructor() {
    effect((cleanup) => {
      const id = this.templateId(),
        organization = this.organizationId(),
        user = this.user()
      const preferred = this.initialWorkspaceId()
      let active = true
      cleanup(() => {
        active = false
      })
      this.workspaceId.set('')
      this.workspaces.set([])
      this.template.set(null)
      this.error.set('')
      if (!organization || !user?.id) return
      this.loading.set(true)
      void Promise.all([
        firstValueFrom(this.templates.getTemplate(id, this.translate.currentLang)),
        firstValueFrom(this.workspacesService.getAllMy(undefined, { purpose: 'authoring' }))
      ])
        .then(([template, result]) => {
          if (!active) return
          this.template.set(template)
          this.form.controls.title.setValue(typeof template.title === 'string' ? template.title : template.name)
          const workspaces = result.items.filter((item) => item.capabilities?.canWrite)
          this.workspaces.set(workspaces)
          this.workspaceId.set(workspaces.some((item) => item.id === preferred) ? preferred : (workspaces[0]?.id ?? ''))
        })
        .catch((error) => {
          if (active) this.error.set(getErrorMessage(error))
        })
        .finally(() => {
          if (active) this.loading.set(false)
        })
    })
    effect((cleanup) => {
      const id = this.templateId(),
        capabilities = this.capabilities(),
        organization = this.organizationId()
      this.revision()
      let active = true
      cleanup(() => {
        active = false
      })
      this.setup.set(null)
      if (!organization) return
      this.primaryAvailable.set(false)
      this.error.set('')
      void firstValueFrom(this.templates.getSetup(id, capabilities))
        .then(async (setup) => {
          const primary =
            setup.requiresModel || setup.requiredModelFeatures.length
              ? null
              : await firstValueFrom(this.copilots.getAvailableByRole(AiProviderRole.Primary))
          if (!active) return
          this.primaryAvailable.set(
            !!primary?.id &&
              !!primary.copilotModel?.model?.trim() &&
              (!primary.copilotModel.modelType || primary.copilotModel.modelType === 'llm')
          )
          this.setup.set(setup)
          if (!setup.models.some((model) => model.id === this.form.controls.model.value))
            this.form.controls.model.setValue(setup.defaultModelId ?? '')
        })
        .catch((error) => {
          if (active) this.error.set(getErrorMessage(error))
        })
    })
    effect((cleanup) => {
      const workspaceId = this.workspaceId(),
        templateId = this.templateId(),
        organization = this.organizationId(),
        user = this.user()
      this.state.set(empty)
      this.client = null
      if (!workspaceId || !organization || !user?.id) return
      const client = createInstallationClient({
        transport: this.service,
        storage: localStorage,
        scope: JSON.stringify([API_PREFIX, user.tenantId, user.id, organization]),
        workspaceId,
        templateId,
        changed: (state) => this.state.set(state),
        errorMessage: getErrorMessage
      })
      this.client = client
      cleanup(() => client.dispose())
      untracked(() => void client.restore().then(() => client.history()))
    })
  }
  selectWorkspace(event: Event) {
    if (event.target instanceof HTMLSelectElement) this.workspaceId.set(event.target.value)
  }
  toggleCapability(key: string, event: Event) {
    if (!(event.target instanceof HTMLInputElement)) return
    const checked = event.target.checked
    this.capabilities.update((items) => (checked ? [...items, key] : items.filter((item) => item !== key)))
  }
  canStart() {
    const setup = this.setup()
    return (
      !!this.client &&
      !this.loading() &&
      !this.state().busy &&
      !this.state().operation &&
      !this.state().uncertain &&
      this.form.valid &&
      !!this.form.controls.title.value.trim() &&
      setup?.canInstall &&
      (setup.requiresModel || setup.requiredModelFeatures.length
        ? setup.models.some((model) => model.id === this.form.controls.model.value)
        : this.primaryAvailable()) &&
      (!this.capabilities().includes('realtime-voice') ||
        (!!this.form.controls.voiceModel.value && !!this.form.controls.voice.value))
    )
  }
  async start() {
    if (!this.canStart()) return
    const model = this.setup()?.models.find((item) => item.id === this.form.controls.model.value)?.copilotModel
    await this.client.start({
      templateId: this.templateId(),
      workspaceId: this.workspaceId(),
      publish: true,
      locale: this.translate.currentLang || 'en',
      capabilities: this.capabilities(),
      basic: {
        title: this.form.controls.title.value.trim(),
        ...(model ? { copilotModel: { copilotId: model.copilotId, model: model.model } } : {}),
        ...(this.capabilities().includes('realtime-voice')
          ? { realtimeVoice: { modelId: this.form.controls.voiceModel.value, voice: this.form.controls.voice.value } }
          : {})
      }
    })
  }
  async open(operation: TemplateInstallation, configure = false) {
    if (!operation.assistantId || operation.status !== 'succeeded') return
    try {
      if (configure) {
        await this.router.navigate(['/xpert/w', operation.workspaceId, 'connectors'])
        this.dialog.close()
        return
      }
      const xpert = await firstValueFrom(this.xperts.getById(operation.assistantId))
      this.completed.emit({ xpert, status: operation.publish ? 'published' : 'created' })
    } catch (error) {
      this.error.set(getErrorMessage(error))
    }
  }
}
