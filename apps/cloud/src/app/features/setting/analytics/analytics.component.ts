import {
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef
} from '@angular/core'
import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog'
import { RouterLink } from '@angular/router'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardAlertComponent,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardEmptyComponent,
  ZardFormFieldComponent,
  ZardFormLabelComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectComponent,
  ZardSelectItemComponent,
  XpDialogFrameImports
} from '@xpert-ai/headless-ui'
import type {
  AnalyticsConfigurableProvider,
  AnalyticsDefinitionCreate,
  AnalyticsSourceSummary,
  IAnalyticsDefinition,
  IAnalyticsDefinitionVersion,
  JSONValue
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { AnalyticsDefinitionsService } from '../../../@core/services/analytics-definitions.service'
import { injectToastr } from '../../../@core/services/toastr.service'
import { getErrorMessage } from '../../../@core/types'
import { JSONSchemaFormComponent } from '../../../@shared/forms/json-schema-form/form.component'
import { jsonObject, toJsonSchemaFormSchema } from '../../../@shared/forms/json-schema-form/schema'

@Component({
  standalone: true,
  selector: 'xp-analytics-settings',
  imports: [
    ReactiveFormsModule,
    DialogModule,
    FormsModule,
    TranslateModule,
    RouterLink,
    ZardButtonComponent,
    ZardInputDirective,
    JSONSchemaFormComponent,
    ZardAlertComponent,
    ZardBadgeComponent,
    ZardEmptyComponent,
    ZardFormFieldComponent,
    ZardFormLabelComponent,
    ZardIconComponent,
    ZardSelectComponent,
    ZardSelectItemComponent,
    ...XpDialogFrameImports
  ],
  templateUrl: './analytics.component.html'
})
export class AnalyticsSettingsComponent implements OnInit {
  private readonly api = inject(AnalyticsDefinitionsService)
  private readonly toast = injectToastr()
  private readonly clipboard = inject(Clipboard)
  private readonly dialog = inject(Dialog)
  private readonly viewContainerRef = inject(ViewContainerRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly configurationDialog = viewChild.required<TemplateRef<unknown>>('configurationDialog')
  private dialogRef?: DialogRef<void>
  readonly providers = signal<AnalyticsConfigurableProvider[]>([])
  readonly definitions = signal<IAnalyticsDefinition[]>([])
  readonly artifacts = signal<AnalyticsSourceSummary[]>([])
  readonly history = signal<Omit<IAnalyticsDefinitionVersion, 'options'>[]>([])
  readonly selected = signal<IAnalyticsDefinition | null>(null)
  readonly selectedVersion = signal<string | null>(null)
  readonly provider = signal<AnalyticsConfigurableProvider | null>(null)
  readonly artifactConfiguration = computed(() => {
    const config = this.provider()?.configuration
    return config?.kind === 'artifact' ? config : null
  })
  readonly providerArtifacts = computed(() =>
    this.artifacts().filter((item) => item.providers.some((provider) => provider.id === this.provider()?.descriptor.id))
  )
  readonly schema = computed(() => {
    const config = this.provider()?.configuration
    return config?.kind === 'definition' ? toJsonSchemaFormSchema(config.schema) : null
  })
  readonly schemaForm = viewChild(JSONSchemaFormComponent)
  readonly editorValid = computed(() => !this.schemaForm()?.invalid)
  readonly loading = signal(false)
  readonly editing = signal(false)
  readonly advanced = signal(false)
  readonly page = signal(1)
  readonly total = signal(0)
  readonly historyPage = signal(1)
  readonly historyTotal = signal(0)
  readonly search = signal('')
  readonly filtered = computed(() =>
    this.definitions().filter((item) => item.name.toLowerCase().includes(this.search().toLowerCase()))
  )
  readonly options = signal<Record<string, JSONValue>>({})
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    visibility: new FormControl<'private' | 'organization'>('private', { nonNullable: true }),
    json: new FormControl('{}', {
      nonNullable: true,
      validators: [
        (control) => {
          try {
            return jsonObject(JSON.parse(control.value)) ? null : { json: true }
          } catch {
            return { json: true }
          }
        }
      ]
    })
  })
  constructor() {
    this.destroyRef.onDestroy(() => this.closeConfiguration())
  }
  ngOnInit() {
    void this.reload()
  }
  async reload() {
    await this.run(async () => {
      const [providers, records, sources] = await Promise.all([
        firstValueFrom(this.api.providers()),
        firstValueFrom(this.api.list(this.page())),
        firstValueFrom(this.api.sources())
      ])
      this.providers.set(providers)
      this.definitions.set(records.items)
      this.total.set(records.total)
      this.artifacts.set(sources.filter((item) => item.source.kind === 'artifact'))
    })
  }
  async next(offset: number) {
    this.page.update((page) => page + offset)
    await this.reload()
  }
  async edit(definition: IAnalyticsDefinition, versionId = definition.currentVersionId) {
    if (!versionId) return
    const opening = !this.dialogRef
    await this.run(async () => {
      const saved = await firstValueFrom(this.api.version(definition.id, versionId))
      this.selected.set(saved.definition)
      this.selectedVersion.set(saved.version.id)
      this.provider.set(this.providers().find((item) => item.descriptor.id === definition.providerId) ?? null)
      this.form.reset({
        name: definition.name,
        visibility: definition.visibility,
        json: JSON.stringify(saved.version.options, null, 2)
      })
      this.options.set(saved.version.options)
      this.editing.set(true)
      this.advanced.set(false)
      this.historyPage.set(1)
      await this.loadHistory()
      if (opening && !this.dialogRef && !this.destroyRef.destroyed) {
        this.dialogRef = this.dialog.open<void>(this.configurationDialog(), {
          viewContainerRef: this.viewContainerRef,
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          maxWidth: 'calc(100vw - 32px)',
          ariaLabelledBy: 'analytics-configuration-title',
          autoFocus: 'dialog'
        })
        this.dialogRef.closed.subscribe(() => {
          this.dialogRef = undefined
          this.editing.set(false)
        })
      }
    })
  }
  closeConfiguration() {
    this.dialogRef?.close()
  }
  updateOptions(value: unknown) {
    if (jsonObject(value)) {
      this.options.set(value)
      this.form.controls.json.setValue(JSON.stringify(value, null, 2))
    }
  }
  toggleAdvanced() {
    if (this.advanced()) {
      if (this.form.controls.json.invalid) return
      this.options.set(JSON.parse(this.form.controls.json.value))
    }
    this.advanced.update((value) => !value)
  }
  input(): AnalyticsDefinitionCreate | null {
    this.form.markAllAsTouched()
    const provider = this.provider()
    if (
      this.form.invalid ||
      (!this.advanced() && !this.editorValid()) ||
      !provider ||
      provider.configuration.kind !== 'definition'
    )
      return null
    return {
      name: this.form.controls.name.value,
      visibility: this.form.controls.visibility.value,
      providerId: provider.descriptor.id,
      options: JSON.parse(this.form.controls.json.value)
    }
  }
  async validate() {
    const input = this.input()
    if (input)
      await this.run(async () => {
        const result = await firstValueFrom(this.api.validate(input))
        this.updateOptions(result.options)
        this.toast.success('XP.Analytics.Valid')
      })
  }
  async save() {
    const input = this.input()
    if (!input || !this.selected()) return
    let saved = false
    await this.run(async () => {
      const selected = this.selected()
      const result = await firstValueFrom(
        this.api.publish(selected!.id, {
          expectedCurrentVersionId: selected!.currentVersionId!,
          options: input.options,
          visibility: input.visibility
        })
      )
      this.selected.set(result.definition)
      this.selectedVersion.set(result.version.id)
      this.updateOptions(result.version.options)
      this.closeConfiguration()
      saved = true
      this.toast.success('XP.Analytics.Published')
    })
    if (saved) await this.reload()
  }
  async status(item: IAnalyticsDefinition) {
    await this.run(async () => {
      await firstValueFrom(this.api.status(item.id, item.status === 'active' ? 'archived' : 'active'))
    })
    await this.reload()
  }
  async loadHistory(offset = 0) {
    const selected = this.selected()
    if (!selected) return
    this.historyPage.update((page) => page + offset)
    const result = await firstValueFrom(this.api.history(selected.id, this.historyPage()))
    this.history.set(result.items)
    this.historyTotal.set(result.total)
  }
  async nextHistory(offset: number) {
    await this.run(() => this.loadHistory(offset))
  }
  copySource() {
    const definition = this.selected(),
      versionId = this.selectedVersion()
    if (definition && versionId)
      this.clipboard.copy(JSON.stringify({ kind: 'definition', definitionId: definition.id, versionId }))
  }
  copyArtifact(item: AnalyticsSourceSummary) {
    this.clipboard.copy(JSON.stringify(item.source))
  }
  async run(action: () => Promise<void>) {
    if (this.loading()) return
    this.loading.set(true)
    try {
      await action()
    } catch (error) {
      this.toast.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
}
