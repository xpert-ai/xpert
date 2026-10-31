import { ZardSelectImports } from '@xpert-ai/headless-ui'
import { DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  DefaultModelRole,
  defaultModelDefinition,
  ICopilotModel,
  ParameterRule,
  RoleDefaultInput,
  RoleDefaultSetting,
  transitionModelParameters
} from '@xpert-ai/contracts'
import { XpDialogFrameImports, XpI18nPipe, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { CopilotProviderService, CopilotServerService, getErrorMessage } from '../../../../@core'
import { injectOrganizationId } from '../../../../@core/state'
import { CopilotModelSelectComponent } from '../../../../@shared/copilot/copilot-model-select/select.component'
import { ModelParameterInputComponent } from '../../../../@shared/copilot/model-parameter-input/input.component'
import { ManagementCopilotServerService } from '../copilot-form/management-copilot-server.service'

@Component({
  standalone: true,
  selector: 'xp-default-models-dialog',
  providers: [{ provide: CopilotServerService, useClass: ManagementCopilotServerService }],
  imports: [
    ...ZardSelectImports,
    FormsModule,
    TranslateModule,
    XpI18nPipe,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    CopilotModelSelectComponent,
    ModelParameterInputComponent
  ],
  templateUrl: './defaults.component.html'
})
export class DefaultModelsDialogComponent {
  readonly translate = inject(TranslateService)
  readonly dialog = inject(DialogRef<boolean>)
  readonly server = inject(CopilotServerService)
  readonly providers = inject(CopilotProviderService)
  readonly organizationId = injectOrganizationId()
  readonly settings = signal<RoleDefaultSetting[]>([])
  readonly loading = signal(true)
  readonly saving = signal(false)
  readonly error = signal('')
  readonly editingRole = signal<DefaultModelRole | null>(null)
  readonly parameterModel = signal<ICopilotModel | null>(null)
  readonly rules = signal<ParameterRule[]>([])
  readonly parametersLoading = signal(false)
  readonly parameterError = signal('')
  private parameterRequest = 0
  readonly resolvedParameters = computed(() =>
    transitionModelParameters(this.parameterModel()?.options, this.rules(), 'compatible')
  )
  readonly roles = DefaultModelRole
  label(role: DefaultModelRole) {
    return defaultModelDefinition(role).group === 'roles'
      ? 'XP.Copilot.Management.Role.' + role
      : 'XP.ModelAccess.ModelTypeValue.' + this.type(role)
  }
  constructor() {
    void this.load()
  }
  type(role: DefaultModelRole) {
    return defaultModelDefinition(role).modelType
  }
  async load() {
    this.loading.set(true)
    this.error.set('')
    try {
      this.settings.set(await firstValueFrom(this.server.getRoleDefaults()))
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
  setMode(role: DefaultModelRole, mode: RoleDefaultSetting['mode']) {
    this.settings.update((rows) =>
      rows.map((row) =>
        row.role === role
          ? {
              ...row,
              mode,
              ...(mode === 'inherit'
                ? { binding: row.inheritedBinding ?? null, available: row.inheritedAvailable ?? false }
                : {})
            }
          : row
      )
    )
  }
  setBinding(role: DefaultModelRole, model: ICopilotModel | null) {
    this.settings.update((rows) =>
      rows.map((row) =>
        row.role === role
          ? {
              ...row,
              mode: 'fixed',
              binding:
                model?.copilotId && model.model && model.modelType
                  ? {
                      copilotId: model.copilotId,
                      model: model.model,
                      modelType: model.modelType,
                      options: model.options
                    }
                  : null,
              available: !!model
            }
          : row
      )
    )
  }
  async editParameters(row: RoleDefaultSetting) {
    if (!row.binding) return
    const request = ++this.parameterRequest
    const binding = structuredClone(row.binding)
    const isCurrent = () => request === this.parameterRequest && this.editingRole() === row.role
    this.editingRole.set(row.role)
    this.parameterModel.set(binding)
    this.parametersLoading.set(true)
    this.parameterError.set('')
    this.rules.set([])
    try {
      const catalog = await firstValueFrom(this.server.getManagementCopilotModels(binding.modelType))
      if (!isCurrent()) return
      const connection = catalog.find((item) => item.id === binding.copilotId)
      if (!connection) throw new Error(this.translate.instant('XP.Copilot.Management.Unavailable'))
      const rules = await firstValueFrom(
        this.providers.getModelParameterRules(connection.modelProvider.id, binding.modelType, binding.model)
      )
      if (isCurrent()) this.rules.set(rules)
    } catch (error) {
      if (isCurrent()) this.parameterError.set(getErrorMessage(error))
    } finally {
      if (isCurrent()) this.parametersLoading.set(false)
    }
  }
  cancelParameters() {
    this.parameterRequest++
    this.editingRole.set(null)
    this.parametersLoading.set(false)
    this.rules.set([])
  }
  setParameter(name: string, value: unknown) {
    this.parameterModel.update((model) => ({ ...model, options: { ...model.options, [name]: value } }))
  }
  applyParameters() {
    if (this.parametersLoading() || this.parameterError() || this.resolvedParameters().missing.length) return
    this.setBinding(this.editingRole(), { ...this.parameterModel(), options: this.resolvedParameters().options })
    this.editingRole.set(null)
  }
  async save() {
    if (this.loading() || this.saving() || !this.settings().length) return
    const defaults: RoleDefaultInput[] = []
    for (const row of this.settings()) {
      if (row.mode === 'legacy') continue
      if (row.mode === 'fixed') {
        if (!row.binding) {
          this.error.set(this.translate.instant('XP.Copilot.Management.SelectDefault'))
          return
        }
        defaults.push({ role: row.role, mode: 'fixed', binding: row.binding })
      } else defaults.push({ role: row.role, mode: row.mode })
    }
    this.saving.set(true)
    this.error.set('')
    try {
      await firstValueFrom(this.server.saveRoleDefaults(defaults))
      this.dialog.close(true)
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }
}
