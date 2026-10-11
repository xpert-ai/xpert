import {
  XpDialogFrameImports,
  ZardButtonComponent,
  XpDialogActionGroupDirective,
  ZardInputDirective,
  ZardTooltipImports,
  XpI18nPipe
} from '@xpert-ai/headless-ui'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { TranslateModule } from '@ngx-translate/core'
import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog'

import { DragDropModule } from '@angular/cdk/drag-drop'
import {
  getErrorMessage,
  IAiProviderEntity,
  ICopilot,
  injectAiProviders,
  injectCopilotServer,
  injectCopilotProviderService,
  injectHelpWebsite,
  ToastrService
} from '../../../@core'
import { CopilotAiProviderAuthComponent } from '../provider-authorization/authorization.component'
@Component({
  standalone: true,
  selector: 'copilot-ai-providers-dialog',
  templateUrl: './providers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...XpDialogFrameImports,
    ZardButtonComponent,
    XpDialogActionGroupDirective,
    CommonModule,
    FormsModule,
    TranslateModule,
    DragDropModule,
    ZardInputDirective,
    ...ZardTooltipImports,
    XpI18nPipe
  ]
})
export class CopilotAiProvidersComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #dialog = inject(Dialog)
  readonly #data = inject<{ copilot: ICopilot }>(DIALOG_DATA)
  readonly #toastr = inject(ToastrService)
  readonly #copilotServer = injectCopilotServer()
  readonly #copilotProviderService = injectCopilotProviderService()
  readonly aiProviders = injectAiProviders()
  readonly helpBaseUrl = injectHelpWebsite()

  readonly copilot = signal(this.#data.copilot)

  readonly loading = signal(false)
  readonly refreshing = signal(false)
  readonly busy = computed(() => this.loading() || this.refreshing())

  cancel() {
    this.#dialogRef.close()
  }

  apply() {}

  async refreshProviders() {
    if (this.refreshing()) {
      return
    }

    this.refreshing.set(true)
    try {
      await this.#copilotServer.refreshAiProviders()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.refreshing.set(false)
    }
  }

  openSetup(provider: IAiProviderEntity) {
    this.#dialog
      .open(CopilotAiProviderAuthComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        data: {
          provider: provider,
          copilot: this.copilot()
        }
      })
      .closed.subscribe({
        next: (copilotProvider) => {
          if (copilotProvider) {
            this.#dialogRef.close(copilotProvider)
          }
        },
        error: (err) => {}
      })
  }

  addProvider(provider: IAiProviderEntity) {
    this.loading.set(true)
    this.#copilotProviderService
      .create({
        copilotId: this.copilot().id,
        providerName: provider.provider
      })
      .subscribe({
        next: (copilotProvider) => {
          this.loading.set(false)
          this.#toastr.success('XP.Messages.CreatedSuccessfully', { Default: 'Created successfully' })
          this.#dialogRef.close(copilotProvider)
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
