import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog'
import { HttpClient } from '@angular/common/http'
import { Component, DestroyRef, HostListener, inject, signal, viewChild } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import type { XpertExtensionViewManifest, XpertViewQuery } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { API_XPERT_PROJECT } from '../../@core/constants/app.constants'
import { injectViewExtensionApi } from '../../@core'
import { ViewClientCommandRegistry } from '../view-extension/view-client-command-registry.service'
import { RemoteComponentRendererComponent } from '../view-extension/renderers/remote-component-renderer.component'

type FileNavigation = { viewKey: string; selectionId?: string; parameters?: XpertViewQuery['parameters'] }
/** Project file UI delegates all presentation semantics and persistence to the installed editor. */
@Component({
  standalone: true,
  selector: 'xp-plugin-file-editor',
  imports: [TranslateModule, ZardButtonComponent, RemoteComponentRendererComponent],
  providers: [ViewClientCommandRegistry],
  host: { class: 'flex h-full w-full flex-col overflow-hidden rounded-2xl bg-background text-foreground' },
  template: `
    <header class="flex shrink-0 items-center justify-between border-b px-4 py-2">
      <span class="truncate text-sm">{{ data.path }}</span>
      <button z-button zType="ghost" (click)="close()" [disabled]="closing()">
        {{ 'Common.Close' | translate: { Default: 'Close' } }}
      </button>
    </header>
    @if (error()) {
      <p role="alert" class="p-6 text-destructive">
        {{
          'XP.Files.PluginEditorUnavailable'
            | translate: { Default: 'Unable to open the file editor. Check plugin availability and Project access.' }
        }}
      </p>
    }
    @if (manifest(); as view) {
      <xp-remote-component-renderer
        class="min-h-0 flex-1"
        hostType="project"
        [hostId]="data.projectId"
        [manifest]="view"
        [query]="query()"
        [runtimeScope]="scope"
        [fillAvailableHeight]="true"
      />
    }
  `
})
export class PluginFileEditorComponent {
  readonly data = inject<{ projectId: string; path: string }>(DIALOG_DATA)
  readonly scope = { projectId: this.data.projectId }
  private readonly dialog = inject(DialogRef)
  private readonly http = inject(HttpClient)
  private readonly api = injectViewExtensionApi()
  private readonly registry = inject(ViewClientCommandRegistry)
  private readonly destroy = inject(DestroyRef)
  readonly frame = viewChild(RemoteComponentRendererComponent)
  readonly manifest = signal<XpertExtensionViewManifest | null>(null)
  readonly query = signal<XpertViewQuery>({})
  readonly error = signal(false)
  readonly closing = signal(false)
  private dirty = false
  private alive = true
  constructor() {
    const unregister = this.registry.register('workbench.content.status', (payload, context) => {
      if (
        context.hostId !== this.data.projectId ||
        context.viewKey !== this.manifest()?.key ||
        !payload ||
        typeof payload !== 'object' ||
        !('resourceId' in payload) ||
        payload.resourceId !== this.query().selectionId ||
        !('dirty' in payload) ||
        typeof payload.dirty !== 'boolean'
      )
        return { success: false, code: 'stale_context' }
      this.dirty = payload.dirty
      return { success: true }
    })
    this.destroy.onDestroy(() => {
      this.alive = false
      unregister()
    })
    void this.load()
  }
  private async load() {
    try {
      const navigation = await firstValueFrom(
        this.http.post<FileNavigation>(
          `${API_XPERT_PROJECT}/${encodeURIComponent(this.data.projectId)}/content-files/open`,
          { path: this.data.path }
        )
      )
      const views = await firstValueFrom(
        this.api.getSlotViews('project', this.data.projectId, 'project.files.editor', { runtimeScope: this.scope })
      )
      if (!this.alive) return
      const manifest = views.find((view) => view.key === navigation.viewKey && this.registry.supportsView(view))
      if (!manifest || !navigation.selectionId) throw new Error('Editor unavailable')
      this.query.set({ selectionId: navigation.selectionId, parameters: navigation.parameters })
      this.manifest.set(manifest)
    } catch {
      if (this.alive) this.error.set(true)
    }
  }
  async close() {
    this.closing.set(true)
    try {
      if (!this.dirty || (await this.frame()?.prepareEditorClose(this.query().selectionId!))) this.dialog.close()
    } finally {
      this.closing.set(false)
    }
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.dirty) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
}
