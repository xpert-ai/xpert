import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, DestroyRef, effect, inject, model, signal, viewChild } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { firstValueFrom, take } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  DocumentSourceProviderCategoryEnum,
  getErrorMessage,
  IIntegration,
  IKnowledgeDocument,
  KBDocumentCategoryEnum,
  KDocumentSourceType,
  KDocumentWebTypeEnum,
  KDocumentWebTypeOptions,
  KnowledgebaseService,
  KnowledgeDocumentService,
  IntegrationService,
  TKDocumentWebSchema,
  TRagWebOptions
} from '@cloud/app/@core'
import { JSONSchemaFormComponent, ParameterComponent } from '@cloud/app/@shared/forms'
import {
  XpI18nPipe,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { quickWebOptions, remoteSourceDocuments } from './import-model'

export type SourceDialogMode = 'url' | 'crawl' | 'remote'

@Component({
  standalone: true,
  selector: 'xp-document-import-source',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ...ZardFormImports,
    ZardInputDirective,
    ...ZardSelectImports,
    JSONSchemaFormComponent,
    ParameterComponent
  ],
  templateUrl: './source-dialog.component.html'
})
export class DocumentImportSourceDialogComponent {
  readonly mode = inject<SourceDialogMode>(DIALOG_DATA)
  readonly dialogRef = inject<DialogRef<Partial<IKnowledgeDocument>[]>>(DialogRef)
  readonly api = inject(KnowledgeDocumentService)
  readonly kbAPI = inject(KnowledgebaseService)
  readonly integrationAPI = inject(IntegrationService)
  readonly translate = inject(TranslateService)
  readonly prefix = 'XP.Knowledgebase.Import'
  readonly provider = model(KDocumentWebTypeEnum.Playwright)
  readonly providers = KDocumentWebTypeOptions
  readonly integrationId = model('')
  readonly integrations = signal<IIntegration[]>([])
  readonly params = model<NonNullable<TRagWebOptions['params']>>({})
  readonly schema = signal<TKDocumentWebSchema | null>(null)
  readonly remoteStrategies = signal<Awaited<ReturnType<typeof this.loadRemoteStrategies>>>([])
  readonly remoteProvider = model('')
  readonly remoteConfig = model<object>({})
  readonly remoteForm = viewChild(JSONSchemaFormComponent)
  readonly remoteStrategy = computed(() =>
    this.remoteStrategies().find((item) => item.meta.name === this.remoteProvider())
  )
  readonly busy = signal(false)
  readonly loadingSchema = signal(false)
  readonly error = signal('')
  readonly results = signal<Partial<IKnowledgeDocument>[]>([])
  readonly selected = signal<Set<number>>(new Set())
  readonly form = new FormGroup({
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^https?:\/\/\S+$/i)]
    })
  })
  readonly title = computed(
    () => this.prefix + (this.mode === 'url' ? '.ImportUrl' : this.mode === 'crawl' ? '.WebCrawl' : '.RemoteFiles')
  )
  readonly visibleParameters = computed(
    () =>
      this.schema()?.options.filter(
        (option) =>
          !option.when || Object.entries(option.when).every(([key, values]) => values.includes(this.params()[key]))
      ) ?? []
  )
  private revision = 0
  private requestRevision = 0
  private destroyed = false

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true
      this.revision++
    })
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.invalidateResults())
    effect(() => {
      const provider = this.provider()
      if (this.mode !== 'remote') void this.loadWebSchema(provider)
    })
    if (this.mode === 'remote') void this.initializeRemote()
  }

  private async loadRemoteStrategies() {
    const strategies = await firstValueFrom(this.kbAPI.getDocumentSourceStrategies().pipe(take(1)))
    return strategies.filter((item) => item.meta.category === DocumentSourceProviderCategoryEnum.FileSystem)
  }

  private async initializeRemote() {
    this.loadingSchema.set(true)
    try {
      const strategies = await this.loadRemoteStrategies()
      if (this.destroyed) return
      this.remoteStrategies.set(strategies)
      this.remoteProvider.set(strategies[0]?.meta.name ?? '')
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loadingSchema.set(false)
    }
  }

  async loadWebSchema(provider: KDocumentWebTypeEnum) {
    const revision = ++this.revision
    this.loadingSchema.set(true)
    this.error.set('')
    this.schema.set(null)
    this.integrations.set([])
    this.integrationId.set('')
    this.invalidateResults()
    try {
      const schema = await firstValueFrom(this.api.getWebOptions(provider).pipe(take(1)))
      const integrations = schema.integrationProvider
        ? (
            await firstValueFrom(
              this.integrationAPI.getAllInOrg({ where: { provider: schema.integrationProvider } }).pipe(take(1))
            )
          ).items
        : []
      if (revision !== this.revision || this.destroyed) return
      this.schema.set(schema)
      this.params.set(
        Object.fromEntries(
          schema.options.filter((option) => option.default !== undefined).map((option) => [option.name, option.default])
        )
      )
      this.integrations.set(integrations)
    } catch (error) {
      if (revision === this.revision && !this.destroyed) this.error.set(getErrorMessage(error))
    } finally {
      if (revision === this.revision && !this.destroyed) this.loadingSchema.set(false)
    }
  }

  invalidateResults() {
    this.requestRevision++
    this.results.set([])
    this.selected.set(new Set())
  }

  updateParam(name: string, value: unknown) {
    this.params.update((params) => ({ ...params, [name]: value }))
    this.invalidateResults()
  }

  changeRemoteProvider() {
    this.remoteConfig.set({})
    this.invalidateResults()
  }

  toggle(index: number, checked: boolean) {
    this.selected.update((current) => {
      const next = new Set(current)
      if (checked) next.add(index)
      else next.delete(index)
      return next
    })
  }

  async load() {
    if (this.busy() || this.loadingSchema()) return
    this.form.controls.url.setValue(this.form.controls.url.value.trim(), { emitEvent: false })
    if (this.mode !== 'remote' && this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    const strategy = this.remoteStrategy()
    if (this.mode === 'remote' && (!strategy || this.remoteForm()?.invalid)) return
    const integration = this.integrations().find((item) => item.id === this.integrationId())
    if (this.mode !== 'remote' && (!this.schema() || (this.schema()?.integrationProvider && !integration))) {
      this.error.set(this.translate.instant(this.prefix + '.ConfigureProvider'))
      return
    }
    this.busy.set(true)
    this.error.set('')
    this.invalidateResults()
    const requestRevision = this.requestRevision
    try {
      let documents: Partial<IKnowledgeDocument>[]
      if (this.mode === 'remote') {
        const result: unknown = await firstValueFrom(
          this.api.connect(strategy.meta.name, this.remoteConfig()).pipe(take(1))
        )
        try {
          documents = remoteSourceDocuments(result)
        } catch {
          throw new Error(this.translate.instant(this.prefix + '.InvalidRemoteResponse'))
        }
      } else {
        const options =
          this.mode === 'url'
            ? quickWebOptions(this.form.controls.url.value)
            : { url: this.form.controls.url.value.trim(), params: this.params() }
        const result = await firstValueFrom(
          this.api.loadRagWebPages(this.provider(), options, integration).pipe(take(1))
        )
        documents = result.docs.map((page) => ({
          name: page.metadata?.title || page.metadata?.url || options.url,
          sourceType: KDocumentSourceType.WebCrawl,
          category: KBDocumentCategoryEnum.Text,
          type: 'html',
          options,
          metadata: { url: page.metadata?.url || options.url },
          pages: [page]
        }))
      }
      if (this.destroyed || requestRevision !== this.requestRevision) return
      if (!documents.length) {
        this.error.set(this.translate.instant(this.prefix + '.NoResults'))
      } else if (this.mode === 'url') {
        this.dialogRef.close(documents)
      } else {
        this.results.set(documents)
        this.selected.set(new Set(documents.map((_, index) => index)))
      }
    } catch (error) {
      if (!this.destroyed) this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  confirm() {
    const documents = this.results().filter((_, index) => this.selected().has(index))
    if (documents.length && !this.busy()) this.dialogRef.close(documents)
  }
}
