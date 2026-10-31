import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { Component, inject, input, output, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IAiProviderEntity, IPluginDescriptor } from '@xpert-ai/contracts'
import {
  XpDialogFrameImports,
  XpI18nPipe,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage } from '../../../../@core'
import { PluginAPIService } from '../../../../@core/state'
import { PluginRuntimeRestartService } from '../../plugins/plugin-runtime-restart.service'

@Component({
  standalone: true,
  selector: 'xp-provider-plugin-version',
  imports: [TranslateModule, ZardBadgeComponent, ZardButtonComponent],
  host: { class: 'inline-flex items-center gap-2' },
  template: `
    @if (source()?.version; as version) {
      <z-badge zType="outline" class="font-mono text-text-tertiary">{{ version }}</z-badge>
    }
    @if (plugin()?.canUpdate && plugin()?.hasUpdate) {
      <button z-button zType="outline" class="h-7 gap-1 text-primary" (click)="update()">
        <i class="ri-arrow-up-circle-line" aria-hidden="true"></i>{{ 'XP.ACTIONS.Update' | translate }}
      </button>
    }
  `
})
export class ProviderPluginVersionComponent {
  readonly #dialog = inject(Dialog)
  readonly source = input<IAiProviderEntity['plugin']>()
  readonly plugin = input<IPluginDescriptor>()
  readonly updated = output<void>()
  async update() {
    const plugin = this.plugin()
    if (!plugin?.canUpdate || !plugin.hasUpdate) return
    const result = await firstValueFrom(
      this.#dialog.open<boolean>(ProviderPluginUpdateDialogComponent, {
        data: plugin,
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true
      }).closed
    )
    if (result) this.updated.emit()
  }
}

@Component({
  standalone: true,
  imports: [TranslateModule, XpI18nPipe, ...XpDialogFrameImports, ZardButtonComponent, ZardIconComponent],
  template: `
    <section xpDialogLayout="standard" class="w-[min(520px,calc(100vw-32px))] max-h-[84dvh]">
      <header xpDialogHeader>
        <h2 xpDialogHeading>{{ 'XP.Copilot.Management.UpdatePlugin' | translate }}</h2>
        <p xpDialogDescription>{{ (data.meta?.displayName | i18n) || data.name }}</p>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          [zDisabled]="loading()"
          (click)="dialog.close()"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate"
        >
          <z-icon zType="x" />
        </button>
      </header>
      <div xpDialogBody>
        <p class="font-mono text-sm">{{ data.currentVersion }} → {{ data.latestVersion }}</p>
        <p class="mt-3 text-sm text-text-tertiary">{{ 'XP.Copilot.Management.UpdatePluginHint' | translate }}</p>
        @if (error()) {
          <p role="alert" class="mt-3 text-sm text-destructive">{{ error() }}</p>
        }
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" [zDisabled]="loading()" (click)="dialog.close()">
          {{ 'XP.ACTIONS.Cancel' | translate }}
        </button>
        <button z-button [zLoading]="loading()" [zDisabled]="loading()" (click)="update()">
          {{ 'XP.ACTIONS.Update' | translate }}
        </button>
      </footer>
    </section>
  `
})
export class ProviderPluginUpdateDialogComponent {
  readonly data = inject<IPluginDescriptor>(DIALOG_DATA)
  readonly dialog = inject(DialogRef<boolean>)
  readonly #api = inject(PluginAPIService)
  readonly #runtime = inject(PluginRuntimeRestartService)
  readonly loading = signal(false)
  readonly error = signal('')
  async update() {
    if (this.loading() || !this.data.canUpdate || !this.data.hasUpdate) return
    this.loading.set(true)
    this.error.set('')
    try {
      const result = await firstValueFrom(this.#api.update(this.data.name))
      if (result.runtimeConvergence)
        this.#runtime.trackPluginConvergence(
          result.runtimeConvergence,
          this.data.name,
          result.runtimeRequirements ?? []
        )
      if (result.restartRequired) this.#runtime.markRequired(this.data.name, result.runtimeRequirements)
      this.dialog.close(true)
      if (result.restartRequired) void this.#runtime.prompt()
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
}
