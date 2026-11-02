import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ICopilot } from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { CopilotServerService, getErrorMessage } from '../../../@core'

@Component({
  standalone: true,
  imports: [TranslateModule, ...XpDialogFrameImports, ZardButtonComponent],
  template: ` <section xpDialogLayout="standard" class="w-[min(560px,calc(100vw-32px))] max-h-[84dvh]">
    <header xpDialogHeader>
      <h2 xpDialogHeading>{{ 'XP.Copilot.Management.DisableConnection' | translate }}</h2>
      <p xpDialogDescription>{{ data.name || data.modelProvider?.providerName }}</p>
      <button
        xpDialogCloseButton
        z-button
        zType="ghost"
        zSize="icon"
        (click)="dialog.close()"
        [attr.aria-label]="'XP.ACTIONS.Close' | translate"
      >
        <z-icon zType="x" />
      </button>
    </header>
    <div xpDialogBody>
      <p class="text-sm text-muted-foreground">{{ 'XP.Copilot.Management.DisableImpact' | translate }}</p>
      @if (references(); as refs) {
        <dl class="divide-y divide-border text-sm">
          <div class="flex justify-between py-3">
            <dt>{{ 'XP.Copilot.Management.DefaultModels' | translate }}</dt>
            <dd>{{ refs.defaults }}</dd>
          </div>
          <div class="flex justify-between py-3">
            <dt>{{ 'XP.Copilot.Management.SavedBindings' | translate }}</dt>
            <dd>{{ refs.bindings }}</dd>
          </div>
          <div class="flex justify-between py-3">
            <dt>{{ 'XP.Copilot.Management.AssistantDrafts' | translate }}</dt>
            <dd>{{ refs.drafts }}</dd>
          </div>
        </dl>
        @if (refs.defaults) {
          <p role="alert" class="text-destructive">{{ 'XP.Copilot.Management.DefaultInUse' | translate }}</p>
        }
      }
      @if (loading()) {
        <p role="status">{{ 'XP.KEY_WORDS.Loading' | translate }}</p>
      }
      @if (error()) {
        <p role="alert" class="text-destructive">{{ error() }}</p>
        <button z-button zType="outline" (click)="load()">{{ 'XP.ACTIONS.Retry' | translate }}</button>
      }
    </div>
    <footer xpDialogFooter>
      <button z-button zType="outline" (click)="dialog.close()">{{ 'XP.ACTIONS.Cancel' | translate }}</button
      ><button
        z-button
        zType="destructive"
        [zDisabled]="loading() || !references() || !!references()?.defaults"
        (click)="dialog.close(true)"
      >
        {{ 'XP.Copilot.Management.DisableConnection' | translate }}
      </button>
    </footer>
  </section>`
})
export class ConnectionImpactDialogComponent {
  readonly data = inject<ICopilot>(DIALOG_DATA)
  readonly dialog = inject(DialogRef<boolean>)
  readonly server = inject(CopilotServerService)
  readonly loading = signal(true)
  readonly error = signal('')
  readonly references = signal<{ defaults: number; bindings: number; drafts: number } | null>(null)
  constructor() {
    void this.load()
  }
  async load() {
    this.loading.set(true)
    this.error.set('')
    try {
      this.references.set(await firstValueFrom(this.server.getConnectionReferences(this.data.id)))
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
}
