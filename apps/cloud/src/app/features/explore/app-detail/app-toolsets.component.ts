import { Dialog } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject, input, model, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  IXpertToolset,
  PluginApplicationSetupInput,
  PluginApplicationToolsetRequirement,
  PluginApplicationToolsetSelection
} from '@xpert-ai/contracts'
import { XpI18nPipe, ZardButtonComponent, ZardSelectImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, injectToastr, PluginApplicationService, XpertToolsetService } from '@cloud/app/@core'

@Component({
  standalone: true,
  selector: 'xp-application-toolsets',
  imports: [FormsModule, TranslateModule, XpI18nPipe, ZardButtonComponent, ...ZardSelectImports],
  templateUrl: './app-toolsets.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApplicationToolsetsComponent {
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly #applications = inject(PluginApplicationService)
  readonly #toolsets = inject(XpertToolsetService)
  readonly #translate = inject(TranslateService)
  readonly application = input.required<PluginApplicationSetupInput>()
  readonly editable = input(false)
  readonly requirements = input<PluginApplicationToolsetRequirement[]>([])
  readonly disabled = input(false)
  readonly selections = model<PluginApplicationToolsetSelection[]>([])
  readonly refresh = output<void>()
  readonly configuring = model(false)

  selected(key: string) {
    return this.selections().find((item) => item.key === key)?.toolsetId ?? ''
  }

  select(key: string, toolsetId: string) {
    this.selections.update((items) => [...items.filter((item) => item.key !== key), { key, toolsetId }])
  }

  async configure(requirement: PluginApplicationToolsetRequirement) {
    if (this.disabled() || this.configuring() || !requirement.providerAvailable) return
    this.configuring.set(true)
    try {
      const { pluginName, appName } = this.application()
      const app = { pluginName, appName }
      const prepared = await firstValueFrom(this.#applications.prepare(app))
      if (!prepared.workspaceId || !['configuring', 'failed', 'degraded'].includes(prepared.status)) {
        throw new Error(this.#translate.instant('XP.Explore.Application.Toolsets.SetupChanged'))
      }
      const toolset = requirement.configuredToolsetId
        ? await firstValueFrom(this.#toolsets.getById(requirement.configuredToolsetId, { relations: ['tools'] }))
        : undefined
      const { XpertToolConfigureBuiltinComponent } =
        await import('../../xpert/tools/builtin/configure/configure.component')
      const result = await firstValueFrom(
        this.#dialog.open<IXpertToolset | boolean>(XpertToolConfigureBuiltinComponent, {
          disableClose: true,
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          data: {
            providerName: requirement.provider,
            workspaceId: prepared.workspaceId,
            toolset,
            tools: toolset?.tools
          }
        }).closed
      )
      if (result && typeof result === 'object' && result.id) {
        // Repair keeps the published graph's managed IDs; a replacement is only a source until activation.
        if (prepared.canDiscardConfiguration) {
          await firstValueFrom(this.#applications.bindToolset({ ...app, key: requirement.key, toolsetId: result.id }))
        }
        this.select(requirement.key, result.id)
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.configuring.set(false)
      this.refresh.emit()
    }
  }
}
