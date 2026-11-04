import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ConnectionImpact, ConnectionImpactReference, ICopilot } from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { CopilotServerService, getErrorMessage } from '../../../@core'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, ...XpDialogFrameImports, ZardButtonComponent, ZardInputDirective],
  templateUrl: './connection-impact.component.html'
})
export class ConnectionImpactDialogComponent {
  readonly data = inject<ICopilot>(DIALOG_DATA)
  readonly dialog = inject(DialogRef<boolean>)
  readonly server = inject(CopilotServerService)
  readonly loading = signal(true)
  readonly error = signal('')
  readonly references = signal<ConnectionImpact | null>(null)
  readonly search = signal('')
  readonly limit = signal(20)
  readonly addPage = (count: number) => count + 20
  readonly groups = computed(() => {
    const query = this.search().trim().toLocaleLowerCase()
    const rows = (this.references()?.references ?? []).filter(
      (row) =>
        !query ||
        [row.resourceName, row.resourceId, row.organizationId, row.model, row.modelType, row.field, row.version].some(
          (value) => value?.toLocaleLowerCase().includes(query)
        )
    )
    return ['defaults', 'current', 'historical', 'unresolved'].map((key) => {
      const matching = rows.filter((row) => this.group(row) === key)
      return { key, count: matching.length, rows: matching.slice(0, this.limit()) }
    })
  })
  constructor() {
    void this.load()
  }
  group(row: ConnectionImpactReference) {
    return row.evidence === 'default'
      ? 'defaults'
      : row.evidence !== 'relation'
        ? 'unresolved'
        : row.status === 'historical'
          ? 'historical'
          : 'current'
  }
  confirm() {
    if (!this.loading() && this.references() && !this.references().defaults) this.dialog.close(true)
  }
  async load() {
    this.loading.set(true)
    this.error.set('')
    this.references.set(null)
    try {
      this.references.set(await firstValueFrom(this.server.getConnectionReferences(this.data.id)))
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
}
