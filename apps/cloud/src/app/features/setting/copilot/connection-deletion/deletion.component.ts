import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { CONNECTION_REFERENCE_KINDS, ConnectionDeletionImpact, ICopilot } from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { CopilotServerService, getErrorMessage } from '../../../../@core'

@Component({
  standalone: true,
  imports: [TranslateModule, ...XpDialogFrameImports, ZardButtonComponent],
  templateUrl: './deletion.component.html'
})
export class ConnectionDeletionDialogComponent {
  readonly data = inject<ICopilot>(DIALOG_DATA)
  readonly dialog = inject(DialogRef<boolean>)
  readonly server = inject(CopilotServerService)
  readonly loading = signal(true)
  readonly deleting = signal(false)
  readonly error = signal('')
  readonly impact = signal<ConnectionDeletionImpact | null>(null)
  private loadVersion = 0
  readonly references = computed(() =>
    CONNECTION_REFERENCE_KINDS.map((kind) => ({ kind, count: this.impact()?.references[kind] ?? 0 })).filter(
      (reference) => reference.count > 0
    )
  )

  constructor() {
    void this.load()
  }

  async load() {
    const version = ++this.loadVersion
    this.loading.set(true)
    this.error.set('')
    this.impact.set(null)
    try {
      const impact = await firstValueFrom(this.server.getConnectionDeletionImpact(this.data.id))
      if (version === this.loadVersion) this.impact.set(impact)
    } catch (error) {
      if (version === this.loadVersion) this.error.set(getErrorMessage(error))
    } finally {
      if (version === this.loadVersion) this.loading.set(false)
    }
  }

  async remove() {
    if (this.loading() || this.deleting() || !this.impact()?.canDelete) return
    this.deleting.set(true)
    this.dialog.disableClose = true
    this.error.set('')
    try {
      await firstValueFrom(this.server.deleteConnection(this.data.id))
      this.dialog.close(true)
    } catch (error) {
      await this.load()
      this.error.set(getErrorMessage(error))
    } finally {
      this.deleting.set(false)
      this.dialog.disableClose = false
    }
  }
}
