import { ZardTableImports, ZardCheckboxComponent } from '@xpert-ai/headless-ui'
import { ZardSelectImports } from '@xpert-ai/headless-ui'
import { DialogRef } from '@angular/cdk/dialog'
import { HttpClient } from '@angular/common/http'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  ICopilotModel,
  IXpertWorkspace,
  ModelReplacementInput,
  ModelReplacementPreview,
  ModelReplacementResult,
  ModelReplacementSource,
  modelReplacementSchema
} from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, XpertWorkspaceService } from '../../../../@core'
import { API_XPERT_ROLE } from '../../../../@core/constants/app.constants'
import { CopilotModelSelectComponent } from '../../../../@shared/copilot/copilot-model-select/select.component'

@Component({
  standalone: true,
  selector: 'xp-model-replacement-dialog',
  imports: [
    ...ZardTableImports,
    ZardCheckboxComponent,
    ...ZardSelectImports,
    FormsModule,
    TranslateModule,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardInputDirective,
    CopilotModelSelectComponent
  ],
  templateUrl: './replacement.component.html'
})
export class ModelReplacementDialogComponent {
  readonly dialog = inject(DialogRef<boolean>)
  readonly http = inject(HttpClient)
  readonly workspaces = signal<IXpertWorkspace[]>([])
  readonly workspaceId = signal('')
  readonly workspaceService = inject(XpertWorkspaceService)
  constructor() {
    firstValueFrom(this.workspaceService.getAllMy(undefined, { purpose: 'authoring' }))
      .then((result) => this.workspaces.set(result.items.filter((item) => this.workspaceService.canWrite(item))))
      .catch((error) => this.error.set(getErrorMessage(error)))
    void this.loadSources()
  }
  readonly type = AiModelTypeEnum.LLM
  readonly expanded = signal(new Set<string>())
  readonly identityKey = (model: Partial<ICopilotModel> | null) =>
    model ? JSON.stringify([model.copilotId, model.modelType, model.model]) : ''
  readonly sourceKey = computed(() => this.identityKey(this.source()))
  chooseSource(key: string) {
    this.source.set(this.sources().find((row) => this.identityKey(row.identity) === key)?.identity ?? null)
    this.reset()
  }
  toggleDetails(id: string) {
    this.expanded.update((value) => {
      const next = new Set(value)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  readonly source = signal<ICopilotModel | null>(null)
  readonly sources = signal<ModelReplacementSource[]>([])
  readonly sourceSearch = signal('')
  readonly sourcesLoading = signal(false)
  readonly filteredSources = computed(() =>
    this.sources().filter((row) =>
      `${row.identity.model} ${row.identity.copilotId}`.toLowerCase().includes(this.sourceSearch().trim().toLowerCase())
    )
  )
  readonly target = signal<ICopilotModel | null>(null)
  readonly policy = signal<'reset' | 'compatible'>('reset')
  readonly busy = signal(false)
  readonly error = signal('')
  readonly preview = signal<ModelReplacementPreview[] | null>(null)
  readonly selected = signal(new Set<string>())
  readonly results = signal<ModelReplacementResult[] | null>(null)
  readonly changes = computed(
    () =>
      this.preview()
        ?.filter((row) => this.selected().has(row.id))
        .reduce((sum, row) => sum + row.count, 0) ?? 0
  )
  private request: ModelReplacementInput | null = null
  private readonly url = `${API_XPERT_ROLE}/model-replacement`
  async loadSources() {
    this.reset()
    this.source.set(null)
    this.sourcesLoading.set(true)
    this.error.set('')
    try {
      this.sources.set(
        await firstValueFrom(
          this.http.post<ModelReplacementSource[]>(
            `${this.url}/sources`,
            this.workspaceId() ? { workspaceId: this.workspaceId() } : {}
          )
        )
      )
    } catch (error) {
      this.sources.set([])
      this.error.set(getErrorMessage(error))
    } finally {
      this.sourcesLoading.set(false)
    }
  }
  reset() {
    this.expanded.set(new Set())
    this.preview.set(null)
    this.results.set(null)
    this.request = null
  }
  toggle(id: string, checked: boolean) {
    this.selected.update((value) => {
      const next = new Set(value)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }
  async inspect() {
    const source = this.source(),
      target = this.target()
    const input = modelReplacementSchema.safeParse({
      source: { copilotId: source?.copilotId, model: source?.model, modelType: source?.modelType },
      target: { copilotId: target?.copilotId, model: target?.model, modelType: target?.modelType },
      policy: this.policy(),
      ...(this.workspaceId() ? { workspaceId: this.workspaceId() } : {})
    })
    if (!input.success) return
    this.busy.set(true)
    this.error.set('')
    try {
      this.request = input.data
      const rows = await firstValueFrom(this.http.post<ModelReplacementPreview[]>(`${this.url}/preview`, input.data))
      this.preview.set(rows)
      this.selected.set(
        new Set(
          rows
            .filter((row) => !row.missing.length)
            .slice(0, 100)
            .map((row) => row.id)
        )
      )
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
  async execute() {
    if (!this.request || this.busy() || !this.selected().size || this.selected().size > 100) return
    this.busy.set(true)
    this.error.set('')
    try {
      this.results.set(
        await firstValueFrom(
          this.http.post<ModelReplacementResult[]>(`${this.url}/execute`, {
            input: this.request,
            selections: this.preview()
              .filter((row) => this.selected().has(row.id))
              .map(({ id, revision }) => ({ id, revision }))
          })
        )
      )
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
  async restore(result: ModelReplacementResult) {
    this.busy.set(true)
    this.error.set('')
    try {
      await firstValueFrom(this.http.post(`${this.url}/${result.operationId}/restore`, {}))
      this.results.update((rows) =>
        rows.map((row) => (row === result ? { ...row, operationId: undefined, status: 'restored' } : row))
      )
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
  name(id: string) {
    return this.preview()?.find((row) => row.id === id)?.name ?? id
  }
  close() {
    this.dialog.close(!!this.results())
  }
}
